import { normalizeRecipe, safeRecipeUrl, type Recipe, type RecipeFact } from "./recipe.js";
import { recipeCopy } from "./recipeCopy.js";

const escape = (s: string): string => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const stamp = (n: number): string => `${String(Math.floor(n / 60)).padStart(2, "0")}:${(n % 60).toFixed(n % 1 ? 1 : 0).padStart(n % 1 ? 4 : 2, "0")}`;
const moments = (f: RecipeFact): number[] => f.timestamps.length > 2 ? [f.timestamps[0], f.timestamps[f.timestamps.length - 1]] : f.timestamps;

function videoLink(source: string | null, seconds: number): string | null {
  const safe = safeRecipeUrl(source);
  if (!safe) return null;
  const url = new URL(safe);
  if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname)) return null;
  const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") || url.pathname.match(/^\/shorts\/([^/]+)/)?.[1];
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&t=${Math.floor(seconds)}s`;
}

export function recipeHtml(value: unknown, language?: string | null, sourceUrl: string | null = null, duration: number | null = null): string {
  const r = normalizeRecipe(value, duration);
  if (!r) return "";
  const c = recipeCopy(language);
  const fact = (f: RecipeFact): string => `<div class="recipe-fact"><span class="recipe-value">${escape(f.value ?? c.unknown)}</span>${f.value ? ` <span class="recipe-basis recipe-${f.basis}">${escape(c[f.basis])}</span>` : ""}${moments(f).map(t => {
    const url = videoLink(sourceUrl, t);
    return url ? ` <a class="recipe-cite" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${stamp(t)} ↗</a>` : ` <span class="recipe-cite">${stamp(t)}</span>`;
  }).join("")}${f.sourceIds.map(id => {
    const source = r.sources.find(s => s.id === id)!;
    return ` <a class="recipe-cite" href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} ↗</a>`;
  }).join("")}${f.note ? `<p class="recipe-note">${escape(f.note)}</p>` : ""}</div>`;
  return `<section class="recipe-card" aria-label="${escape(c.recipe)}"><div class="recipe-kicker">${escape(c.recipe)}</div><h2>${escape(r.title)}</h2><p class="recipe-review">${escape(c.review)}</p>
    <dl class="recipe-meta">${(["servings", "prepTime", "cookTime"] as const).map(key => `<div><dt>${escape(c[key])}</dt><dd>${fact(r[key])}</dd></div>`).join("")}</dl>
    <h3>${escape(c.ingredients)}</h3><ul class="recipe-ingredients">${r.ingredients.map(i => `<li><div>${fact(i.ingredient)}</div><div><span class="recipe-field-label">${escape(c.amount)}</span>${fact(i.amount)}</div></li>`).join("")}</ul>
    ${r.equipment.length ? `<h3>${escape(c.equipment)}</h3><ul class="recipe-equipment">${r.equipment.map(f => `<li>${fact(f)}</li>`).join("")}</ul>` : ""}
    <h3>${escape(c.steps)}</h3><ol class="recipe-steps">${r.steps.map(s => `<li>${fact(s.instruction)}${s.duration.value || s.temperature.value ? `<div class="recipe-step-meta">${s.duration.value ? `<div><span class="recipe-field-label">${escape(c.duration)}</span>${fact(s.duration)}</div>` : ""}${s.temperature.value ? `<div><span class="recipe-field-label">${escape(c.temperature)}</span>${fact(s.temperature)}</div>` : ""}</div>` : ""}</li>`).join("")}</ol>
    ${r.gaps.length ? `<aside class="recipe-gaps"><h3>${escape(c.gaps)}</h3><ul>${r.gaps.map(g => `<li>${escape(g)}</li>`).join("")}</ul></aside>` : ""}
    <p class="recipe-research-status">${escape(c[r.research])}</p>
    ${r.sources.length ? `<details class="recipe-sources"><summary>${escape(c.sources)} (${r.sources.length})</summary><ul>${r.sources.map(s => `<li><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)}</a></li>`).join("")}</ul></details>` : ""}</section>`;
}

export function recipeMarkdown(value: unknown, language?: string | null): string {
  const r = normalizeRecipe(value, null);
  if (!r) return "";
  const c = recipeCopy(language);
  const fact = (f: RecipeFact): string => `${f.value ?? c.unknown}${f.value ? ` (${c[f.basis]})` : ""}${moments(f).map(t => ` [${stamp(t)}]`).join("")}${f.sourceIds.map(id => {
    const s = r.sources.find(s => s.id === id)!;
    return ` [${s.title.replace(/[\[\]]/g, "")}](<${s.url}>)`;
  }).join("")}${f.note ? ` — ${f.note}` : ""}`;
  return [`## ${c.recipe}: ${r.title}`, "", c.review, "", ...(["servings", "prepTime", "cookTime"] as const).map(k => `- ${c[k]}: ${fact(r[k])}`),
    "", `### ${c.ingredients}`, "", ...r.ingredients.map(i => `- ${fact(i.ingredient)}\n  - ${c.amount}: ${fact(i.amount)}`),
    ...(r.equipment.length ? ["", `### ${c.equipment}`, "", ...r.equipment.map(f => `- ${fact(f)}`)] : []),
    "", `### ${c.steps}`, "", ...r.steps.map((s, i) => `${i + 1}. ${fact(s.instruction)}${s.duration.value ? `\n   - ${c.duration}: ${fact(s.duration)}` : ""}${s.temperature.value ? `\n   - ${c.temperature}: ${fact(s.temperature)}` : ""}`),
    ...(r.gaps.length ? ["", `### ${c.gaps}`, "", ...r.gaps.map(g => `- ${g}`)] : []), "", c[r.research], "",
    ...(r.sources.length ? [`### ${c.sources}`, "", ...r.sources.map(s => `- [${s.title.replace(/[\[\]]/g, "")}](<${s.url}>)`), ""] : []),
  ].join("\n");
}

