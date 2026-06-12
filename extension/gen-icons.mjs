// Generates the extension icons (cyan→indigo gradient, white play triangle)
// matching the site favicon. Pure JS via pngjs — renders 4x supersampled,
// then box-downsamples for smooth edges.
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";

const SIZES = [16, 32, 48, 128];
const C0 = [0x08, 0x91, 0xb2]; // #0891B2
const C1 = [0x63, 0x66, 0xf1]; // #6366F1

function renderSupersampled(size, ss = 4) {
  const n = size * ss;
  const img = new PNG({ width: n, height: n });
  const radius = n * 0.22;

  // Play triangle in unit space (matches the site's SVG: M24 18l24 14-24 14)
  const tri = { x0: 24 / 64, y0: 18 / 64, x1: 48 / 64, y1: 32 / 64, y2: 46 / 64 };

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const idx = (n * y + x) << 2;

      // Rounded-rect mask
      const dx = Math.max(radius - x, x - (n - 1 - radius), 0);
      const dy = Math.max(radius - y, y - (n - 1 - radius), 0);
      const inside = dx * dx + dy * dy <= radius * radius;
      if (!inside) {
        img.data[idx + 3] = 0;
        continue;
      }

      // Diagonal gradient
      const t = (x + y) / (2 * (n - 1));
      let r = Math.round(C0[0] + (C1[0] - C0[0]) * t);
      let g = Math.round(C0[1] + (C1[1] - C0[1]) * t);
      let b = Math.round(C0[2] + (C1[2] - C0[2]) * t);

      // Triangle: white where (u,v) is inside the play shape
      const u = x / (n - 1);
      const v = y / (n - 1);
      if (u >= tri.x0 && v >= tri.y0 && v <= tri.y2) {
        const span = (u - tri.x0) / (tri.x1 - tri.x0);
        const halfAt = (1 - span) * (tri.y2 - tri.y0) * 0.5;
        if (u <= tri.x1 && Math.abs(v - tri.y1) <= halfAt) {
          r = g = b = 255;
        }
      }

      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
  return downsample(img, size, ss);
}

function downsample(src, size, ss) {
  const out = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const si = ((y * ss + sy) * src.width + (x * ss + sx)) << 2;
          const alpha = src.data[si + 3] / 255;
          r += src.data[si] * alpha;
          g += src.data[si + 1] * alpha;
          b += src.data[si + 2] * alpha;
          a += alpha;
        }
      }
      const count = ss * ss;
      const oi = (y * size + x) << 2;
      out.data[oi + 3] = Math.round((a / count) * 255);
      out.data[oi] = a > 0 ? Math.round(r / a) : 0;
      out.data[oi + 1] = a > 0 ? Math.round(g / a) : 0;
      out.data[oi + 2] = a > 0 ? Math.round(b / a) : 0;
    }
  }
  return out;
}

mkdirSync("public/icons", { recursive: true });
for (const size of SIZES) {
  const png = renderSupersampled(size);
  writeFileSync(`public/icons/icon${size}.png`, PNG.sync.write(png));
  console.log(`icon${size}.png`);
}
