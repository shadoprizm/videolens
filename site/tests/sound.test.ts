import { beforeEach, expect, it, vi } from "vitest";
import { analyzeSound, parseSound, readSoundWav, soundWav, soundWindows, supportedSound, SOUND_REVIEW_MODEL } from "../api/_lib/sound.js";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), record: vi.fn(), finish: vi.fn(), generate: vi.fn() }));
vi.mock("../api/_lib/auth.js", () => ({ authenticate: mocks.auth }));
vi.mock("../api/_lib/entitlements.js", () => ({ recordAiRequest: mocks.record }));
vi.mock("../api/_lib/managed-ai.js", async original => ({ ...await original<typeof import("../api/_lib/managed-ai.js")>(), finishAiRequest: mocks.finish }));
vi.mock("ai", async original => ({ ...await original<typeof import("ai")>(), generateText: mocks.generate }));
import { handler } from "../api/ai.js";
const gateway = { kind: "gateway" as const, token: "gateway-test", authMethod: "api-key" as const };
function tone() { const p = new Uint8Array(8 * 16000 * 2), v = new DataView(p.buffer); for (let i = 48000; i < 64000; i++) v.setInt16(i * 2, Math.round(4000 * Math.sin(2 * Math.PI * 1000 * i / 16000)), true); return soundWav(p, 16000); }
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: "owner", source: "extension" }); mocks.record.mockResolvedValue(42); });
it("digital silence never reaches an audio model or invents events", async () => {
 const result = await analyzeSound(soundWav(new Uint8Array(16_000 * 2 * 8), 16000), gateway);
 expect(result).toMatchObject({ silent: true, windows: [], costUsd: 0 }); expect(mocks.generate).not.toHaveBeenCalled();
});
it("known tone boundaries come from PCM, independent of any model timestamp", async () => {
 const w = soundWindows(tone()).windows; expect(w).toHaveLength(1); expect(w[0].start).toBeCloseTo(3, 3); expect(w[0].end).toBe(4);
 mocks.generate.mockResolvedValueOnce({output:{description:'Steady tone',speech:false,music:false,uncertain:false,start:0,end:8}}).mockResolvedValueOnce({output:{description:'Steady tone',speech:false,music:false,uncertain:false}}).mockResolvedValueOnce({output:{windows:[{index:0,description:'Steady tone',agreement:true}]}});
 const r = await analyzeSound(tone(), gateway); expect(r.windows[0].start).toBeCloseTo(3, 3); expect(r.windows[0].end).toBe(4); expect(r.windows[0].confidence).toBe('medium');
 const call = mocks.generate.mock.calls[0][0]; expect(call.providerOptions.gateway.only).toEqual(['deepinfra']); expect(call.model.modelId).toBe('xiaomi/mimo-v2.6-flash');
});
it("bounds decoded duration and rejects stereo, truncated and empty files", () => {
 const good = tone(); expect(readSoundWav(good).duration).toBe(8);
 for (const bad of [new Uint8Array(20), good.slice(0, -2), soundWav(new Uint8Array(61 * 16000 * 2),16000), soundWav(new Uint8Array(0),16000)]) expect(()=>readSoundWav(bad)).toThrow();
 const stereo=good.slice(); new DataView(stereo.buffer).setUint16(22,2,true); expect(()=>readSoundWav(stereo)).toThrow();
});
it("failed or malformed sound results cannot masquerade as completed coverage", async () => {
 expect(()=>parseSound('{"description":"claimed"}')).toThrow(); mocks.generate.mockResolvedValue({text:'not json'}); await expect(analyzeSound(tone(),gateway)).rejects.toThrow();
 mocks.generate.mockRejectedValue(new Error('upstream')); await expect(analyzeSound(tone(),gateway)).rejects.toThrow('upstream');
});
function request(consent = true, audio = tone()) { const f = new FormData(); f.set('kind','sound'); f.set('reportId','report'); if(consent)f.set('processingPolicy','managed-sounds-2026-10'); f.set('file',new File([audio as BlobPart],'sound.wav',{type:'audio/wav'})); return new Request('https://videolens.io/api/ai',{method:'POST',body:f}); }
it("requires new processor consent and valid audio before consuming quota", async()=>{
 expect((await handler(request(false))).status).toBe(400); expect((await handler(request(true,new Uint8Array(12)))).status).toBe(400); expect(mocks.record).not.toHaveBeenCalled();
});
it("records sound failures without completing partial sound coverage", async()=>{
 vi.stubEnv('OPENAI_API_KEY','openai-test'); vi.stubEnv('AI_GATEWAY_API_KEY','gateway-test');
 try { mocks.generate.mockRejectedValue(new Error('unavailable')); expect((await handler(request())).status).toBe(502); expect(mocks.record).toHaveBeenCalledWith('owner','report','sound'); expect(mocks.finish).toHaveBeenCalledWith(42,expect.objectContaining({outcome:'failed',effective_model:'xiaomi/mimo-v2.6-flash'})); } finally{vi.unstubAllEnvs();}
});
it('an audio-inaccessible response cannot become evidence',()=>{
 expect(()=>parseSound('{"description":"I cannot access the audio","speech":false,"music":false,"uncertain":true}')).toThrow('not analyzed');
});

