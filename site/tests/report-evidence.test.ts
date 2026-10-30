import { expect, it } from 'vitest';
import { guardReportSilence } from '../api/_lib/report-evidence.js';
const messages = [{role:'user',content:'TIMELINE:\n  heard (provisional, within this window): A low rumble and clicks.'}];
const response = (summary:string) => JSON.stringify({choices:[{message:{content:JSON.stringify({summary,findings:[{finding:'Heard rumble.',evidence:[{timestamp:10,detail:'Rumble.'}]}]})}}],usage:{total_tokens:123}});
it('removes a contradicted source-wide silence label without changing evidence or usage',()=>{
 const original=response('This is a silent dashcam recording. Provisional rumble is heard.');
 const guarded=JSON.parse(guardReportSilence(original,messages));
 const report=JSON.parse(guarded.choices[0].message.content);
 expect(report.summary).toBe('This is a dashcam recording. Provisional rumble is heard.');
 expect(report.findings).toEqual(JSON.parse(JSON.parse(original).choices[0].message.content).findings);
 expect(guarded.usage).toEqual({total_tokens:123});
});
it.each(['A silent video shows snow.','The silent recording shows snow.'])('normalizes only the introductory source label: %s',summary=>{
 expect(JSON.parse(JSON.parse(guardReportSilence(response(summary),messages)).choices[0].message.content).summary).not.toContain('silent');
});
it('does not change a silent film subject, quotations, no-speech wording or a recording without heard evidence',()=>{
 for(const summary of ['This video discusses silent films.','A person calls a clip "silent video".','This recording has no recognized speech.']) {
  const original=response(summary);expect(guardReportSilence(original,messages)).toBe(original);
 }
 const original=response('This is a silent recording.');expect(guardReportSilence(original,[])).toBe(original);
});
it('recognizes image-bearing client messages without touching their content',()=>{
 const input=[{role:'user',content:[{type:'text',text:'heard (provisional): Rumble.'},{type:'image_url',image_url:{url:'image'}}]}];
 expect(guardReportSilence(response('This is a silent recording.'),input)).not.toContain('silent recording');
 expect(input[0].content[1]).toEqual({type:'image_url',image_url:{url:'image'}});
});
it('leaves non-report and malformed envelopes to the existing response validator',()=>{
 for(const body of ['null','invalid','{}',JSON.stringify({choices:[{message:{content:'null'}}]})])expect(guardReportSilence(body,messages)).toBe(body);
});
