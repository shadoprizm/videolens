import { uiLocale } from "./i18n";

const en = {
  title: "Save new reports and follow-up answers to my cloud library",
  help: "Includes reports made with your own API key. Reports, source details and answers are sent to your connected VideoLens account. Raw video, images, audio and API keys are never uploaded. Local copies stay here.",
  upload: "Upload existing reports to my cloud library",
  confirm: "Upload {count} existing reports and their follow-up answers to {email}? This includes reports made with your own API key. Local copies will stay on this device.",
  progress: "Uploading: {done} of {total} saved · {failed} failed",
  finished: "Cloud upload finished: {done} saved · {failed} failed · {skipped} skipped. You can retry safely without creating duplicates.",
  stopped: "Upload stopped. Uploaded copies are saved. Retry to upload the remaining reports.",
  failed: "Cloud upload could not finish. Your local reports are safe. Try Upload existing reports again.",
  stay: "Keep this panel open until the upload finishes.",
};
type Copy = Record<keyof typeof en, string>;
const dictionaries: Record<string, Copy> = {
  en,
  zh_CN: {
    title: "将新报告和后续问答保存到云端资料库",
    help: "包括使用您自己的 API 密钥生成的报告。报告、来源信息和问答会上传至已连接的 VideoLens 账户。不会上传原始视频、图片、音频或 API 密钥。本地副本会保留。",
    upload: "将现有报告上传至云端资料库",
    confirm: "将 {count} 份现有报告及后续问答上传至 {email}？包括使用您自己的 API 密钥生成的报告。本地副本会保留在此设备上。",
    progress: "正在上传：已保存 {done}/{total} · 失败 {failed}",
    finished: "上传完成：已保存 {done} · 失败 {failed} · 跳过 {skipped}。可安全重试，不会重复创建报告。",
    stopped: "上传已停止。已上传的副本已保存。请重试以上传剩余报告。",
    failed: "云端上传未能完成。本地报告安全无损。请再次点击上传现有报告。",
    stay: "请保持此面板打开，直到上传完成。",
  },
  zh_TW: {
    title: "將新報告與後續問答儲存至雲端資料庫",
    help: "包括使用您自己的 API 金鑰產生的報告。報告、來源資訊與問答會上傳至已連接的 VideoLens 帳戶。不會上傳原始影片、圖片、音訊或 API 金鑰。本機副本會保留。",
    upload: "將現有報告上傳至雲端資料庫",
    confirm: "將 {count} 份現有報告與後續問答上傳至 {email}？包括使用您自己的 API 金鑰產生的報告。本機副本會保留在此裝置上。",
    progress: "正在上傳：已儲存 {done}/{total} · 失敗 {failed}",
    finished: "上傳完成：已儲存 {done} · 失敗 {failed} · 略過 {skipped}。可安全重試，不會重複建立報告。",
    stopped: "上傳已停止。已上傳的副本已儲存。請重試以上傳剩餘報告。",
    failed: "雲端上傳未能完成。本機報告安全無損。請再次點擊上傳現有報告。",
    stay: "請保持此面板開啟，直到上傳完成。",
  },
  es_419: {
    title: "Guardar nuevos informes y respuestas en mi biblioteca en la nube",
    help: "Incluye informes creados con tu propia clave de API. Los informes, datos de origen y respuestas se envían a tu cuenta de VideoLens conectada. Nunca se suben videos, imágenes, audio originales ni claves de API. Las copias locales se conservan.",
    upload: "Subir informes existentes a mi biblioteca en la nube",
    confirm: "¿Subir {count} informes existentes y sus respuestas a {email}? Incluye informes creados con tu propia clave de API. Las copias locales permanecerán en este dispositivo.",
    progress: "Subiendo: {done} de {total} guardados · {failed} fallidos",
    finished: "Carga finalizada: {done} guardados · {failed} fallidos · {skipped} omitidos. Puedes reintentar sin crear duplicados.",
    stopped: "Carga detenida. Las copias subidas están guardadas. Reintenta para subir los informes restantes.",
    failed: "No se pudo completar la carga. Tus informes locales están seguros. Intenta subir los informes existentes de nuevo.",
    stay: "Mantén este panel abierto hasta que termine la carga.",
  },
  ro: {
    title: "Salvează rapoartele noi și răspunsurile în biblioteca mea din cloud",
    help: "Include rapoarte create cu propria cheie API. Rapoartele, detaliile sursei și răspunsurile sunt trimise în contul VideoLens conectat. Videoclipurile, imaginile, sunetul original și cheile API nu sunt încărcate. Copiile locale se păstrează.",
    upload: "Încarcă rapoartele existente în biblioteca mea din cloud",
    confirm: "Încarci {count} rapoarte existente și răspunsurile lor în {email}? Sunt incluse rapoartele create cu propria cheie API. Copiile locale rămân pe acest dispozitiv.",
    progress: "Se încarcă: {done} din {total} salvate · {failed} eșuate",
    finished: "Încărcare încheiată: {done} salvate · {failed} eșuate · {skipped} omise. Poți reîncerca fără a crea duplicate.",
    stopped: "Încărcare oprită. Copiile încărcate sunt salvate. Reîncearcă pentru rapoartele rămase.",
    failed: "Încărcarea nu s-a putut termina. Rapoartele locale sunt în siguranță. Reîncearcă încărcarea rapoartelor existente.",
    stay: "Ține acest panou deschis până la finalizarea încărcării.",
  },
  hi: {
    title: "नई रिपोर्ट और अनुवर्ती उत्तर मेरी क्लाउड लाइब्रेरी में सहेजें",
    help: "इसमें आपकी अपनी API कुंजी से बनी रिपोर्ट शामिल हैं। रिपोर्ट, स्रोत विवरण और उत्तर आपके जुड़े हुए VideoLens खाते में भेजे जाते हैं। मूल वीडियो, चित्र, ऑडियो और API कुंजियाँ कभी अपलोड नहीं की जातीं। स्थानीय प्रतियाँ यहीं रहती हैं।",
    upload: "मौजूदा रिपोर्ट मेरी क्लाउड लाइब्रेरी में अपलोड करें",
    confirm: "{count} मौजूदा रिपोर्ट और उनके अनुवर्ती उत्तर {email} पर अपलोड करें? इसमें आपकी अपनी API कुंजी से बनी रिपोर्ट शामिल हैं। स्थानीय प्रतियाँ इस डिवाइस पर रहेंगी।",
    progress: "अपलोड हो रहा है: {total} में से {done} सहेजी गईं · {failed} असफल",
    finished: "अपलोड पूरा: {done} सहेजी गईं · {failed} असफल · {skipped} छोड़ी गईं। बिना डुप्लिकेट बनाए फिर से कोशिश कर सकते हैं।",
    stopped: "अपलोड रुक गया। अपलोड की गई प्रतियाँ सहेजी गई हैं। बाकी रिपोर्ट के लिए फिर से कोशिश करें।",
    failed: "क्लाउड अपलोड पूरा नहीं हुआ। आपकी स्थानीय रिपोर्ट सुरक्षित हैं। मौजूदा रिपोर्ट अपलोड करने की फिर से कोशिश करें।",
    stay: "अपलोड पूरा होने तक यह पैनल खुला रखें।",
  },
};
export function cloudCopy(key: keyof Copy, values: Record<string, string | number> = {}): string {
  let text = (dictionaries[uiLocale] || en)[key];
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}
