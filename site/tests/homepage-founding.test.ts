import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import { expect, it, vi } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(source => source.includes("/api/config"))!;

async function openHomepage(founding: unknown, ok = true) {
  const { document } = parseHTML(html);
  const fetch = vi.fn(async () => new Response(JSON.stringify({ plans: { pro: { monthlyPriceUsd: 12, annualPriceUsd: 99 } }, founding }), { status: ok ? 200 : 500 }));
  vm.runInNewContext(script, { document, fetch, Date, Number, String });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 0));
  return document;
}

const open = { available: true, percentOff: 40, spots: 100, endsAt: "2027-01-01T05:00:00Z", monthlyPriceUsd: 7.2, annualPriceUsd: 59.4 };

it("ships the regular price as the static fallback", async () => {
  const document = await openHomepage({ available: false });
  expect(document.getElementById("pro-price")!.textContent).toBe("$12");
  expect(document.getElementById("founding-badge")!.classList.contains("hidden")).toBe(true);
  expect(document.getElementById("pro-regular-price")!.classList.contains("hidden")).toBe(true);
  expect(document.getElementById("pro-price-note")!.textContent).toContain("Or $99/year");
});

it("shows the founding price with the regular price struck through while the offer is open", async () => {
  const document = await openHomepage(open);
  await vi.waitFor(() => expect(document.getElementById("pro-price")!.textContent).toBe("$7.20"));
  expect(document.getElementById("founding-badge")!.textContent).toContain("Founding Member · 40% off for life");
  expect(document.getElementById("founding-badge")!.classList.contains("hidden")).toBe(false);
  const regular = document.getElementById("pro-regular-price")!;
  expect(regular.tagName).toBe("S");
  expect(regular.textContent).toBe("$12");
  expect(regular.classList.contains("hidden")).toBe(false);
  expect(document.getElementById("pro-price-note")!.textContent).toContain("Or $59.40/year (regularly $99)");
  const terms = document.getElementById("founding-terms")!.textContent!;
  expect(terms).toContain("First 100 members, until December 31, 2026");
  expect(terms).not.toContain("spots left");
});

it("shows the spot count only when the API publishes it", async () => {
  const document = await openHomepage({ ...open, spotsLeft: 37 });
  await vi.waitFor(() => expect(document.getElementById("founding-terms")!.textContent).toContain("37 of 100 spots left"));
});

it("keeps the regular price when configuration cannot be loaded", async () => {
  const document = await openHomepage(open, false);
  expect(document.getElementById("pro-price")!.textContent).toBe("$12");
  expect(document.getElementById("founding-badge")!.classList.contains("hidden")).toBe(true);
});
