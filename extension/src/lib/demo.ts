import type { Analysis, QaEntry } from "./types";

export const DEMO_ANALYSIS: Analysis = {
  source: {
    sourceType: "local_file",
    title: "Sample report: Building products people actually use",
    url: null,
    durationSeconds: 842,
    limitations: [],
  },
  mode: "key_insights",
  outputLanguage: "en",
  prompt: "Extract the most important ideas, evidence, and practical takeaways.",
  summary:
    "The speaker argues that early products should optimize for repeated use, not premature monetization. The strongest signal is whether a specific user returns to solve the same problem without being prompted. The recommended process is to define one clear job, watch real users attempt it, and improve the moments where they hesitate or abandon the workflow.",
  timeline: {
    segments: [
      { start: 18, end: 52, sceneType: "talking head", transcript: "A product starts with a repeated problem, not a pricing page.", ocr: [], visualSummary: "Speaker introduces the central premise.", confidence: "high" },
      { start: 154, end: 206, sceneType: "presentation", transcript: "Return usage is the clearest early signal.", ocr: ["Activation → Value → Return"], visualSummary: "Three-stage product loop shown on screen.", confidence: "high" },
      { start: 388, end: 451, sceneType: "screen demo", transcript: "Watch where people stop and ask why.", ocr: ["Observe behavior, not intent"], visualSummary: "Session replay highlights a stalled workflow.", confidence: "high" },
      { start: 716, end: 778, sceneType: "presentation", transcript: "Charge only after the value is obvious and repeatable.", ocr: ["Useful → Repeated → Paid"], visualSummary: "Closing framework summarizes the sequence.", confidence: "high" },
    ],
  },
  findings: [
    {
      finding: "Repeated use is a stronger early product signal than stated interest.",
      evidence: [
        { timestamp: 18, detail: "The speaker frames the product around a problem that recurs, rather than a feature or pricing model." },
        { timestamp: 154, detail: "A three-stage loop—activation, value, return—is presented as the core measurement framework." },
      ],
      confidence: "high",
    },
    {
      finding: "Observation reveals product friction that interviews routinely miss.",
      evidence: [
        { timestamp: 388, detail: "A session replay example shows the user pausing where the team expected the next action to be obvious." },
      ],
      confidence: "high",
    },
    {
      finding: "Monetization should follow a reliable value loop, not substitute for one.",
      evidence: [
        { timestamp: 716, detail: "The closing framework explicitly orders the stages as useful, repeated, then paid." },
      ],
      confidence: "high",
    },
  ],
  recommendations: [
    { recommendation: "Choose one primary job for the next release.", rationale: "A narrow promise makes repeat usage and abandonment measurable.", confidence: "high" },
    { recommendation: "Watch five users complete the workflow without coaching.", rationale: "Record hesitations, failed expectations, and the moment each user first receives value.", confidence: "high" },
    { recommendation: "Measure report completion and a second analysis within seven days.", rationale: "These events approximate whether the product delivered enough value to return.", confidence: "medium" },
  ],
  tasks: [
    { title: "Define the single-sentence job to be done", detail: "Write the user, situation, desired outcome, and what the current alternative is." },
    { title: "Schedule five unmoderated usability sessions", detail: "Use the current product and avoid explaining the interface during the attempt." },
    { title: "Add activation and return-use measurement", detail: "Track only the minimum events needed to evaluate the product loop." },
  ],
  limitations: ["This sample demonstrates VideoLens report structure and export quality; it is not an analysis of the page currently open."],
  confidence: "high",
};

export const DEMO_QA: QaEntry[] = [
  {
    question: "What should the team measure first?",
    answer: "Start with successful report completion, then measure whether the same person creates another report within seven days. The framework at [02:34] treats return behavior as the strongest early proof that the workflow solved a recurring problem.",
  },
];

