import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/lib/describeFrames.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const {describeFocusedFrames}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
test('focus reaches consecutive images and overlap cannot duplicate or invent timestamps',async()=>{
 const original=globalThis.fetch;const seen=[];
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(init.body);seen.push(body);
  const timestamps=body.messages[1].content.filter(p=>p.type==='text'&&p.text.startsWith('Frame at')).map(p=>Number(p.text.match(/Frame at ([\d.]+)/)[1]));
  return Response.json({choices:[{message:{content:JSON.stringify({frames:[...timestamps.map(timestamp=>({timestamp,visual_summary:'Visible state change',extracted_text:[],confidence:'medium'})),{timestamp:999,visual_summary:'invented'}]})}}]});
 };
 try {
  const frames=Array.from({length:6},(_,timestamp)=>({timestamp,dataUrl:'data:image/jpeg;base64,fixture'}));
  const result=await describeFocusedFrames({kind:'byok',apiKey:'fixture'},frames,'Explain the changing setting',()=>{});
  assert.deepEqual(result.map(f=>f.timestamp),[0,1,2,3,4,5]);
  assert.equal(seen.length,2);assert.ok(seen.every(b=>b.messages[1].content[0].text.includes('changing setting')));
  assert.equal(seen[1].messages[1].content.filter(p=>p.type==='image_url').length,4);
 }finally{globalThis.fetch=original;}
});
