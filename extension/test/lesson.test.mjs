import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {indexedDB} from 'fake-indexeddb';
const load=async entry=>{const b=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'browser'});return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);};
const [schema,render,analyze,library,study,cloud,report]=await Promise.all(['src/lib/lesson.ts','src/lib/lessonReport.ts','src/lib/analyze.ts','src/lib/reportLibrary.ts','src/lib/lessonStudy.ts','../site/cloud-report.ts','src/lib/report.ts'].map(load));
const fixture=()=>JSON.parse(readFileSync('test/fixtures/lesson.json','utf8'));
const response=v=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(v)}}]}));
test('lesson requires assessable objectives, unique IDs and usable answers',()=>{
 const f=fixture();assert.deepEqual(schema.normalizeLesson(f.lesson,30,f.timeline),f.lesson);
 for(const mutate of [l=>l.objectives.push({id:'orphan',description:'Unsupported objective'}),l=>l.modules[0].questions[0].answer='',l=>l.modules[0].id=l.objectives[0].id,l=>l.challenge.kind='recall',l=>l.modules[0].questions=[]]){const l=fixture().lesson;mutate(l);assert.equal(schema.normalizeLesson(l,30,f.timeline),undefined);}
});
test('lesson citations must exist within captured evidence and source duration',()=>{
 const f=fixture();f.lesson.modules[0].timestamps=[-1,30,NaN,Infinity];assert.equal(schema.normalizeLesson(f.lesson,30,f.timeline),undefined);
 const f2=fixture();f2.timeline.segments=[{start:20,end:30}];assert.equal(schema.normalizeLesson(f2.lesson,30,f2.timeline),undefined);
 f2.lesson.modules[0].example.basis='video';f2.lesson.modules[0].example.timestamps=[];assert.equal(schema.normalizeLesson(f2.lesson),undefined);
});
test('lesson synthesis preserves limitations and rejects non-teaching evidence',async()=>{
 const f=fixture(),old=globalThis.fetch;let body;
 globalThis.fetch=async(_u,i)=>{body=JSON.parse(i.body);return response(f);};
 try{const a=await analyze.analyzeTimeline({kind:'byok',apiKey:'test'},f.timeline,f.source,'lesson',f.prompt,'en');assert.deepEqual(a.lesson,f.lesson);assert.ok(a.limitations.includes(f.source.limitations[0]));assert.match(body.messages[0].content,/Every objective must be assessed/);assert.equal(body.reasoning_effort,'medium');
 await analyze.askQuestion({kind:'byok',apiKey:'test'},'Explain the challenge',f.timeline,a);assert.match(body.messages[1].content,/Final|unaided/);
 globalThis.fetch=async()=>response({lesson:null});await assert.rejects(analyze.analyzeTimeline({kind:'byok',apiKey:'test'},f.timeline,f.source,'lesson',f.prompt),/not enough supported teaching/);
 }finally{globalThis.fetch=old;}
});
test('student exports omit answers, explanations, rubrics and hints; key includes them',()=>{
 const l=fixture().lesson;const qs=schema.lessonQuestions(l);for(const [i,q] of qs.entries()){q.answer=`ANSWER_SECRET_${i}`;q.explanation=`EXPLANATION_SECRET_${i}`;q.hint=`HINT_SECRET_${i}`;q.rubric=[`RUBRIC_SECRET_${i}`];}
 const student=render.lessonDocument(l,'student'),key=render.lessonDocument(l,'key');
 for(const q of qs){assert.ok(student.includes(q.prompt));for(const v of [q.answer,q.explanation,q.hint,...q.rubric])assert.ok(!student.includes(v));assert.ok(key.includes(q.answer));assert.ok(key.includes(q.explanation));}
 assert.doesNotMatch(student,/<script|<textarea|data-study-status/);assert.match(student,/lesson-writing/);
});
test('all report readers escape lesson content and preserve source citations',()=>{
 const f=fixture();f.lesson.title='<img src=x onerror=alert(1)>';f.source.url='https://www.youtube.com/watch?v=lesson-test';
 const html=render.lessonHtml(f.lesson,'en',f.source.url,30);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<script/);assert.match(html,/lesson-test&amp;t=5s/);assert.match(html,/data-answer="q1"/);assert.doesNotMatch(render.lessonHtml(f.lesson,'en','javascript:alert(1)'),/href="javascript/);
 const r={id:'r',title:'Lesson',mode:'lesson',report_data:f,created_at:'2026-09-17',completed_at:null};assert.match(cloud.reportBody(r),/lesson-card/);assert.match(cloud.reportMarkdown(r),/Final application challenge/);assert.match(report.toHtmlReport(f,[]),/lesson-card/);assert.match(report.toMarkdown(f,[]),/Success criteria/);assert.match(render.lessonHtml(f.lesson,'es'),/Objetivos de aprendizaje/);
});
test('lesson progress is scoped to account, report and normalized content',()=>{
 const l=fixture().lesson,key=study.lessonProgressKey('account:A:r1',l);assert.notEqual(key,study.lessonProgressKey('account:B:r1',l));assert.notEqual(key,study.lessonProgressKey('account:A:r2',l));l.modules[0].explanation+=' updated';assert.notEqual(key,study.lessonProgressKey('account:A:r1',l));
 const s=study.normalizeStudyProgress({q1:{response:'x'.repeat(20000),reviewed:'yes',answerOpen:true},unknown:{response:'wrong'}},l);assert.equal(s.q1.response.length,12000);assert.equal(s.q1.reviewed,false);assert.equal(s.q1.answerOpen,true);assert.equal(s.unknown,undefined);
});
test('lessons survive save, search, backup and restore; invalid lessons cannot load',async()=>{
 const old=globalThis.indexedDB;globalThis.indexedDB=indexedDB;
 try{const f=fixture();const saved=await library.saveReport({analysis:f,qa:[]});assert.deepEqual((await library.getSavedReport(saved.id)).analysis.lesson,f.lesson);assert.ok((await library.listSavedReports({query:'unaided response'})).reports.some(r=>r.id===saved.id));const backup=await library.exportReportLibrary();await library.deleteSavedReport(saved.id);await library.importReportLibrary(backup.json);assert.deepEqual((await library.getSavedReport(saved.id)).analysis.lesson,f.lesson);f.lesson.modules=[];const bad=await library.saveReport({analysis:f,qa:[]});assert.equal(await library.getSavedReport(bad.id),null);}finally{globalThis.indexedDB=old;}
});
