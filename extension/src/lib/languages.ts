import { lessonCopy } from "./lessonCopy";
import { procedureCopy } from "./procedureCopy";
import { recipeCopy } from "./recipeCopy";
import type { AnalysisMode } from "./types";

export const REPORT_LANGUAGE_OPTIONS = [
  "browser",
  "source",
  "en",
  "zh-CN",
  "zh-TW",
  "es",
  "pt-BR",
  "ja",
  "ko",
  "fr",
  "de",
  "ro",
  "hi",
] as const;

export type ReportLanguage = (typeof REPORT_LANGUAGE_OPTIONS)[number];
export type ConcreteReportLanguage = Exclude<ReportLanguage, "browser" | "source">;

export const REPORT_LANGUAGE_NAMES: Record<ReportLanguage, string> = {
  browser: "Browser language",
  source: "Same as video",
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  es: "Español (Latinoamérica)",
  "pt-BR": "Português (Brasil)",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  de: "Deutsch",
  ro: "Română",
  hi: "हिन्दी",
};

export function isReportLanguage(value: unknown): value is ReportLanguage {
  return REPORT_LANGUAGE_OPTIONS.includes(value as ReportLanguage);
}

export function normalizeLanguageTag(value: string | null | undefined): ConcreteReportLanguage | null {
  if (!value) return null;
  const normalized = value.trim().replace(/_/g, "-").toLowerCase();
  if (normalized.startsWith("zh")) {
    return /(?:^|-)(?:tw|hk|mo|hant)(?:-|$)/.test(normalized) ? "zh-TW" : "zh-CN";
  }
  if (normalized.startsWith("pt")) return "pt-BR";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("ro")) return "ro";
  if (normalized.startsWith("hi")) return "hi";
  if (normalized.startsWith("en")) return "en";
  return null;
}

export function resolveReportLanguage(
  preference: ReportLanguage,
  browserLanguage: string,
  sourceLanguage?: string | null,
): ConcreteReportLanguage | "source" {
  if (preference === "browser") return normalizeLanguageTag(browserLanguage) ?? "en";
  if (preference === "source") return normalizeLanguageTag(sourceLanguage) ?? "source";
  return preference;
}

export function languageInstruction(language: ConcreteReportLanguage | "source"): string {
  if (language === "source") {
    return "Write all natural-language output in the dominant language of the transcript or visible source content. If the source language is unclear, use English.";
  }
  return `Write all natural-language output in ${REPORT_LANGUAGE_NAMES[language]} (${language}). Preserve names, code, URLs, quoted on-screen text, and timestamps exactly when translation would reduce accuracy.`;
}

export interface ReportCopy {
  locale: string;
  untitledVideo: string;
  report: string;
  reportStyle: string;
  prompt: string;
  source: string;
  duration: string;
  notAvailable: string;
  overallConfidence: string;
  confidence: string;
  prepared: string;
  executiveSummary: string;
  none: string;
  keyFindings: string;
  findings: string;
  recommendations: string;
  actionItems: string;
  limitations: string;
  followUpQa: string;
  generatedBy: string;
  openOriginal: string;
  localFile: string;
  aiVideoReport: string;
  fallbackSummary: string;
  noSummary: string;
  overview: string;
  evidence: string;
  implications: string;
  nextSteps: string;
  followUp: string;
  questionsAnswers: string;
  scopeLimitations: string;
  analysisBrief: string;
  question: string;
  videoIntelligence: string;
  generatedLocally: string;
  confidenceLabels: Record<"high" | "medium" | "low", string>;
  modeLabels: Record<AnalysisMode, string>;
}

const EN_MODE_LABELS: Record<AnalysisMode, string> = {
  recipe: recipeCopy("en").label,
  general: "Detailed report",
  key_insights: "Key insights",
  bug: "Bug report",
  meeting: "Meeting",
  ux: "UX review",
  lesson: "Create a Lesson",
  tutorial: "Tutorial",
  interview: "Interview / podcast",
  product_demo: "Product demo",
  content: "Content review",
  privacy: "Privacy scan",
};

