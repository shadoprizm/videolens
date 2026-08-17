import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { lastmod, pages } from "./content-pages.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const out = join(root, "dist");
const siteUrl = "https://videolens.io";
const pageBySlug = new Map(pages.map((page) => [page.slug, page]));
const workflowBySlug = {
  "screen-recording-analyzer": "bug",
  "session-replay-analyzer": "ux",
  "loom-video-analyzer": "bug",
  "meeting-video-analyzer": "meeting",
  "video-privacy-analyzer": "privacy",
  "youtube-video-analyzer": "detailed",
  "video-analysis-mcp": "detailed",
  "ai-video-analyzer": "detailed",
};
const observabilityConfig = JSON.parse(process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG || "{}");
const configuredAnalyticsPath = observabilityConfig.analytics?.scriptSrc;
const analyticsScriptSrc = configuredAnalyticsPath
  ? `/${configuredAnalyticsPath.replace(/^\/+/, "")}`
  : "/_vercel/insights/script.js";

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const faqSchema = (faqs) => faqs.map(([name, text]) => ({
  "@type": "Question",
  name,
  acceptedAnswer: { "@type": "Answer", text }
}));

const renderPage = (page) => {
  const canonical = `${siteUrl}/${page.slug}`;
  const workflow = workflowBySlug[page.slug] || "general";
  const appHref = `https://app.videolens.io/?workflow=${encodeURIComponent(workflow)}`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: page.title,
        description: page.description,
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#software` },
        dateModified: lastmod,
        inLanguage: "en"
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "VideoLens", item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: page.h1, item: canonical }
        ]
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#software`,
        name: "VideoLens",
        url: `${siteUrl}/`,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web, macOS, Linux, Windows, Chrome",
        description: "Open-source software that turns long videos into professional written reports with transcription, frame vision, OCR, and timestamped evidence.",
        license: "https://github.com/shadoprizm/videolens/blob/main/LICENSE",
        offers: [
          { "@type": "Offer", name: "VideoLens Free", price: "0", priceCurrency: "USD", description: "Private BYOK browser-extension and open-source workflows." },
          { "@type": "Offer", name: "VideoLens Pro monthly", price: "12", priceCurrency: "USD", description: "20 managed reports per calendar month with no API key required." },
          { "@type": "Offer", name: "VideoLens Pro annual", price: "99", priceCurrency: "USD", description: "Annual Pro subscription with 20 managed reports per calendar month." }
        ]
      },
      {
        "@type": "FAQPage",
        "@id": `${canonical}#faq`,
        mainEntity: faqSchema(page.faqs)
      }
    ]
  };

  const benefits = page.benefits.map(([title, text]) => `
          <article class="card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`).join("");
  const steps = page.workflow.map((step) => `<div class="step">${escapeHtml(step)}</div>`).join("");
  const deliverables = page.deliverables.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const faqs = page.faqs.map(([question, answer]) => `
          <details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join("");
  const related = page.related.map((slug) => {
    const relatedPage = pageBySlug.get(slug);
    if (!relatedPage) throw new Error(`Unknown related page: ${slug}`);
    return `<a href="/${slug}">${escapeHtml(relatedPage.h1)}<span>Read the guide →</span></a>`;
  }).join("");
  const summary = page.summary.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n          ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <meta name="author" content="VideoLens">
  <meta name="theme-color" content="#0891B2">
  <link rel="canonical" href="${canonical}">
  <link rel="sitemap" type="application/xml" href="/sitemap.xml">
  <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="VideoLens">
  <meta property="og:image" content="${siteUrl}/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(page.title)}">
  <meta name="twitter:description" content="${escapeHtml(page.description)}">
  <meta name="twitter:image" content="${siteUrl}/og.png">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://rsms.me/">
  <link rel="stylesheet" href="https://rsms.me/inter/inter.css">
  <link rel="stylesheet" href="/content.css">
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <header class="site-header">
    <nav class="wrap nav" aria-label="Primary navigation">
      <a class="brand" href="/"><span class="brand-mark">▶</span>VideoLens</a>
      <div class="nav-links">
        <a href="/youtube-video-analyzer">YouTube reports</a>
        <a href="/screen-recording-analyzer">Screen recordings</a>
        <a href="/video-analysis-mcp">For AI agents</a>
        <a href="/#pricing">Pricing</a>
        <a href="/account">Account</a>
        <a class="button button-primary" data-track="Start ${escapeHtml(workflow)} workflow" data-destination="hosted-app-${escapeHtml(workflow)}" href="${appHref}" target="_blank" rel="noopener">Start this workflow →</a>
      </div>
    </nav>
  </header>

  <main>
    <section class="hero">
      <div class="wrap">
        <div class="breadcrumb"><a href="/">VideoLens</a> / ${escapeHtml(page.eyebrow)}</div>
        <div class="eyebrow">${escapeHtml(page.eyebrow)}</div>
        <h1>${escapeHtml(page.h1)}</h1>
        <p class="lead">${escapeHtml(page.lead)}</p>
        <div class="actions">
          <a class="button button-primary" data-track="Start ${escapeHtml(workflow)} workflow" data-destination="hosted-app-${escapeHtml(workflow)}" href="${appHref}" target="_blank" rel="noopener">Analyze with this workflow →</a>
          <a class="button button-dark" data-track="View GitHub" data-destination="github" href="https://github.com/shadoprizm/videolens" target="_blank" rel="noopener">View open-source code</a>
          <a class="button button-secondary" href="#how-it-works">How it works</a>
        </div>
        <div class="meta-line">Updated ${lastmod} · Free Private mode · Optional Pro · MIT-licensed core</div>
      </div>
    </section>

    <div class="proof" aria-label="Product facts">
      <div>Transcript + frame vision + OCR</div><div>Timestamp citations</div><div>~1,500 supported platforms</div><div>Professional HTML and PDF</div>
    </div>

    <section class="section">
      <div class="wrap prose">
        <div class="eyebrow">The direct answer</div>
        <h2>What VideoLens does</h2>
        ${summary}
      </div>
    </section>

    <section class="section alt">
      <div class="wrap">
        <div class="section-head"><div class="eyebrow">Why it helps</div><h2>From linear video to reviewable evidence</h2></div>
        <div class="grid-3">${benefits}
        </div>
      </div>
    </section>

    <section class="section" id="how-it-works">
      <div class="wrap">
        <div class="section-head"><div class="eyebrow">Workflow</div><h2>How the analysis works</h2><p>Every stage is explicit and cached so the source can be checked and the analysis can be reused.</p></div>
        <div class="steps">${steps}</div>
      </div>
    </section>

    <section class="section alt">
      <div class="wrap">
        <div class="section-head"><div class="eyebrow">Output</div><h2>What the report gives you</h2></div>
        <ul class="checklist">${deliverables}</ul>
        <div class="note"><strong>Important limitation:</strong> ${escapeHtml(page.limitation)}</div>
      </div>
    </section>

    <section class="section" id="faq">
      <div class="wrap">
        <div class="section-head"><div class="eyebrow">FAQ</div><h2>Common questions</h2></div>
        <div class="faq">${faqs}
        </div>
      </div>
    </section>

    <section class="section alt">
      <div class="wrap">
        <div class="section-head"><div class="eyebrow">Related guides</div><h2>Explore more VideoLens workflows</h2></div>
        <div class="related">${related}</div>
      </div>
    </section>

    <section class="section">
      <div class="wrap cta">
        <div><h2>Turn the next video into evidence.</h2><p>Try the hosted app, self-host the MIT-licensed core, or connect VideoLens to an MCP client.</p></div>
        <div class="actions"><a class="button button-primary" data-track="Start ${escapeHtml(workflow)} workflow" data-destination="hosted-app-${escapeHtml(workflow)}" href="${appHref}" target="_blank" rel="noopener">Start this VideoLens workflow →</a></div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="wrap footer-row">
      <div><strong>VideoLens</strong> · Open-source video intelligence · © 2026</div>
      <div class="footer-links"><a href="/">Home</a><a href="https://github.com/shadoprizm/videolens" target="_blank" rel="noopener">GitHub</a><a href="/privacy">Privacy</a></div>
    </div>
  </footer>
  <script defer src="/analytics.js"></script>
  <script defer src="${escapeHtml(analyticsScriptSrc)}"></script>
  <script defer src="/_vercel/speed-insights/script.js"></script>
</body>
</html>`;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const staticFiles = [
  "index.html", "privacy.html", "account.html", "robots.txt", "llms.txt",
  "content.css", "account.css", "analytics.js", "favicon.svg", "favicon.ico", "favicon-16x16.png",
  "favicon-32x32.png", "apple-touch-icon.png", "android-chrome-192x192.png",
  "android-chrome-512x512.png", "site.webmanifest", "og.png", "googlecc8e26327b14309f.html"
];

for (const file of staticFiles) {
  const source = join(root, file);
  if (!existsSync(source)) throw new Error(`Missing static file: ${file}`);
  cpSync(source, join(out, file));
}

for (const file of ["index.html", "privacy.html", "account.html"]) {
  const output = join(out, file);
  const html = readFileSync(output, "utf8").replace(
    "/_vercel/insights/script.js",
    analyticsScriptSrc
  );
  writeFileSync(output, html);
}

await build({
  entryPoints: [join(root, "account.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  outfile: join(out, "account.js"),
});

for (const page of pages) {
  const directory = join(out, page.slug);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "index.html"), renderPage(page));
}

const urls = [
  { path: "/", modified: lastmod },
  { path: "/privacy", modified: lastmod },
  ...pages.map((page) => ({ path: `/${page.slug}`, modified: lastmod }))
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({ path, modified }) => `  <url>\n    <loc>${siteUrl}${path}</loc>\n    <lastmod>${modified}</lastmod>\n  </url>`).join("\n")}\n</urlset>\n`;
writeFileSync(join(out, "sitemap.xml"), sitemap);

console.log(`Built VideoLens site: ${pages.length + 2} indexable pages in dist/ (analytics: ${analyticsScriptSrc})`);
