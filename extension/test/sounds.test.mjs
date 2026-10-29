import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/lib/localFile.ts'],bundle:true,write:false,platform:'browser',format:'esm'});
const {analyzeLocalSounds,transcribeLocalFile}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
test('quiet non-speech audio survives the speech silence threshold, with correct later-chunk offsets and one file decode',async()=>{
 const beforeFetch=globalThis.fetch,beforeContext=globalThis.OfflineAudioContext;let decoded=0;const uploads=[];
 const samples=new Float32Array(61*16000);samples[60*16000+4000]=0.0001;
 const audio={duration:61,getChannelData:()=>samples};
 globalThis.OfflineAudioContext=class {destination={};async decodeAudioData(){decoded++;return audio;}createBufferSource(){return {connect(){},start(){}};}async startRendering(){return audio;}};
 globalThis.fetch=async(_url,init)=>{const wav=init.body.get('file');uploads.push(new DataView(await wav.arrayBuffer()));return Response.json({windows:uploads.length===1?[]:[{start:.25,end:.26,description:'A quiet click.',confidence:'low'}]});};
 try {
  const local={duration:61,file:new File([new Uint8Array(2)],'fixture.webm')},access={kind:'pro',token:'fixture',reportId:'report'};
  assert.equal((await transcribeLocalFile(access,local,()=>{})).transcript,null);
  const sound=await analyzeLocalSounds(access,local);
  assert.equal(decoded,1);assert.equal(uploads.length,2);assert.equal(uploads[1].getUint32(24,true),16000);
  assert.ok(uploads[1].getInt16(44+4000*2,true)>0);assert.equal(sound.segments[0].start,60.25);assert.equal(sound.segments[0].end,60.26);
  assert.equal(sound.segments[0].transcript,null);assert.equal(sound.segments[0].visualSummary,null);
 }finally{globalThis.fetch=beforeFetch;globalThis.OfflineAudioContext=beforeContext;}
});
test('Private mode does not silently send audio to an additional processor',async()=>{
 const before=globalThis.fetch;globalThis.fetch=()=>{throw Error('Must not upload');};
 try {const r=await analyzeLocalSounds({kind:'byok',apiKey:'fixture'},{duration:10});assert.equal(r.segments.length,0);assert.match(r.limitations[0],/not analyzed/);}finally{globalThis.fetch=before;}
});
