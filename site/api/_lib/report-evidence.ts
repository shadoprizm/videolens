/** Remove a source-wide silence label contradicted by supplied sound evidence.
 * Leave quoted claims, secondary subjects, evidence, and time ranges untouched.
 */
export function guardReportSilence(responseBody: string, messages: unknown[]): string {
  const heard = messages.some(message => {
    if (!message || typeof message !== 'object' || !('content' in message)) return false;
    const content = message.content;
    const texts = typeof content === 'string' ? [content] : Array.isArray(content)
      ? content.flatMap(part => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string' ? [part.text] : []) : [];
    return texts.some(text => /\bheard \(provisional(?:, within this window)?\):\s*\S/i.test(text));
  });
  if (!heard) return responseBody;
  // The proxy validates responses separately; this consistency guard must not
  // turn an unrelated response format into another failure.
  try {
    const envelope = JSON.parse(responseBody);
    if (!Array.isArray(envelope?.choices)) return responseBody;
    let changed = false;
    for (const choice of envelope.choices) {
      if (typeof choice?.message?.content !== 'string') continue;
      const report = JSON.parse(choice.message.content);
      if (!report || typeof report.summary !== 'string') continue;
      const summary = report.summary.replace(/^((?:this is|this (?:video|clip|recording) is)\s+(?:(?:a|an)\s+)?|(?:a|an|the)\s+)silent\s+(?=(?:(?:dashcam|security|surveillance|cctv|video|screen)\s+)*(?:recording|clip|video|footage)\b)/i, '$1');
      if (summary !== report.summary) {
        report.summary = summary;
        choice.message.content = JSON.stringify(report);
        changed = true;
      }
    }
    return changed ? JSON.stringify(envelope) : responseBody;
  } catch { return responseBody; }
}
