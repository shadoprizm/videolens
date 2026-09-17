// Evaluate real downloaded video evidence with shipping Lesson code.
// node --env-file=../site/.env.evaluation.local scripts/evaluate-lesson.mjs VIDEO OUTPUT_DIR [CAPTIONS_JSON3] [INFO_JSON]
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [videoArg,outArg,captionsArg,metaArg]=process.argv.slice(2);
if(!videoArg||!outArg)throw Error('Usage: evaluate-lesson.mjs VIDEO OUTPUT_DIR [CAPTIONS_JSON3] [INFO_JSON]');
const video=resolve(videoArg),out=resolve(outArg);mkdirSync(out,{recursive:true});
const key=process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;if(!key)throw Error('Evaluation provider credential required');
const gateway=!process.env.OPENAI_API_KEY;const realFetch=globalThis.fetch;const stats={requests:0,failures:0,inputTokens:0,outputTokens:0,costUsd:0};
globalThis.fetch=async(url,init)=>{let target=String(url),options=init;if(target.startsWith('https://api.openai.com/v1/')){stats.requests++;if(gateway){const body=JSON.parse(init.body);body.model='openai/'+body.model;target=target.replace('https://api.openai.com','https://ai-gateway.vercel.sh');options={...init,body:JSON.stringify(body),headers:{...init.headers,'ai-gateway-auth-method':process.env.AI_GATEWAY_API_KEY?'api-key':'oidc','ai-gateway-protocol-version':'0.0.1'}};}}const r=await realFetch(target,options);if(!r.ok)stats.failures++;const d=await r.clone().json().catch(()=>({}));stats.inputTokens+=d.usage?.prompt_tokens??0;stats.outputTokens+=d.usage?.completion_tokens??0;stats.costUsd+=Number(d.usage?.cost??0);return r;};
const load=async name=>{const b=await build({entryPoints:[resolve(root,'src/lib/'+name+'.ts')],bundle:true,write:false,format:'esm',platform:'browser'});return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);};
const [p,v,t,a,r,config]=await Promise.all(['capture','describeFrames','timeline','analyze','report','config'].map(load));
const duration=Number(execFileSync(process.env.FFPROBE_PATH || 'ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',video],{encoding:'utf8'}).trim());
const meta=metaArg?JSON.parse(readFileSync(resolve(metaArg),'utf8')):{};
const captions=captionsArg&&existsSync(captionsArg)?JSON.parse(readFileSync(captionsArg,'utf8')):null;
const transcript=captions?{language:'en',segments:(captions.events||[]).filter(e=>e.segs&&Number.isFinite(e.tStartMs)).map(e=>({start:e.tStartMs/1000,end:(e.tStartMs+(e.dDurationMs||1000))/1000,text:e.segs.map(s=>s.utf8||'').join('')}))}:null;
const times=p.planFrameTimestamps(duration,40,config.DEFAULTS.frameIntervalSeconds),frames=[];
for(const [i,timestamp] of times.entries()){const path=resolve(out,`frame-${String(i).padStart(3,'0')}.jpg`);if(!existsSync(path))execFileSync(process.env.FFMPEG_PATH || 'ffmpeg',['-v','error','-ss',String(timestamp),'-i',video,'-frames:v','1','-vf','scale=1280:1280:force_original_aspect_ratio=decrease','-q:v','3','-y',path]);frames.push({timestamp,dataUrl:'data:image/jpeg;base64,'+readFileSync(path).toString('base64')});}
console.log({stage:'captured',frames:frames.length,duration});
const access={kind:'byok',apiKey:key};const obsPath=resolve(out,'observations.json');
const observations=existsSync(obsPath)?JSON.parse(readFileSync(obsPath,'utf8')):await v.describeLessonFrames(access,frames,(done,total)=>{if(done%30===0||done===total)console.log({stage:'vision',done,total});});
writeFileSync(obsPath,JSON.stringify(observations,null,2));
if(observations.length<frames.length/2)throw Error('Insufficient visual evidence');
const timeline=t.buildTimeline(observations,transcript,duration);
const source={sourceType:'youtube',title:meta.title||'Software tutorial evaluation',url:meta.webpage_url||null,durationSeconds:duration,limitations:['Evaluation used downloaded video frames and available captions; native extension capture and task execution were not tested.']};
const analysis=await a.analyzeTimeline(access,timeline,source,'lesson','Create a grounded lesson with objectives, checkpoint questions and a final application exercise.','en');
writeFileSync(resolve(out,'analysis.json'),JSON.stringify(analysis,null,2));writeFileSync(resolve(out,'report.html'),r.toHtmlReport(analysis,[]));writeFileSync(resolve(out,'report.md'),r.toMarkdown(analysis,[]));
const summary={models:config.MODELS,evaluationLimitations:source.limitations,source:source.url,title:source.title,duration,frames:frames.length,observations:observations.length,hasCaptions:!!transcript,objectives:analysis.lesson.objectives.length,modules:analysis.lesson.modules.length,gaps:analysis.lesson.gaps,...stats};writeFileSync(resolve(out,'run.json'),JSON.stringify(summary,null,2));console.log(summary);
