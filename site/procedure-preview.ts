import example from '../extension/test/fixtures/procedure.json';
import {procedureHtml,procedureMarkdown,PROCEDURE_CSS} from './shared/procedureReport.js';
const style=document.createElement('style');style.textContent=PROCEDURE_CSS;document.head.append(style);
const rendered=new DOMParser().parseFromString(procedureHtml(example.procedure,'en'), 'text/html');
document.getElementById('procedure-example')!.replaceChildren(...Array.from(rendered.body.childNodes,n=>document.importNode(n,true)));
document.getElementById('print-procedure')!.addEventListener('click',()=>window.print());
document.getElementById('copy-checklist')!.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(example.procedure.steps.map(s=>`- [ ] ${s.action.value}`).join('\n'));document.getElementById('preview-status')!.textContent='Checklist copied.';}catch{document.getElementById('preview-status')!.textContent='Copy was unavailable. Download the instructions instead.';}});
document.getElementById('download-procedure')!.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([procedureMarkdown(example.procedure,'en')],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download='videolens-procedure-example.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
