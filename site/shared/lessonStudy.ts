import { normalizeLesson, lessonQuestions, type Lesson } from './lesson.js';
import { lessonCopy } from './lessonCopy.js';
import { lessonDocument } from './lessonReport.js';
export interface StudyAnswer { response:string; reviewed:boolean; answerOpen:boolean; hintOpen:boolean }
export type StudyProgress = Record<string, StudyAnswer>;
export function lessonProgressKey(scope:string,lesson:Lesson):string {
  // Full normalized content fingerprint prevents reusing answers after a lesson changes.
  let a=2166136261,b=5381;for(const c of JSON.stringify(lesson)){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}
  return `videolens:lesson:v1:${encodeURIComponent(scope)}:${(a>>>0).toString(36)}${(b>>>0).toString(36)}`;
}
export function normalizeStudyProgress(value:unknown,lesson:Lesson):StudyProgress {
  const input=value&&typeof value==='object'?value as Record<string,unknown>:{};
  return Object.fromEntries(lessonQuestions(lesson).map(q=>{const raw=input[q.id];const r=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};return [q.id,{response:typeof r.response==='string'?r.response.slice(0,12000):'',reviewed:r.reviewed===true,answerOpen:r.answerOpen===true,hintOpen:r.hintOpen===true}];}));
}
export function bindLessonStudy(root:HTMLElement,value:unknown,scope:string,language?:string|null,source:string|null=null):()=>void {
  const lesson=normalizeLesson(value);const card=root.matches('.lesson-card')?root:root.querySelector<HTMLElement>('.lesson-card');
  if(!lesson||!card)return ()=>{};
  const c=lessonCopy(language),key=lessonProgressKey(scope,lesson),questions=lessonQuestions(lesson);
  let state=normalizeStudyProgress(null,lesson),available=true;
  try {state=normalizeStudyProgress(JSON.parse(localStorage.getItem(key)||'null'),lesson);localStorage.setItem(key,JSON.stringify(state));} catch {available=false;}
  card.querySelectorAll<HTMLElement>('.lesson-study-tools,.lesson-response,.lesson-check').forEach(el=>el.hidden=false);
  const status=card.querySelector<HTMLElement>('[data-study-status]')!;
  const update=()=>{
    const count=questions.filter(q=>state[q.id].reviewed).length;
    const progress=card.querySelector<HTMLProgressElement>('[data-study-progress]')!;progress.max=questions.length;progress.value=count;
    card.querySelector<HTMLOutputElement>('[data-progress-count]')!.textContent=`${count} / ${questions.length}`;
    status.textContent=available?c.storage:c.unavailable;
    for(const o of lesson.objectives){const qs=questions.filter(q=>q.objectiveIds.includes(o.id)&&!lesson.readiness.includes(q));const output=card.querySelector<HTMLElement>(`[data-objective-progress="${o.id}"]`);if(output)output.textContent=`(${qs.filter(q=>state[q.id].reviewed).length}/${qs.length})`;}
  };
  const restore=()=>{for(const q of questions){const s=state[q.id];const response=card.querySelector<HTMLTextAreaElement>(`[data-response="${q.id}"]`);if(response)response.value=s.response;const check=card.querySelector<HTMLInputElement>(`[data-reviewed="${q.id}"]`);if(check)check.checked=s.reviewed;for(const kind of ['answer','hint'] as const){const d=card.querySelector<HTMLDetailsElement>(`[data-${kind}="${q.id}"]`);if(d)d.open=kind==='answer'?s.answerOpen:s.hintOpen;}}update();};
  const save=()=>{try{localStorage.setItem(key,JSON.stringify(state));available=true;}catch{available=false;}update();};
  const change=(event:Event)=>{const t=event.target;if(!(t instanceof HTMLElement))return;const id=t.dataset.response||t.dataset.reviewed||t.dataset.answer||t.dataset.hint;if(!id||!Object.hasOwn(state,id))return;
    if(t instanceof HTMLTextAreaElement)state[id].response=t.value.slice(0,12000);
    else if(t instanceof HTMLInputElement)state[id].reviewed=t.checked;
    else if(t instanceof HTMLDetailsElement){if(t.dataset.answer)state[id].answerOpen=t.open;else state[id].hintOpen=t.open;}
    else return;save();};
  const click=(event:Event)=>{const t=event.target;if(!(t instanceof Element))return;const button=t.closest<HTMLButtonElement>('button');if(!button)return;
    if(button.hasAttribute('data-study-reset')){state=normalizeStudyProgress(null,lesson);restore();save();}
    const variant=button.dataset.lessonExport;if(variant==='student'||variant==='key'){
      const blob=new Blob([lessonDocument(lesson,variant,language,source)],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${lesson.title.replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80)||'lesson'}-${variant}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  };
  restore();card.addEventListener('input',change);card.addEventListener('change',change);card.addEventListener('toggle',change,true);card.addEventListener('click',click);
  return ()=>{card.removeEventListener('input',change);card.removeEventListener('change',change);card.removeEventListener('toggle',change,true);card.removeEventListener('click',click);};
}
