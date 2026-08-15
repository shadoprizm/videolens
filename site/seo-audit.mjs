import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pages } from "./content-pages.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const out = join(root, "dist");
const errors = [];
const expectedPaths = new Set(["/", "/privacy", ...pages.map((page) => `/${page.slug}`)]);
const htmlFiles = [join(out, "index.html"), join(out, "privacy.html"), ...pages.map((page) => join(out, page.slug, "index.html"))];

const count = (source, pattern) => (source.match(pattern) || []).length;

for (const file of htmlFiles) {
  if (!existsSync(file)) {
    errors.push(`Missing HTML file: ${file}`);
    continue;
  }
  const html = readFileSync(file, "utf8");
  const label = file.replace(`${out}/`, "");
  if (!/<title>[^<]{20,75}<\/title>/.test(html)) errors.push(`${label}: title missing or poorly sized`);
  if (!/<meta name="description" content="[^"]{100,180}">/.test(html)) errors.push(`${label}: meta description missing or poorly sized`);
  if (!/<link rel="canonical" href="https:\/\/videolens\.io\/[^"]*">/.test(html)) errors.push(`${label}: canonical missing or invalid`);
  if (!/<meta name="robots" content="index, follow/.test(html)) errors.push(`${label}: index directive missing`);
  if (count(html, /<h1\b/g) !== 1) errors.push(`${label}: expected exactly one h1`);
  if (!/application\/ld\+json/.test(html)) errors.push(`${label}: JSON-LD missing`);
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(match[1]); } catch (error) { errors.push(`${label}: invalid JSON-LD (${error.message})`); }
  }
  if (/REPLACE_WITH|Coming next:.*UX|Three modes built in/.test(html)) errors.push(`${label}: stale placeholder or product copy found`);
}

const sitemapPath = join(out, "sitemap.xml");
if (!existsSync(sitemapPath)) errors.push("sitemap.xml missing");
else {
  const sitemap = readFileSync(sitemapPath, "utf8");
  for (const path of expectedPaths) {
    if (!sitemap.includes(`<loc>https://videolens.io${path}</loc>`)) errors.push(`sitemap missing ${path}`);
  }
  if (count(sitemap, /<url>/g) !== expectedPaths.size) errors.push("sitemap URL count does not match page inventory");
  if (/<priority>|<changefreq>/.test(sitemap)) errors.push("sitemap contains ignored priority/changefreq fields");
}

const robots = readFileSync(join(out, "robots.txt"), "utf8");
if (!robots.includes("Sitemap: https://videolens.io/sitemap.xml")) errors.push("robots.txt does not advertise sitemap");

if (errors.length) {
  console.error(`SEO audit failed with ${errors.length} issue(s):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`SEO audit passed: ${htmlFiles.length} HTML pages, ${expectedPaths.size} sitemap URLs, valid metadata and JSON-LD.`);
