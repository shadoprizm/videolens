import example from './shared/lessonExample.json' with { type: 'json' };
import {lessonHtml,LESSON_CSS} from './shared/lessonReport.js';
import {bindLessonStudy} from './shared/lessonStudy.js';
const style=document.createElement('style');style.textContent=LESSON_CSS;document.head.append(style);
const root=document.getElementById('lesson-example')!;
root.innerHTML=lessonHtml(example.lesson,'en');
bindLessonStudy(root,example.lesson,'public-demo:retrieval-v1','en');