const ZH_CN_ANALYSIS: Analysis = {
  ...DEMO_ANALYSIS,
  source: { ...DEMO_ANALYSIS.source, title: "示例报告：打造用户真正会使用的产品" },
  outputLanguage: "zh-CN",
  prompt: "提取最重要的洞察、支持证据和实用结论。",
  summary: "演讲者认为，早期产品应优先追求重复使用，而不是过早变现。最强的信号是某个具体用户是否会在无人提醒的情况下再次回来解决同一个问题。建议的方法是定义一个明确任务，观察真实用户完成任务的过程，并改善他们犹豫或放弃的环节。",
  findings: [
    {
      finding: "重复使用比口头表达的兴趣更能说明早期产品是否有价值。",
      evidence: [
        { timestamp: 18, detail: "演讲者围绕一个会重复出现的问题来定义产品，而不是围绕功能或定价模式。" },
        { timestamp: 154, detail: "画面展示了“激活—获得价值—再次使用”的三阶段循环，作为核心衡量框架。" },
      ],
      confidence: "high",
    },
    {
      finding: "行为观察能发现访谈经常遗漏的产品阻力。",
      evidence: [{ timestamp: 388, detail: "会话回放示例显示，用户在团队以为下一步很明显的位置停了下来。" }],
      confidence: "high",
    },
    {
      finding: "变现应建立在可靠的价值循环之后，而不能替代价值循环。",
      evidence: [{ timestamp: 716, detail: "结尾框架明确给出了“有用—重复使用—付费”的顺序。" }],
      confidence: "high",
    },
  ],
  recommendations: [
    { recommendation: "为下一个版本选择一个最主要的用户任务。", rationale: "范围明确的承诺让重复使用和放弃行为都可以衡量。", confidence: "high" },
    { recommendation: "观察五名用户在没有指导的情况下完成工作流程。", rationale: "记录犹豫、预期落空以及每位用户首次获得价值的时刻。", confidence: "high" },
    { recommendation: "衡量报告完成率以及七天内的第二次分析。", rationale: "这些事件可以近似反映产品是否提供了足够的回访价值。", confidence: "medium" },
  ],
  tasks: [
    { title: "用一句话定义待完成的核心任务", detail: "写清用户、使用情境、期望结果以及当前替代方案。" },
    { title: "安排五次无引导可用性测试", detail: "使用当前产品，在用户操作时避免解释界面。" },
    { title: "添加激活和重复使用衡量", detail: "只跟踪评估产品循环所需的最少事件。" },
  ],
  limitations: ["此示例用于展示 VideoLens 的报告结构和导出质量，并非对当前页面的分析。"],
};

const ZH_TW_ANALYSIS: Analysis = {
  ...DEMO_ANALYSIS,
  source: { ...DEMO_ANALYSIS.source, title: "範例報告：打造使用者真正會使用的產品" },
  outputLanguage: "zh-TW",
  prompt: "擷取最重要的洞察、支持證據和實用結論。",
  summary: "講者認為，早期產品應優先追求重複使用，而不是過早變現。最強的訊號是某個具體使用者是否會在無人提醒的情況下再次回來解決同一個問題。建議的方法是定義一個明確任務，觀察真實使用者完成任務的過程，並改善他們猶豫或放棄的環節。",
  findings: [
    {
      finding: "重複使用比口頭表達的興趣更能說明早期產品是否有價值。",
      evidence: [
        { timestamp: 18, detail: "講者圍繞一個會重複出現的問題來定義產品，而不是圍繞功能或定價模式。" },
        { timestamp: 154, detail: "畫面展示了「啟用—獲得價值—再次使用」的三階段循環，作為核心衡量架構。" },
      ],
      confidence: "high",
    },
    {
      finding: "行為觀察能發現訪談經常遺漏的產品阻力。",
      evidence: [{ timestamp: 388, detail: "工作階段回放範例顯示，使用者在團隊以為下一步很明顯的位置停了下來。" }],
      confidence: "high",
    },
    {
      finding: "變現應建立在可靠的價值循環之後，而不能取代價值循環。",
      evidence: [{ timestamp: 716, detail: "結尾架構明確給出了「有用—重複使用—付費」的順序。" }],
      confidence: "high",
    },
  ],
  recommendations: [
    { recommendation: "為下一個版本選擇一個最主要的使用者任務。", rationale: "範圍明確的承諾讓重複使用和放棄行為都可以衡量。", confidence: "high" },
    { recommendation: "觀察五名使用者在沒有指導的情況下完成工作流程。", rationale: "記錄猶豫、預期落空以及每位使用者首次獲得價值的時刻。", confidence: "high" },
    { recommendation: "衡量報告完成率以及七天內的第二次分析。", rationale: "這些事件可以近似反映產品是否提供了足夠的回訪價值。", confidence: "medium" },
  ],
  tasks: [
    { title: "用一句話定義待完成的核心任務", detail: "寫清楚使用者、使用情境、期望結果以及目前替代方案。" },
    { title: "安排五次無引導可用性測試", detail: "使用目前產品，在使用者操作時避免解釋介面。" },
    { title: "加入啟用和重複使用衡量", detail: "只追蹤評估產品循環所需的最少事件。" },
  ],
  limitations: ["此範例用於展示 VideoLens 的報告結構和匯出品質，並非對目前頁面的分析。"],
};