it('a consistency reviewer cannot introduce a salient sound unsupported by either blind observation',()=>{
 expect(supportedSound('A horn sounds.','Broadband rumble.','A horn and rumble.')).toBe(false);
 expect(supportedSound('A steady tone.','A steady tone.','Broadband noise.')).toBe(false);
 expect(supportedSound('Likely paper being handled.','Rustling.','Rustling.')).toBe(false);
 expect(supportedSound('Low rumble with brief clicks.','Rumble with clicks.','Low rumble and clicking.')).toBe(true);
});
it('plural labels and explicit denials cannot bypass sound support checks',()=>{
 expect(supportedSound('Electronic beeps.','Broadband noise.','Electronic beeps.')).toBe(false);
 expect(supportedSound('Horns.','No horn was heard.','A horn.')).toBe(false);
 expect(supportedSound('A siren.','Cannot confirm a siren.','A siren.')).toBe(false);
});

it('tolerates a slow but successful sound response without the old premature timeout', async () => {
 vi.useFakeTimers();
 const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('Deadline exceeded', 'TimeoutError')), ms);
  return controller.signal;
 });
 let count = 0;
 mocks.generate.mockImplementation(({abortSignal}) => new Promise((resolve, reject) => {
  const index = count++;
  const timer = setTimeout(() => resolve({output: index < 2
   ? {description:'A steady tone.',speech:false,music:false,uncertain:false}
   : {windows:[{index:0,description:'A steady tone.',agreement:true}]}}), 25_000);
  abortSignal.addEventListener('abort', () => {clearTimeout(timer);reject(abortSignal.reason);}, {once:true});
 }));
 try {
  const result = analyzeSound(tone(),gateway);
  await vi.advanceTimersByTimeAsync(115_000);
  expect((await result).windows[0]).toMatchObject({description:'A steady tone.',confidence:'medium'});
 } finally { timeout.mockRestore(); vi.clearAllTimers(); vi.useRealTimers(); }
});

it('cancels the other sound workers after a failed observation', async () => {
 const pcm = new Uint8Array(10 * 16_000 * 2); pcm.fill(1);
 const signals: AbortSignal[] = [];
 mocks.generate.mockImplementation(({abortSignal}) => {
  signals.push(abortSignal);
  if (signals.length === 1) return Promise.reject(new Error('upstream failed'));
  return new Promise((_resolve,reject) => abortSignal.addEventListener('abort',()=>reject(abortSignal.reason),{once:true}));
 });
 await expect(analyzeSound(soundWav(pcm,16000),gateway)).rejects.toThrow('upstream failed');
 expect(signals).toHaveLength(5);
 expect(signals.every(signal=>signal.aborted)).toBe(true);
});