export const RECIPE_CSS = `
.recipe-card{font:inherit;color:inherit;margin:24px 0;padding:24px;border:1px solid #bfd5c6;border-radius:18px;background:#fcfdf9;overflow-wrap:anywhere;color:#20382b}
.recipe-kicker{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#3e7053}
.recipe-card h2{font-size:28px;line-height:1.2;margin:10px 0 14px}.recipe-card h3{font-size:18px;margin:26px 0 12px;color:#20382b}
.recipe-review,.recipe-note,.recipe-research-status{font-size:13px;line-height:1.6;color:#526459}.recipe-note{margin:5px 0 0}.recipe-review{border-left:3px solid #afc6b5;padding-left:12px}
.recipe-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:18px;padding:18px 0;border-bottom:1px solid #dce6dd}.recipe-meta dt,.recipe-field-label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#526459;font-weight:700;margin-bottom:5px}.recipe-meta dd{margin:0}
.recipe-fact{font-size:15px;line-height:1.65}.recipe-basis{display:inline-block;font-size:10px;line-height:1.4;padding:3px 6px;border-radius:5px;background:#e8f1e9;color:#355d43;vertical-align:middle}.recipe-estimate{background:#fff0cc;color:#785612}.recipe-unknown{background:#f1eae4;color:#705746}.recipe-reference{background:#e4eef5;color:#385f7a}
.recipe-cite{font-size:11px;color:#376c53;text-decoration:underline}.recipe-ingredients{list-style:none;padding:0;margin:0}.recipe-ingredients>li{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;padding:13px 0;border-bottom:1px solid #e1e9e1}.recipe-ingredients>li>div:first-child .recipe-value{font-weight:700}
.recipe-equipment{padding-left:20px}.recipe-equipment li{margin:8px 0}.recipe-steps{padding-left:24px}.recipe-steps>li{padding:10px 0 16px 9px;border-bottom:1px solid #e1e9e1;break-inside:avoid}.recipe-steps>li::marker{font-weight:800;color:#3e7053}.recipe-step-meta{display:flex;flex-wrap:wrap;gap:18px;margin-top:9px}
.recipe-gaps{padding:1px 16px 12px;background:#fff6e3;border-radius:10px;margin-top:22px}.recipe-gaps h3{margin-top:15px}.recipe-gaps li{font-size:14px;line-height:1.6;margin:7px 0}.recipe-sources summary{font-size:13px;cursor:pointer;font-weight:700}.recipe-sources a{font-size:13px;color:#376c53}
@media(max-width:480px){.recipe-card{padding:17px}.recipe-card h2{font-size:24px}.recipe-meta{grid-template-columns:1fr}.recipe-ingredients>li{grid-template-columns:1fr;gap:8px}}
@media print{.recipe-card{border:0;padding:0;background:white}.recipe-ingredients>li{break-inside:avoid}.recipe-basis{border:1px solid #bbb}.recipe-sources{display:block}}
`;