const ES_419_ANALYSIS: Analysis = {
  ...DEMO_ANALYSIS,
  source: { ...DEMO_ANALYSIS.source, title: "Informe de muestra: Crear productos que la gente realmente use" },
  outputLanguage: "es",
  prompt: "Extrae las ideas más importantes, la evidencia que las respalda y las conclusiones prácticas.",
  summary: "El ponente sostiene que los productos nuevos deben priorizar el uso repetido, no una monetización prematura. La señal más fuerte es que una persona vuelva sin recordatorios para resolver el mismo problema. Recomienda definir una tarea clara, observar a usuarios reales y mejorar los momentos en los que dudan o abandonan el flujo.",
  timeline: { segments: [
    { start: 18, end: 52, sceneType: "persona hablando", transcript: "Un producto comienza con un problema recurrente, no con una página de precios.", ocr: [], visualSummary: "El ponente presenta la idea central.", confidence: "high" },
    { start: 154, end: 206, sceneType: "presentación", transcript: "El uso repetido es la señal temprana más clara.", ocr: ["Activación → Valor → Regreso"], visualSummary: "Se muestra en pantalla un ciclo de producto de tres etapas.", confidence: "high" },
    { start: 388, end: 451, sceneType: "demostración en pantalla", transcript: "Observa dónde se detienen las personas y pregunta por qué.", ocr: ["Observa el comportamiento, no la intención"], visualSummary: "Una repetición de sesión destaca un flujo detenido.", confidence: "high" },
    { start: 716, end: 778, sceneType: "presentación", transcript: "Cobra solo cuando el valor sea evidente y repetible.", ocr: ["Útil → Repetido → Pagado"], visualSummary: "El marco final resume la secuencia.", confidence: "high" },
  ] },
  findings: [
    { finding: "El uso repetido es una señal temprana más sólida que el interés declarado.", evidence: [
      { timestamp: 18, detail: "El ponente define el producto alrededor de un problema recurrente, no de una función o un modelo de precios." },
      { timestamp: 154, detail: "Se presenta un ciclo de tres etapas —activación, valor y regreso— como marco principal de medición." },
    ], confidence: "high" },
    { finding: "La observación descubre fricción que las entrevistas suelen pasar por alto.", evidence: [{ timestamp: 388, detail: "Una repetición de sesión muestra al usuario detenido donde el equipo esperaba que la siguiente acción fuera obvia." }], confidence: "high" },
    { finding: "La monetización debe seguir a un ciclo de valor confiable, no reemplazarlo.", evidence: [{ timestamp: 716, detail: "El marco final ordena explícitamente las etapas como útil, repetido y pagado." }], confidence: "high" },
  ],
  recommendations: [
    { recommendation: "Elige una tarea principal para la próxima versión.", rationale: "Una promesa concreta permite medir el uso repetido y el abandono.", confidence: "high" },
    { recommendation: "Observa a cinco usuarios completar el flujo sin ayuda.", rationale: "Registra dudas, expectativas fallidas y el momento en que cada persona recibe valor por primera vez.", confidence: "high" },
    { recommendation: "Mide la finalización del informe y un segundo análisis dentro de siete días.", rationale: "Estos eventos aproximan si el producto aportó suficiente valor para volver.", confidence: "medium" },
  ],
  tasks: [
    { title: "Define la tarea principal en una oración", detail: "Describe a la persona, la situación, el resultado deseado y la alternativa actual." },
    { title: "Programa cinco sesiones de usabilidad sin moderación", detail: "Usa el producto actual y evita explicar la interfaz durante el intento." },
    { title: "Agrega medición de activación y regreso", detail: "Registra solo los eventos mínimos necesarios para evaluar el ciclo del producto." },
  ],
  limitations: ["Esta muestra presenta la estructura y la calidad de exportación de VideoLens; no analiza la página que está abierta."],
};

