import { uiLocale } from "./i18n";

const copy = {
  en: { open: "Open full report", inline: "Continue in sidebar", local: "Saved on this device", refresh: "Refresh report" },
  zh_CN: { open: "打开完整报告", inline: "在侧边栏中继续", local: "已保存在此设备上", refresh: "刷新报告" },
  zh_TW: { open: "開啟完整報告", inline: "在側邊欄中繼續", local: "已儲存在此裝置上", refresh: "重新整理報告" },
  es_419: { open: "Abrir informe completo", inline: "Continuar en el panel lateral", local: "Guardado en este dispositivo", refresh: "Actualizar informe" },
  ro: { open: "Deschide raportul complet", inline: "Continuă în bara laterală", local: "Salvat pe acest dispozitiv", refresh: "Actualizează raportul" },
  hi: { open: "पूरी रिपोर्ट खोलें", inline: "साइडबार में जारी रखें", local: "इस डिवाइस पर सहेजा गया", refresh: "रिपोर्ट रीफ़्रेश करें" },
};
export const readerCopy = copy[uiLocale] || copy.en;