it.each([0, 1, 2])('retries only the timed-out call at processing position %i', async failedCall => {
 vi.useFakeTimers();
 const timeout = vi.spyOn(AbortSignal,'timeout').mockImplementation(ms => {
  const controller = new AbortController();
  setTimeout(()=>controller.abort(new DOMException('Deadline exceeded','TimeoutError')),ms);
  return controller.signal;
 });
 let calls = 0;
 mocks.generate.mockImplementation(({abortSignal,messages}) => {
  if (calls++ === failedCall) return new Promise((_resolve,reject)=>abortSignal.addEventListener('abort',()=>reject(abortSignal.reason),{once:true}));
  return Promise.resolve({output: Array.isArray(messages[0].content)
   ? {description:'A steady tone.',speech:false,music:false,uncertain:false}
   : {windows:[{index:0,description:'A steady tone.',agreement:true}]}});
 });
 try {
  const result = analyzeSound(tone(),gateway);
  await vi.advanceTimersByTimeAsync(failedCall === 2 ? 30_001 : 40_001);
  expect((await result).windows).toHaveLength(1);
  expect(mocks.generate).toHaveBeenCalledTimes(4);
  const first = mocks.generate.mock.calls[failedCall][0];
  const retry = mocks.generate.mock.calls[failedCall+1][0];
  expect(retry.messages).toEqual(first.messages);
  expect(first.abortSignal.aborted).toBe(true);
  expect(retry.abortSignal.aborted).toBe(false);
 } finally { timeout.mockRestore(); vi.clearAllTimers(); vi.useRealTimers(); }
});

function fullMinute() { const pcm = new Uint8Array(60 * 16000 * 2); pcm.fill(1); return soundWav(pcm,16000); }
function reviewBatch(messages: {content: string}[]) { return JSON.parse(messages[0].content.split('\n').at(-1)!) as {index:number}[]; }

it('completes all 30 windows after slow observations without a single large review bottleneck', async () => {
 vi.useFakeTimers();
 const timeout = vi.spyOn(AbortSignal,'timeout').mockImplementation(ms => {
  const c = new AbortController(); setTimeout(()=>c.abort(new DOMException('Deadline exceeded','TimeoutError')),ms); return c.signal;
 });
 let activeReviews = 0, maximumReviews = 0;
 const reviewed: number[] = [];
 mocks.generate.mockImplementation(({abortSignal,messages,model,reasoning,providerOptions}) => new Promise((resolve,reject) => {
  const audio = Array.isArray(messages[0].content);
  const batch = audio ? [] : reviewBatch(messages);
  if (!audio) {
   expect(model.modelId).toBe(SOUND_REVIEW_MODEL);
   expect(reasoning).toBe('none');
   expect(providerOptions.gateway.only).toEqual(['openai']);
   expect(batch.length).toBeLessThanOrEqual(5);
   reviewed.push(...batch.map(x=>x.index));
   maximumReviews = Math.max(maximumReviews,++activeReviews);
  }
  const timer = setTimeout(()=>{
   if (!audio) activeReviews--;
   resolve({output: audio ? {description:'A steady tone.',speech:false,music:false,uncertain:false}
    : {windows:batch.map(x=>({...x,description:'A steady tone.',agreement:true}))}});
  },10_000);
  abortSignal.addEventListener('abort',()=>{clearTimeout(timer);reject(abortSignal.reason);},{once:true});
 }));
 try {
  const pending = analyzeSound(fullMinute(),gateway);
  await vi.advanceTimersByTimeAsync(140_001);
  const result = await pending;
  expect(result.windows).toHaveLength(30);
  expect(result.windows.map(w=>[w.start,w.end])).toEqual(Array.from({length:30},(_,i)=>[i*2,i*2+2]));
  expect(result.windows.every(w=>w.description==='A steady tone.' && w.confidence==='medium')).toBe(true);
  expect(reviewed.sort((a,b)=>a-b)).toEqual(Array.from({length:30},(_,i)=>i));
  expect(maximumReviews).toBe(3);
 } finally { timeout.mockRestore();vi.clearAllTimers();vi.useRealTimers(); }
});