const RO_ANALYSIS: Analysis = {
  ...DEMO_ANALYSIS,
  source: { ...DEMO_ANALYSIS.source, title: "Raport demonstrativ: Cum construiești produse pe care oamenii chiar le folosesc" },
  outputLanguage: "ro",
  prompt: "Extrage ideile cele mai importante, dovezile care le susțin și concluziile practice.",
  summary: "Vorbitorul susține că produsele aflate la început trebuie să urmărească utilizarea repetată, nu monetizarea prematură. Cel mai puternic semnal este revenirea unui anumit utilizator pentru a rezolva aceeași problemă, fără să i se amintească. Procesul recomandat este definirea unei sarcini clare, observarea utilizatorilor reali și îmbunătățirea momentelor în care aceștia ezită sau abandonează fluxul.",
  timeline: { segments: [
    { start: 18, end: 52, sceneType: "vorbitor", transcript: "Un produs începe cu o problemă repetată, nu cu o pagină de prețuri.", ocr: [], visualSummary: "Vorbitorul prezintă ideea centrală.", confidence: "high" },
    { start: 154, end: 206, sceneType: "prezentare", transcript: "Revenirea este cel mai clar semnal timpuriu.", ocr: ["Activare → Valoare → Revenire"], visualSummary: "Pe ecran apare un ciclu de produs în trei etape.", confidence: "high" },
    { start: 388, end: 451, sceneType: "demonstrație pe ecran", transcript: "Observă unde se opresc oamenii și întreabă de ce.", ocr: ["Observă comportamentul, nu intenția"], visualSummary: "Reluarea unei sesiuni evidențiază un flux blocat.", confidence: "high" },
    { start: 716, end: 778, sceneType: "prezentare", transcript: "Cere bani doar după ce valoarea este evidentă și repetabilă.", ocr: ["Util → Repetat → Plătit"], visualSummary: "Cadrul final rezumă succesiunea.", confidence: "high" },
  ] },
  findings: [
    { finding: "Utilizarea repetată este un semnal timpuriu mai puternic decât interesul declarat.", evidence: [
      { timestamp: 18, detail: "Vorbitorul definește produsul în jurul unei probleme recurente, nu al unei funcții sau al unui model de preț." },
      { timestamp: 154, detail: "Un ciclu în trei etape — activare, valoare, revenire — este prezentat drept principalul cadru de măsurare." },
    ], confidence: "high" },
    { finding: "Observarea scoate la iveală dificultăți pe care interviurile le omit adesea.", evidence: [{ timestamp: 388, detail: "Reluarea unei sesiuni arată utilizatorul oprindu-se acolo unde echipa se aștepta ca următoarea acțiune să fie evidentă." }], confidence: "high" },
    { finding: "Monetizarea trebuie să urmeze unui ciclu de valoare fiabil, nu să îl înlocuiască.", evidence: [{ timestamp: 716, detail: "Cadrul final ordonează explicit etapele astfel: util, repetat, apoi plătit." }], confidence: "high" },
  ],
  recommendations: [
    { recommendation: "Alege o singură sarcină principală pentru versiunea următoare.", rationale: "O promisiune restrânsă face măsurabile revenirea și abandonul.", confidence: "high" },
    { recommendation: "Observă cinci utilizatori parcurgând fluxul fără îndrumare.", rationale: "Înregistrează ezitările, așteptările neîndeplinite și momentul în care fiecare utilizator obține prima valoare.", confidence: "high" },
    { recommendation: "Măsoară finalizarea raportului și o a doua analiză în șapte zile.", rationale: "Aceste evenimente aproximează dacă produsul a oferit suficientă valoare pentru revenire.", confidence: "medium" },
  ],
  tasks: [
    { title: "Definește sarcina principală într-o singură propoziție", detail: "Precizează utilizatorul, situația, rezultatul dorit și alternativa actuală." },
    { title: "Programează cinci sesiuni de utilizare nemoderate", detail: "Folosește produsul actual și evită să explici interfața în timpul încercării." },
    { title: "Adaugă măsurarea activării și revenirii", detail: "Urmărește doar evenimentele minime necesare evaluării ciclului produsului." },
  ],
  limitations: ["Acest exemplu prezintă structura raportului VideoLens și calitatea exportului; nu este o analiză a paginii deschise."],
};

