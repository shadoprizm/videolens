# VideoLens marketing site

Static landing page for [videolens.io](https://videolens.io). One HTML file, Tailwind CDN, zero build step.

## Deploy to Vercel

```bash
# From the repo root:
cd site
vercel --prod
```

Or via the Vercel dashboard:
1. **New Project** → import the `shadoprizm/videolens` GitHub repo
2. Set **Root Directory** to `site/`
3. Framework Preset: **Other** (no build command, no output directory needed)
4. Deploy

Connect `videolens.io` via Vercel's domain settings. Point the app subdomain (`app.videolens.io`) at the Railway deployment separately.

## Waitlist form

The "Notify me" form on the hosted-version section currently uses a `mailto:` action — fine for MVP, but every submission opens the visitor's email client.

To swap in a real backend:
- **Formspree** (easiest): create an endpoint at formspree.io, replace the form's `action="..."` with your form URL, remove `enctype="text/plain"`
- **Tally**: embed a Tally form via an iframe instead of the inline form
- **Buttondown / Beehiiv**: paste their embed snippet if you want a newsletter

Search `<!-- Waitlist form: replace action=` in `index.html`.

## Editing copy

Open `index.html` and edit in place. Tailwind classes are inline so there's no separate stylesheet. The brand palette is configured in the `<script>` block at the top:

```js
brand: { 600:'#0891B2', 700:'#0E7490', ... }
```
