import { beforeEach, expect, it, vi } from "vitest";
import { analyzeSound, parseSound, readSoundWav, soundWav, soundWindows, supportedSound } from "../api/_lib/sound.js";
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
