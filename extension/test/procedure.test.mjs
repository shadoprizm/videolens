import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {indexedDB} from 'fake-indexeddb';
const load=async entry=>{const b=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'browser'});return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);};
const [p,render,analyze,vision,library,cloud,report]=await Promise.all(['src/lib/procedure.ts','src/lib/procedureReport.ts','src/lib/analyze.ts','src/lib/describeProcedureFrames.ts','src/lib/reportLibrary.ts','../site/cloud-report.ts','src/lib/report.ts'].map(load));
const fixture=()=>JSON.parse(readFileSync('test/fixtures/procedure.json','utf8'));
const response=v=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(v)}}]}));
test('caption-guided sampling covers the whole video and bounds malformed cues',()=>{
 const base=p.procedureFrameTimestamps(1200),guided=p.procedureFrameTimestamps(1200,{segments:[{start:31.1,end:32.9,text:'Paste the command'},{start:900.1,end:901.9,text:'Select the option'},{start:-9,end:0,text:'click'},{start:NaN,end:Infinity,text:'select'}]});
 assert.equal(base.length,120); assert.ok(guided.length<=120);assert.ok(guided.includes(31.1));assert.ok(guided.includes(901.65));assert.ok(guided.at(-1)>1100);assert.ok(guided.every((t,i)=>t>=0&&t<1200&&(!i||t>guided[i-1])));
 for(const d of [0,-1,NaN,Infinity])assert.throws(()=>p.procedureFrameTimestamps(d));
 assert.ok(p.procedureFrameTimestamps(.02).every(t=>t<.02));
});
test('unsupported exact values become unknown and inference needs a rationale',()=>{
 const f=fixture();const s=f.procedure.steps[0];s.details[0].value={value:'invented command',basis:'inferred',timestamps:[0],note:'Looks plausible'};
 s.action.timestamps=[999,-1,Infinity];s.check.note='';
 const n=p.normalizeProcedure(f.procedure,30,f.timeline);
 assert.equal(n.steps[0].action.value,null);assert.equal(n.steps[0].details[0].value.value,null);assert.equal(n.steps[0].check.value,null);assert.equal(n.steps[1].action.basis,'video');
 f.procedure.steps.forEach(s=>s.action.timestamps=[999]);assert.equal(p.normalizeProcedure(f.procedure,30,f.timeline),undefined);
});
test('citations must overlap available evidence when a timeline is supplied',()=>{
 const f=fixture();f.timeline.segments=[{start:10,end:20}];const n=p.normalizeProcedure(f.procedure,30,f.timeline);assert.equal(n.steps[0].action.value,null);assert.equal(n.steps[1].action.value,'Enter the choices and save.');
});
test('tutorial synthesis and follow-up retain source limitations and uncertainty',async()=>{
 const f=fixture(),original=globalThis.fetch;let body;
 globalThis.fetch=async(_u,i)=>{body=JSON.parse(i.body);return response(f);};
 try{const a=await analyze.analyzeTimeline({kind:'byok',apiKey:'test'},f.timeline,f.source,'tutorial',f.prompt,'en');assert.deepEqual(a.procedure,f.procedure);assert.ok(a.limitations.includes(f.source.limitations[0]));assert.match(body.messages[0].content,/Do not invent commands/);
 await analyze.askQuestion({kind:'byok',apiKey:'test'},'What is missing?',f.timeline,a);assert.match(body.messages[1].content,/Sharing permission is not shown/);
 globalThis.fetch=async()=>response({procedure:null});await assert.rejects(analyze.analyzeTimeline({kind:'byok',apiKey:'test'},f.timeline,f.source,'tutorial',f.prompt),/No usable software procedure/);
 }finally{globalThis.fetch=original;}
});
test('software vision matches supplied timestamps and retries missing observations',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async(_u,i)=>{calls++;const parts=JSON.parse(i.body).messages[1].content;const times=parts.filter(p=>p.type==='text'&&p.text.startsWith('Frame at')).map(p=>Number(p.text.split(' ')[2]));return response({frames:[...times.slice(calls===1?1:0).map(timestamp=>({timestamp,visual_summary:'Settings',extracted_text:['retry = 3'],confidence:'high'})),{timestamp:999,visual_summary:'Invented'}]});};
 try{const r=await vision.describeProcedureFrames({kind:'byok',apiKey:'test'},[0,1,2].map(timestamp=>({timestamp,dataUrl:'test'})),()=>{});assert.equal(calls,2);assert.deepEqual(r.map(f=>f.timestamp),[0,1,2]);assert.deepEqual(r[0].extractedText,['retry = 3']);}finally{globalThis.fetch=original;}
});
test('procedure renders safe links, multiline values, unknowns and accessible checklists in all readers',()=>{
 const f=fixture();f.procedure.title='<img src=x onerror=alert(1)>';
 const html=render.procedureHtml(f.procedure,'en',f.source.url,30);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<script/);assert.match(html,/watch\?v=procedure-test&amp;t=10s/);assert.equal((html.match(/type="checkbox"/g)||[]).length,2);assert.match(html,/Suggested · verify/);
 assert.equal(render.procedureTimestampUrl('https://youtube.com.attacker.test/x',1),null);assert.equal(render.procedureTimestampUrl('javascript:alert(1)',1),null);
 const r={id:'test',title:'Test',mode:'tutorial',report_data:f,created_at:'2026-09-17',completed_at:null};assert.match(cloud.reportBody(r),/procedure-card/);assert.match(cloud.reportMarkdown(r),/- \[ \] Select/);assert.match(report.toHtmlReport(f,[]),/procedure-card\{/);assert.match(report.toMarkdown(f,[]),/Sharing permission/);assert.match(render.procedureMarkdown(f.procedure,'fr'),/Avant de commencer/);
});
test('procedure facts survive local save, search, backup and restore; old Tutorial reports still open',async()=>{
 const old=globalThis.indexedDB;globalThis.indexedDB=indexedDB;
 try{const f=fixture();const saved=await library.saveReport({analysis:f,qa:[]});assert.deepEqual((await library.getSavedReport(saved.id)).analysis.procedure,f.procedure);assert.ok((await library.listSavedReports({query:'Sharing permission'})).reports.some(r=>r.id===saved.id));const backup=await library.exportReportLibrary();await library.deleteSavedReport(saved.id);await library.importReportLibrary(backup.json);assert.deepEqual((await library.getSavedReport(saved.id)).analysis.procedure,f.procedure);delete f.procedure;const legacy=await library.saveReport({analysis:f,qa:[]});assert.ok(await library.getSavedReport(legacy.id));}finally{globalThis.indexedDB=old;}
});
test('stored procedures whose citations have no available evidence are rejected',async()=>{
 const old=globalThis.indexedDB;globalThis.indexedDB=indexedDB;
 try{const f=fixture();f.timeline.segments=[];const saved=await library.saveReport({analysis:f,qa:[]});assert.equal(await library.getSavedReport(saved.id),null);}finally{globalThis.indexedDB=old;}
});
