import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it, vi } from "vitest";

const code = readFileSync(new URL("../analytics.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

it.each(["Mozilla Firefox/142.0", "Mozilla Chrome/140.0", "Safari/605.1", "iPhone", ""])("preserves both explicit store choices for %s and tracks their destinations", (userAgent) => {
  const choices = [...html.matchAll(/<a ([^>]*data-destination="(?:chrome-web-store|firefox-add-ons)"[^>]*)>([^<]+)<\/a>/g)].map((match) => ({
    href: match[1].match(/href="([^"]+)"/)![1],
    textContent: match[2],
    dataset: { track: match[1].match(/data-track="([^"]+)"/)![1], destination: match[1].match(/data-destination="([^"]+)"/)![1] },
  }));
  const original = structuredClone(choices);
  const track = vi.fn();
  let click: (event: unknown) => void = () => {};
  vm.runInNewContext(code, {
    navigator: { userAgent },
    window: { va: track, location: { pathname: "/" } },
    document: { querySelectorAll: () => choices, addEventListener: (_: string, handler: typeof click) => { click = handler; } },
  });
  expect(choices).toEqual(original);
  expect(choices).toHaveLength(4);
  for (const choice of choices) {
    click({ target: { closest: () => choice } });
    expect(track).toHaveBeenLastCalledWith("event", { name: choice.dataset.track, data: { destination: choice.dataset.destination, page: "/" } });
  }
});

it("offers equal-weight Chrome and Firefox buttons in both static install groups", () => {
  const groups = [...html.matchAll(/<div class="browser-choices[^>]*>([\s\S]*?)<\/div>/g)];
  expect(groups).toHaveLength(2);
  for (const [, group] of groups) {
    const buttons = [...group.matchAll(/<a ([^>]+)>([^<]+)<\/a>/g)];
    expect(buttons.map((button) => button[2])).toEqual(["Add to Chrome — Free", "Add to Firefox — Free"]);
    expect(buttons[0][1].match(/class="([^"]+)"/)![1]).toBe(buttons[1][1].match(/class="([^"]+)"/)![1]);
  }
  expect(html).not.toContain("data-extension-cta");
  expect(html).toContain('href="#extension" data-track="Choose browser"');
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
  expect(schema["@graph"].find((item: Record<string, unknown>) => item["@type"] === "SoftwareApplication").downloadUrl).toEqual([
    "https://chromewebstore.google.com/detail/plhohhmnkfidolnjnmdaenhdjkbbledl", "https://addons.mozilla.org/firefox/addon/videolens-video-reports/",
  ]);
});