const HI_ANALYSIS: Analysis = {
  ...DEMO_ANALYSIS,
  source: { ...DEMO_ANALYSIS.source, title: "नमूना रिपोर्ट: ऐसे उत्पाद बनाना जिन्हें लोग सच में इस्तेमाल करें" },
  outputLanguage: "hi",
  prompt: "सबसे महत्वपूर्ण जानकारियाँ, सहायक प्रमाण और व्यावहारिक निष्कर्ष निकालें।",
  summary: "वक्ता का तर्क है कि शुरुआती उत्पादों को समय से पहले कमाई पर नहीं, बार-बार उपयोग पर ध्यान देना चाहिए। सबसे मजबूत संकेत यह है कि कोई खास उपयोगकर्ता बिना याद दिलाए उसी समस्या को हल करने के लिए लौटता है या नहीं। सुझाई गई प्रक्रिया है—एक स्पष्ट काम तय करना, वास्तविक उपयोगकर्ताओं को उसे करते हुए देखना और उन क्षणों को सुधारना जहाँ वे रुकते या प्रक्रिया छोड़ देते हैं।",
  timeline: { segments: [
    { start: 18, end: 52, sceneType: "बोलता हुआ व्यक्ति", transcript: "उत्पाद की शुरुआत बार-बार आने वाली समस्या से होती है, मूल्य निर्धारण पेज से नहीं।", ocr: [], visualSummary: "वक्ता मुख्य विचार प्रस्तुत करता है।", confidence: "high" },
    { start: 154, end: 206, sceneType: "प्रस्तुति", transcript: "दोबारा उपयोग सबसे स्पष्ट शुरुआती संकेत है।", ocr: ["सक्रियण → मूल्य → वापसी"], visualSummary: "स्क्रीन पर उत्पाद का तीन-चरणीय चक्र दिखता है।", confidence: "high" },
    { start: 388, end: 451, sceneType: "स्क्रीन डेमो", transcript: "देखें कि लोग कहाँ रुकते हैं और पूछें कि क्यों।", ocr: ["इरादे नहीं, व्यवहार देखें"], visualSummary: "सेशन रीप्ले रुकी हुई प्रक्रिया दिखाता है।", confidence: "high" },
    { start: 716, end: 778, sceneType: "प्रस्तुति", transcript: "शुल्क तभी लें जब मूल्य स्पष्ट और दोहराने योग्य हो।", ocr: ["उपयोगी → दोहराया गया → भुगतान"], visualSummary: "अंतिम ढाँचा क्रम का सार बताता है।", confidence: "high" },
  ] },
  findings: [
    { finding: "बार-बार उपयोग, बताई गई रुचि से अधिक मजबूत शुरुआती उत्पाद संकेत है।", evidence: [
      { timestamp: 18, detail: "वक्ता उत्पाद को किसी सुविधा या मूल्य मॉडल के बजाय बार-बार आने वाली समस्या के आधार पर परिभाषित करता है।" },
      { timestamp: 154, detail: "सक्रियण, मूल्य और वापसी का तीन-चरणीय चक्र मुख्य मापन ढाँचे के रूप में दिखाया गया है।" },
    ], confidence: "high" },
    { finding: "अवलोकन उन उत्पाद बाधाओं को दिखाता है जिन्हें इंटरव्यू अक्सर नहीं पकड़ पाते।", evidence: [{ timestamp: 388, detail: "सेशन रीप्ले में उपयोगकर्ता वहाँ रुकता है जहाँ टीम को अगला कदम स्पष्ट लग रहा था।" }], confidence: "high" },
    { finding: "कमाई एक भरोसेमंद मूल्य चक्र के बाद आनी चाहिए, उसकी जगह नहीं लेनी चाहिए।", evidence: [{ timestamp: 716, detail: "अंतिम ढाँचा चरणों को स्पष्ट रूप से उपयोगी, दोहराया गया और फिर भुगतान के क्रम में रखता है।" }], confidence: "high" },
  ],
  recommendations: [
    { recommendation: "अगले संस्करण के लिए एक मुख्य काम चुनें।", rationale: "एक सीमित वादा बार-बार उपयोग और प्रक्रिया छोड़ने को मापने योग्य बनाता है।", confidence: "high" },
    { recommendation: "पाँच उपयोगकर्ताओं को बिना मार्गदर्शन प्रक्रिया पूरी करते देखें।", rationale: "झिझक, अधूरी अपेक्षाएँ और हर उपयोगकर्ता को पहली बार मूल्य मिलने का क्षण दर्ज करें।", confidence: "high" },
    { recommendation: "रिपोर्ट पूरी होने और सात दिनों के भीतर दूसरे विश्लेषण को मापें।", rationale: "ये घटनाएँ बताती हैं कि उत्पाद ने लौटने लायक पर्याप्त मूल्य दिया या नहीं।", confidence: "medium" },
  ],
  tasks: [
    { title: "मुख्य काम को एक वाक्य में परिभाषित करें", detail: "उपयोगकर्ता, परिस्थिति, वांछित परिणाम और मौजूदा विकल्प लिखें।" },
    { title: "बिना संचालन वाले पाँच उपयोगिता सत्र तय करें", detail: "मौजूदा उत्पाद इस्तेमाल करें और प्रयास के दौरान इंटरफ़ेस न समझाएँ।" },
    { title: "सक्रियण और वापसी के माप जोड़ें", detail: "उत्पाद चक्र के मूल्यांकन के लिए आवश्यक न्यूनतम घटनाएँ ही मापें।" },
  ],
  limitations: ["यह नमूना VideoLens रिपोर्ट की संरचना और निर्यात गुणवत्ता दिखाता है; यह खुले हुए पेज का विश्लेषण नहीं है।"],
};

