import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {libraryUpload} from '../api/_lib/libraryUpload.js';
import {reportBody,reportMarkdown} from '../cloud-report.js';
const fixture=()=>JSON.parse(readFileSync(new URL('../../extension/test/fixtures/procedure.json',import.meta.url),'utf8'));
const payload=(analysis:unknown)=>({id:'procedure',createdAt:1700000000000,updatedAt:1700000000000,analysis,qa:[]});
describe('procedure cloud round trip',()=>{
 it('keeps evidence and checklists, removes unrelated payload fields',()=>{const f=fixture();f.procedure.secret='never-store';f.procedure.steps[0].action.rawFrame='never-store';const upload=libraryUpload(payload(f));expect(upload.reportData.procedure).toBeDefined();expect(JSON.stringify(upload)).not.toContain('never-store');const r={id:'r',title:'Tutorial',mode:'tutorial',source_type:'youtube',report_data:upload.reportData,created_at:'2026-09-17',completed_at:null};expect(reportBody(r)).toContain('type="checkbox"');expect(reportMarkdown(r)).toContain('Sharing permission is not shown.');});
 it('rejects malformed new data and accepts legacy tutorial reports',()=>{const f=fixture();f.procedure={};expect(()=>libraryUpload(payload(f))).toThrow();delete f.procedure;expect(libraryUpload(payload(f)).mode).toBe('tutorial');});
});
