import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {libraryUpload} from '../api/_lib/libraryUpload.js';
import {reportBody,reportMarkdown,reportMode} from '../cloud-report.js';
const fixture=()=>JSON.parse(readFileSync(new URL('../../extension/test/fixtures/lesson.json',import.meta.url),'utf8'));
const payload=(analysis:unknown)=>({id:'lesson',createdAt:1700000000000,updatedAt:1700000000000,analysis,qa:[]});
describe('lesson cloud round trip',()=>{
 it('preserves lesson content and strips responses or unrelated fields',()=>{const f=fixture();f.lesson.progress='never-store';f.lesson.modules[0].questions[0].response='never-store';const upload=libraryUpload(payload(f));expect(upload.reportData.lesson).toBeDefined();expect(JSON.stringify(upload)).not.toContain('never-store');const r={id:'r',title:'Lesson',mode:'lesson',source_type:'youtube',report_data:upload.reportData,created_at:'2026-09-17',completed_at:null};expect(reportMode(r)).toBe('Create a Lesson');expect(reportBody(r)).toContain('data-answer="q1"');expect(reportMarkdown(r)).toContain('Final application challenge');});
 it('rejects malformed content, missing lessons and unsupported timestamps',()=>{for(const mutate of [(f:any)=>{delete f.lesson},(f:any)=>{f.lesson={}},(f:any)=>{f.timeline.segments=[]},(f:any)=>{f.lesson.challenge.timestamps=[999]}]){const f=fixture();mutate(f);expect(()=>libraryUpload(payload(f))).toThrow();}});
});