it('rejects cross-batch indices and cancels other reviews rather than inventing coverage', async () => {
 const reviewSignals: AbortSignal[] = [];
 mocks.generate.mockImplementation(({abortSignal,messages}) => {
  if(Array.isArray(messages[0].content)) return Promise.resolve({output:{description:'A steady tone.',speech:false,music:false,uncertain:false}});
  reviewSignals.push(abortSignal);
  const batch = reviewBatch(messages);
  if(batch[0].index===0) return Promise.resolve({output:{windows:batch.map((x,i)=>({index:i===0?5:x.index,description:'A steady tone.',agreement:true}))}});
  return new Promise((_resolve,reject)=>abortSignal.addEventListener('abort',()=>reject(abortSignal.reason),{once:true}));
 });
 await expect(analyzeSound(fullMinute(),gateway)).rejects.toThrow('Invalid sound consistency review');
 expect(reviewSignals).toHaveLength(3);
 expect(reviewSignals.every(s=>s.aborted)).toBe(true);
});

it('rejects duplicate review indices and vetoes unsupported sound claims', async () => {
 let duplicate = true;
 mocks.generate.mockImplementation(({messages}) => {
  if(Array.isArray(messages[0].content)) return Promise.resolve({output:{description:'A steady tone.',speech:false,music:false,uncertain:false}});
  const batch = reviewBatch(messages);
  return Promise.resolve({output:{windows:batch.map(x=>({index:duplicate?batch[0].index:x.index,description:'A horn sounds.',agreement:true}))}});
 });
 await expect(analyzeSound(fullMinute(),gateway)).rejects.toThrow('Invalid sound consistency review');
 duplicate=false;
 const result=await analyzeSound(fullMinute(),gateway);
 expect(result.windows).toHaveLength(30);
 expect(result.windows.every(w=>w.confidence==='low' && w.description.includes('did not agree'))).toBe(true);
});

it('stops after the second deadline instead of completing partial audio', async () => {
 vi.useFakeTimers();
 const timeout = vi.spyOn(AbortSignal,'timeout').mockImplementation(ms => {
  const controller = new AbortController();
  setTimeout(()=>controller.abort(new DOMException('Deadline exceeded','TimeoutError')),ms);
  return controller.signal;
 });
 mocks.generate.mockImplementation(({abortSignal})=>new Promise((_resolve,reject)=>abortSignal.addEventListener('abort',()=>reject(abortSignal.reason),{once:true})));
 try {
  const failed = expect(analyzeSound(tone(),gateway)).rejects.toThrow('Deadline exceeded');
  await vi.advanceTimersByTimeAsync(80_001);
  await failed;
  expect(mocks.generate).toHaveBeenCalledTimes(2);
 } finally { timeout.mockRestore(); vi.clearAllTimers(); vi.useRealTimers(); }
});

it('does not retry an expired overall sound operation', async () => {
 const operation = new AbortController();
 const timeout = vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>ms===240_000 ? operation.signal : new AbortController().signal);
 mocks.generate.mockImplementation(({abortSignal})=>new Promise((_resolve,reject)=>abortSignal.addEventListener('abort',()=>reject(abortSignal.reason),{once:true})));
 try {
  const failed = expect(analyzeSound(tone(),gateway)).rejects.toThrow('Operation deadline');
  operation.abort(new DOMException('Operation deadline','TimeoutError'));
  await failed;
  expect(mocks.generate).toHaveBeenCalledTimes(1);
 } finally { timeout.mockRestore(); }
});