const ZH_CN_MODE_LABELS: Record<AnalysisMode, string> = {
  recipe: recipeCopy("zh-CN").label,
  general: "详细报告", key_insights: "核心洞察", bug: "错误报告", meeting: "会议纪要",
  lesson: "创建课程", ux: "用户体验评审", tutorial: "教程指南", interview: "访谈 / 播客",
  product_demo: "产品演示", content: "内容评审", privacy: "隐私扫描",
};

const ZH_TW_MODE_LABELS: Record<AnalysisMode, string> = {
  recipe: recipeCopy("zh-TW").label,
  general: "詳細報告", key_insights: "核心洞察", bug: "錯誤報告", meeting: "會議紀要",
  lesson: "建立課程", ux: "使用者體驗評審", tutorial: "教學指南", interview: "訪談 / Podcast",
  product_demo: "產品展示", content: "內容評審", privacy: "隱私掃描",
};

export const REPORT_COPY: Record<ConcreteReportLanguage, ReportCopy> = {
  en: {
    locale: "en", untitledVideo: "Untitled video", report: "VideoLens Report", reportStyle: "Report style",
    prompt: "Prompt", source: "Source", duration: "Duration", notAvailable: "Not available",
    overallConfidence: "Overall confidence", confidence: "Confidence", prepared: "Prepared",
    executiveSummary: "Executive summary", none: "(none)", keyFindings: "Key findings", findings: "findings",
    recommendations: "Recommendations", actionItems: "Action items", limitations: "Limitations",
    followUpQa: "Follow-up Q&A", generatedBy: "Generated by VideoLens", openOriginal: "Open original video",
    localFile: "Local video file", aiVideoReport: "AI VIDEO REPORT",
    fallbackSummary: "A timestamped, evidence-grounded report generated from the video.",
    noSummary: "No summary was returned.", overview: "Overview", evidence: "Evidence", implications: "Implications",
    nextSteps: "Next steps", followUp: "Follow-up", questionsAnswers: "Questions & answers",
    scopeLimitations: "Scope & limitations", analysisBrief: "Analysis brief", question: "Question",
    videoIntelligence: "Video to written intelligence", generatedLocally: "Generated locally in your browser",
    confidenceLabels: { high: "high", medium: "medium", low: "low" }, modeLabels: EN_MODE_LABELS,
  },
  "zh-CN": {
    locale: "zh-CN", untitledVideo: "未命名视频", report: "VideoLens 报告", reportStyle: "报告类型",
    prompt: "分析要求", source: "来源", duration: "时长", notAvailable: "暂无",
    overallConfidence: "总体可信度", confidence: "可信度", prepared: "生成时间",
    executiveSummary: "执行摘要", none: "（无）", keyFindings: "核心发现", findings: "项发现",
    recommendations: "建议", actionItems: "行动项", limitations: "局限",
    followUpQa: "后续问答", generatedBy: "由 VideoLens 生成", openOriginal: "打开原视频",
    localFile: "本地视频文件", aiVideoReport: "AI 视频报告",
    fallbackSummary: "一份包含时间戳、以证据为依据的视频分析报告。", noSummary: "未返回摘要。",
    overview: "概览", evidence: "证据", implications: "建议", nextSteps: "下一步", followUp: "后续问答",
    questionsAnswers: "问题与回答", scopeLimitations: "范围与局限", analysisBrief: "分析要求",
    question: "问题", videoIntelligence: "将视频转化为书面洞察", generatedLocally: "在您的浏览器中本地生成",
    confidenceLabels: { high: "高", medium: "中", low: "低" }, modeLabels: ZH_CN_MODE_LABELS,
  },
  "zh-TW": {
    locale: "zh-TW", untitledVideo: "未命名影片", report: "VideoLens 報告", reportStyle: "報告類型",
    prompt: "分析要求", source: "來源", duration: "片長", notAvailable: "無資料",
    overallConfidence: "整體可信度", confidence: "可信度", prepared: "產生時間",
    executiveSummary: "執行摘要", none: "（無）", keyFindings: "核心發現", findings: "項發現",
    recommendations: "建議", actionItems: "行動項目", limitations: "限制",
    followUpQa: "後續問答", generatedBy: "由 VideoLens 產生", openOriginal: "開啟原始影片",
    localFile: "本機影片檔案", aiVideoReport: "AI 影片報告",
    fallbackSummary: "一份包含時間戳、以證據為依據的影片分析報告。", noSummary: "未傳回摘要。",
    overview: "概覽", evidence: "證據", implications: "建議", nextSteps: "下一步", followUp: "後續問答",
    questionsAnswers: "問題與回答", scopeLimitations: "範圍與限制", analysisBrief: "分析要求",
    question: "問題", videoIntelligence: "將影片轉化為書面洞察", generatedLocally: "在您的瀏覽器中本機產生",
    confidenceLabels: { high: "高", medium: "中", low: "低" }, modeLabels: ZH_TW_MODE_LABELS,
  },
  es: {
    locale: "es-419", untitledVideo: "Video sin título", report: "Informe de VideoLens", reportStyle: "Tipo de informe",
    prompt: "Solicitud", source: "Fuente", duration: "Duración", notAvailable: "No disponible",
    overallConfidence: "Confianza general", confidence: "Confianza", prepared: "Preparado",
    executiveSummary: "Resumen ejecutivo", none: "(ninguno)", keyFindings: "Hallazgos clave", findings: "hallazgos",
    recommendations: "Recomendaciones", actionItems: "Acciones", limitations: "Limitaciones",
    followUpQa: "Preguntas de seguimiento", generatedBy: "Generado por VideoLens", openOriginal: "Abrir video original",
    localFile: "Archivo de video local", aiVideoReport: "INFORME DE VIDEO CON IA",
    fallbackSummary: "Un informe con marcas de tiempo y basado en la evidencia del video.", noSummary: "No se devolvió ningún resumen.",
    overview: "Resumen", evidence: "Evidencia", implications: "Implicaciones", nextSteps: "Próximos pasos",
    followUp: "Seguimiento", questionsAnswers: "Preguntas y respuestas", scopeLimitations: "Alcance y limitaciones",
    analysisBrief: "Objetivo del análisis", question: "Pregunta", videoIntelligence: "Del video a conocimiento escrito",
    generatedLocally: "Generado localmente en tu navegador", confidenceLabels: { high: "alta", medium: "media", low: "baja" },
    modeLabels: { ...EN_MODE_LABELS, general: "Informe detallado", key_insights: "Ideas clave", bug: "Informe de error", meeting: "Reunión", ux: "Revisión de UX", tutorial: "Tutorial", interview: "Entrevista / pódcast", product_demo: "Demostración de producto", content: "Revisión de contenido", privacy: "Análisis de privacidad" },
  },
  "pt-BR": {
    locale: "pt-BR", untitledVideo: "Vídeo sem título", report: "Relatório VideoLens", reportStyle: "Tipo de relatório",
    prompt: "Solicitação", source: "Fonte", duration: "Duração", notAvailable: "Indisponível",
    overallConfidence: "Confiança geral", confidence: "Confiança", prepared: "Preparado em",
    executiveSummary: "Resumo executivo", none: "(nenhum)", keyFindings: "Principais descobertas", findings: "descobertas",
    recommendations: "Recomendações", actionItems: "Ações", limitations: "Limitações",
    followUpQa: "Perguntas de acompanhamento", generatedBy: "Gerado pelo VideoLens", openOriginal: "Abrir vídeo original",
    localFile: "Arquivo de vídeo local", aiVideoReport: "RELATÓRIO DE VÍDEO COM IA",
    fallbackSummary: "Um relatório com marcações de tempo, fundamentado nas evidências do vídeo.", noSummary: "Nenhum resumo foi retornado.",
    overview: "Visão geral", evidence: "Evidências", implications: "Implicações", nextSteps: "Próximos passos",
    followUp: "Acompanhamento", questionsAnswers: "Perguntas e respostas", scopeLimitations: "Escopo e limitações",
    analysisBrief: "Objetivo da análise", question: "Pergunta", videoIntelligence: "Do vídeo à inteligência escrita",
    generatedLocally: "Gerado localmente no seu navegador", confidenceLabels: { high: "alta", medium: "média", low: "baixa" },
    modeLabels: { ...EN_MODE_LABELS, general: "Relatório detalhado", key_insights: "Principais insights", bug: "Relatório de erro", meeting: "Reunião", ux: "Análise de UX", tutorial: "Tutorial", interview: "Entrevista / podcast", product_demo: "Demonstração de produto", content: "Análise de conteúdo", privacy: "Verificação de privacidade" },
  },
  ja: {
    locale: "ja", untitledVideo: "無題の動画", report: "VideoLens レポート", reportStyle: "レポート形式",
    prompt: "分析指示", source: "ソース", duration: "長さ", notAvailable: "情報なし", overallConfidence: "総合信頼度",
    confidence: "信頼度", prepared: "作成日時", executiveSummary: "エグゼクティブサマリー", none: "（なし）",
    keyFindings: "主な発見", findings: "件", recommendations: "推奨事項", actionItems: "アクション項目",
    limitations: "制約", followUpQa: "フォローアップQ&A", generatedBy: "VideoLens により生成",
    openOriginal: "元の動画を開く", localFile: "ローカル動画ファイル", aiVideoReport: "AI 動画レポート",
    fallbackSummary: "タイムスタンプ付きで、動画の根拠に基づく分析レポートです。", noSummary: "要約は返されませんでした。",
    overview: "概要", evidence: "根拠", implications: "提案", nextSteps: "次のステップ", followUp: "フォローアップ",
    questionsAnswers: "質問と回答", scopeLimitations: "範囲と制約", analysisBrief: "分析指示", question: "質問",
    videoIntelligence: "動画を文章の知見へ", generatedLocally: "ブラウザ内でローカル生成",
    confidenceLabels: { high: "高", medium: "中", low: "低" },
    modeLabels: { ...EN_MODE_LABELS, general: "詳細レポート", key_insights: "重要な洞察", bug: "バグレポート", meeting: "会議", ux: "UXレビュー", tutorial: "チュートリアル", interview: "インタビュー / ポッドキャスト", product_demo: "製品デモ", content: "コンテンツレビュー", privacy: "プライバシースキャン" },
  },
  ko: {
    locale: "ko", untitledVideo: "제목 없는 동영상", report: "VideoLens 보고서", reportStyle: "보고서 형식",
    prompt: "분석 요청", source: "출처", duration: "길이", notAvailable: "정보 없음", overallConfidence: "전체 신뢰도",
    confidence: "신뢰도", prepared: "작성일", executiveSummary: "요약", none: "(없음)", keyFindings: "주요 발견",
    findings: "개 발견", recommendations: "권장 사항", actionItems: "실행 항목", limitations: "제한 사항",
    followUpQa: "후속 질문과 답변", generatedBy: "VideoLens에서 생성", openOriginal: "원본 동영상 열기",
    localFile: "로컬 동영상 파일", aiVideoReport: "AI 동영상 보고서",
    fallbackSummary: "타임스탬프와 동영상 근거를 포함한 분석 보고서입니다.", noSummary: "요약이 반환되지 않았습니다.",
    overview: "개요", evidence: "근거", implications: "제안", nextSteps: "다음 단계", followUp: "후속 질문",
    questionsAnswers: "질문과 답변", scopeLimitations: "범위 및 제한", analysisBrief: "분석 요청", question: "질문",
    videoIntelligence: "동영상을 글로 된 인사이트로", generatedLocally: "브라우저에서 로컬로 생성",
    confidenceLabels: { high: "높음", medium: "보통", low: "낮음" },
    modeLabels: { ...EN_MODE_LABELS, general: "상세 보고서", key_insights: "핵심 인사이트", bug: "버그 보고서", meeting: "회의", ux: "UX 검토", tutorial: "튜토리얼", interview: "인터뷰 / 팟캐스트", product_demo: "제품 데모", content: "콘텐츠 검토", privacy: "개인정보 검사" },
  },
  fr: {
    locale: "fr", untitledVideo: "Vidéo sans titre", report: "Rapport VideoLens", reportStyle: "Type de rapport",
    prompt: "Demande", source: "Source", duration: "Durée", notAvailable: "Indisponible", overallConfidence: "Confiance globale",
    confidence: "Confiance", prepared: "Préparé le", executiveSummary: "Résumé exécutif", none: "(aucun)",
    keyFindings: "Constats clés", findings: "constats", recommendations: "Recommandations", actionItems: "Actions",
    limitations: "Limites", followUpQa: "Questions de suivi", generatedBy: "Généré par VideoLens",
    openOriginal: "Ouvrir la vidéo originale", localFile: "Fichier vidéo local", aiVideoReport: "RAPPORT VIDÉO IA",
    fallbackSummary: "Un rapport horodaté fondé sur les éléments observés dans la vidéo.", noSummary: "Aucun résumé n’a été renvoyé.",
    overview: "Vue d’ensemble", evidence: "Éléments probants", implications: "Implications", nextSteps: "Prochaines étapes",
    followUp: "Suivi", questionsAnswers: "Questions et réponses", scopeLimitations: "Périmètre et limites",
    analysisBrief: "Objectif de l’analyse", question: "Question", videoIntelligence: "De la vidéo à l’intelligence écrite",
    generatedLocally: "Généré localement dans votre navigateur", confidenceLabels: { high: "élevée", medium: "moyenne", low: "faible" },
    modeLabels: { ...EN_MODE_LABELS, general: "Rapport détaillé", key_insights: "Idées clés", bug: "Rapport de bug", meeting: "Réunion", ux: "Évaluation UX", tutorial: "Tutoriel", interview: "Entretien / podcast", product_demo: "Démonstration produit", content: "Évaluation du contenu", privacy: "Analyse de confidentialité" },
  },
  de: {
    locale: "de", untitledVideo: "Unbenanntes Video", report: "VideoLens-Bericht", reportStyle: "Berichtsart",
    prompt: "Auftrag", source: "Quelle", duration: "Dauer", notAvailable: "Nicht verfügbar", overallConfidence: "Gesamtkonfidenz",
    confidence: "Konfidenz", prepared: "Erstellt", executiveSummary: "Kurzfassung", none: "(keine)",
    keyFindings: "Wichtigste Erkenntnisse", findings: "Erkenntnisse", recommendations: "Empfehlungen",
    actionItems: "Aufgaben", limitations: "Einschränkungen", followUpQa: "Nachfragen und Antworten",
    generatedBy: "Erstellt mit VideoLens", openOriginal: "Originalvideo öffnen", localFile: "Lokale Videodatei",
    aiVideoReport: "KI-VIDEOBERICHT", fallbackSummary: "Ein Bericht mit Zeitstempeln, der sich auf die Belege im Video stützt.",
    noSummary: "Es wurde keine Zusammenfassung zurückgegeben.", overview: "Überblick", evidence: "Belege",
    implications: "Folgerungen", nextSteps: "Nächste Schritte", followUp: "Nachfragen", questionsAnswers: "Fragen und Antworten",
    scopeLimitations: "Umfang und Einschränkungen", analysisBrief: "Analyseauftrag", question: "Frage",
    videoIntelligence: "Vom Video zu schriftlichen Erkenntnissen", generatedLocally: "Lokal in Ihrem Browser erstellt",
    confidenceLabels: { high: "hoch", medium: "mittel", low: "niedrig" },
    modeLabels: { ...EN_MODE_LABELS, general: "Ausführlicher Bericht", key_insights: "Kernaussagen", bug: "Fehlerbericht", meeting: "Besprechung", ux: "UX-Analyse", tutorial: "Anleitung", interview: "Interview / Podcast", product_demo: "Produktdemo", content: "Inhaltsanalyse", privacy: "Datenschutzprüfung" },
  },
  ro: {
    locale: "ro", untitledVideo: "Videoclip fără titlu", report: "Raport VideoLens", reportStyle: "Tip de raport",
    prompt: "Instrucțiune", source: "Sursă", duration: "Durată", notAvailable: "Indisponibil",
    overallConfidence: "Încredere generală", confidence: "Încredere", prepared: "Pregătit",
    executiveSummary: "Rezumat executiv", none: "(niciunul)", keyFindings: "Constatări principale", findings: "constatări",
    recommendations: "Recomandări", actionItems: "Acțiuni", limitations: "Limitări",
    followUpQa: "Întrebări și răspunsuri ulterioare", generatedBy: "Generat de VideoLens", openOriginal: "Deschide videoclipul original",
    localFile: "Fișier video local", aiVideoReport: "RAPORT VIDEO CU AI",
    fallbackSummary: "Un raport cu marcaje temporale, bazat pe dovezile din videoclip.", noSummary: "Nu a fost returnat niciun rezumat.",
    overview: "Prezentare generală", evidence: "Dovezi", implications: "Implicații", nextSteps: "Pașii următori",
    followUp: "Continuare", questionsAnswers: "Întrebări și răspunsuri", scopeLimitations: "Domeniu și limitări",
    analysisBrief: "Obiectivul analizei", question: "Întrebare", videoIntelligence: "De la video la informații scrise",
    generatedLocally: "Generat local în browser", confidenceLabels: { high: "ridicată", medium: "medie", low: "scăzută" },
    modeLabels: { ...EN_MODE_LABELS, general: "Raport detaliat", key_insights: "Idei principale", bug: "Raport de eroare", meeting: "Ședință", ux: "Evaluare UX", tutorial: "Tutorial", interview: "Interviu / podcast", product_demo: "Demonstrație de produs", content: "Evaluarea conținutului", privacy: "Scanare de confidențialitate" },
  },
  hi: {
    locale: "hi", untitledVideo: "बिना शीर्षक का वीडियो", report: "VideoLens रिपोर्ट", reportStyle: "रिपोर्ट का प्रकार",
    prompt: "निर्देश", source: "स्रोत", duration: "अवधि", notAvailable: "उपलब्ध नहीं",
    overallConfidence: "समग्र विश्वसनीयता", confidence: "विश्वसनीयता", prepared: "तैयार किया गया",
    executiveSummary: "कार्यकारी सारांश", none: "(कोई नहीं)", keyFindings: "मुख्य निष्कर्ष", findings: "निष्कर्ष",
    recommendations: "सुझाव", actionItems: "कार्रवाई के बिंदु", limitations: "सीमाएँ",
    followUpQa: "अनुवर्ती सवाल-जवाब", generatedBy: "VideoLens द्वारा तैयार", openOriginal: "मूल वीडियो खोलें",
    localFile: "स्थानीय वीडियो फ़ाइल", aiVideoReport: "AI वीडियो रिपोर्ट",
    fallbackSummary: "वीडियो के प्रमाण पर आधारित, समय-चिह्नों वाली रिपोर्ट।", noSummary: "कोई सारांश नहीं मिला।",
    overview: "अवलोकन", evidence: "प्रमाण", implications: "निहितार्थ", nextSteps: "अगले चरण",
    followUp: "अनुवर्ती", questionsAnswers: "सवाल और जवाब", scopeLimitations: "दायरा और सीमाएँ",
    analysisBrief: "विश्लेषण का उद्देश्य", question: "सवाल", videoIntelligence: "वीडियो से लिखित जानकारी",
    generatedLocally: "आपके ब्राउज़र में स्थानीय रूप से तैयार", confidenceLabels: { high: "उच्च", medium: "मध्यम", low: "कम" },
    modeLabels: { ...EN_MODE_LABELS, general: "विस्तृत रिपोर्ट", key_insights: "मुख्य जानकारियाँ", bug: "बग रिपोर्ट", meeting: "बैठक", ux: "UX समीक्षा", tutorial: "ट्यूटोरियल", interview: "इंटरव्यू / पॉडकास्ट", product_demo: "उत्पाद डेमो", content: "सामग्री समीक्षा", privacy: "गोपनीयता जाँच" },
  },
};

export function reportCopy(language: string | null | undefined): ReportCopy {
  const normalized = normalizeLanguageTag(language) ?? "en";
  return { ...REPORT_COPY[normalized], modeLabels: { ...REPORT_COPY[normalized].modeLabels, lesson: lessonCopy(normalized).label, recipe: recipeCopy(normalized).label, tutorial: procedureCopy(normalized).label } };
}
