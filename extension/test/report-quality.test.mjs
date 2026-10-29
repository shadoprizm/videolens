import assert from "node:assert/strict";
import test from "node:test";
import {build} from "esbuild";
const bundle=await build({entryPoints:["src/lib/analyze.ts"],bundle:true,format:"esm",platform:"browser",write:false});
const {analyzeTimeline}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const timeline={segments:[{start:10,end:20,visualSummary:"The setting changes to 30.",ocr:["30"],transcript:"Set the value to thirty.",confidence:"high"}]};
const source={sourceType:"local_file",durationSeconds:60,limitations:[],title:"Fixture"};
test("report citations must map to supplied evidence rather than fabricated timestamps",async()=>{
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({summary:"A setting is changed.",findings:[{finding:"Valid",evidence:[{timestamp:15,detail:"30 is visible"}],confidence:"high"},{finding:"Invented moment",evidence:[{timestamp:50,detail:"Outside captured evidence"}],confidence:"high"},{finding:"No evidence",evidence:[],confidence:"high"},null],limitations:["Audio is partial"],confidence:"high"})}}]});
 try {const result=await analyzeTimeline({kind:"byok",apiKey:"fixture"},timeline,source,"general","Explain the setting");assert.deepEqual(result.findings.map(f=>f.finding),["Valid"]);assert.equal(result.confidence,"low");assert.ok(result.limitations.includes("Audio is partial"));assert.ok(result.limitations.some(x=>/omitted/.test(x)));} finally {globalThis.fetch=originalFetch;}
});
test("an empty AI result cannot consume a successful report allowance",async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({choices:[{message:{content:'{"summary":"","findings":[]}'}}]});
 try {await assert.rejects(()=>analyzeTimeline({kind:"byok",apiKey:"fixture"},timeline,source,"general","Summarize"),/empty report/);}finally{globalThis.fetch=originalFetch;}
});
test("the final reviewer receives original timestamped images, with request size bounded",async()=>{
 const originalFetch=globalThis.fetch;let body;
 globalThis.fetch=async(_url,init)=>{body=JSON.parse(init.body);return Response.json({choices:[{message:{content:'{"summary":"Direct evidence reviewed.","findings":[],"limitations":[],"confidence":"high"}'}}]});};
 try {
  const frames=[{timestamp:10,dataUrl:'data:image/jpeg;base64,fixture'}];
  await analyzeTimeline({kind:'byok',apiKey:'fixture'},timeline,{...source,limitations:[]},'general','Review movement','en',undefined,frames);
  assert.equal(body.messages[1].content[2].image_url.url,frames[0].dataUrl);
  assert.match(body.messages[1].content[1].text,/10.000/);
 }finally{globalThis.fetch=originalFetch;}
});