const ZH_CN_QA: QaEntry[] = [{
  question: "团队首先应该衡量什么？",
  answer: "先衡量报告是否成功完成，再衡量同一个人是否会在七天内创建第二份报告。[02:34] 的框架将再次使用视为工作流程解决了重复问题的最有力早期证据。",
}];

const ZH_TW_QA: QaEntry[] = [{
  question: "團隊首先應該衡量什麼？",
  answer: "先衡量報告是否成功完成，再衡量同一個人是否會在七天內建立第二份報告。[02:34] 的架構將再次使用視為工作流程解決了重複問題的最有力早期證據。",
}];

const ES_419_QA: QaEntry[] = [{
  question: "¿Qué debería medir primero el equipo?",
  answer: "Primero mide la finalización correcta del informe y luego si la misma persona crea otro dentro de siete días. El marco de [02:34] considera el regreso como la mejor prueba temprana de que el flujo resolvió un problema recurrente.",
}];

const RO_QA: QaEntry[] = [{
  question: "Ce ar trebui să măsoare echipa mai întâi?",
  answer: "Începe cu finalizarea corectă a raportului, apoi măsoară dacă aceeași persoană creează un alt raport în șapte zile. Cadrul de la [02:34] tratează revenirea drept cea mai puternică dovadă timpurie că fluxul a rezolvat o problemă recurentă.",
}];

const HI_QA: QaEntry[] = [{
  question: "टीम को सबसे पहले क्या मापना चाहिए?",
  answer: "पहले रिपोर्ट के सफलतापूर्वक पूरा होने को मापें, फिर देखें कि वही व्यक्ति सात दिनों के भीतर दूसरी रिपोर्ट बनाता है या नहीं। [02:34] का ढाँचा वापसी को इस बात का सबसे मजबूत शुरुआती प्रमाण मानता है कि प्रक्रिया ने बार-बार आने वाली समस्या हल की।",
}];

export function demoContent(language: string): { analysis: Analysis; qa: QaEntry[] } {
  const normalized = language.replace(/_/g, "-").toLowerCase();
  if (normalized.startsWith("zh-tw") || normalized.startsWith("zh-hk") || normalized.includes("hant")) {
    return { analysis: ZH_TW_ANALYSIS, qa: ZH_TW_QA };
  }
  if (normalized.startsWith("zh")) return { analysis: ZH_CN_ANALYSIS, qa: ZH_CN_QA };
  if (normalized.startsWith("es")) return { analysis: ES_419_ANALYSIS, qa: ES_419_QA };
  if (normalized.startsWith("ro")) return { analysis: RO_ANALYSIS, qa: RO_QA };
  if (normalized.startsWith("hi")) return { analysis: HI_ANALYSIS, qa: HI_QA };
  return { analysis: DEMO_ANALYSIS, qa: DEMO_QA };
}
