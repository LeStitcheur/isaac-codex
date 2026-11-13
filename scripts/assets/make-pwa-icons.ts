/**
 * Génère les icônes de l'application installable (PWA) à partir du sprite d'Isaac :
 * agrandissement au plus proche voisin (pixel art net) sur le fond rouge de la marque.
 *   npm run assets:icons
 * Sorties : apps/web/public/icons/icon-{192,512}.png (+ maskable-512.png, zone de sécurité Android).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const src = PNG.sync.read(readFileSync(path.join(root, 'apps/web/public/game-assets/characters/isaac.png')));
const outDir = path.join(root, 'apps/web/public/icons');
mkdirSync(outDir, { recursive: true });

const TOP = [0xff, 0x52, 0x66];
const BOTTOM = [0xb3, 0x14, 0x32];

/** `fill` : part de l'icône occupée par le sprite (0,62 standard ; 0,48 pour la zone sûre « maskable »). `rounded` : coins arrondis transparents. */
function render(size: number, fill: number, rounded: boolean): Buffer {
  const png = new PNG({ width: size, height: size });
  const radius = rounded ? size * 0.22 : 0;
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const bg = TOP.map((c, i) => Math.round(c + (BOTTOM[i]! - c) * t));
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = Math.min(Math.max(x + 0.5, radius), size - radius);
      const cy = Math.min(Math.max(y + 0.5, radius), size - radius);
      const inside = !rounded || (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius ** 2;
      png.data[i] = bg[0]!;
      png.data[i + 1] = bg[1]!;
      png.data[i + 2] = bg[2]!;
      png.data[i + 3] = inside ? 255 : 0;
    }
  }
  const scale = Math.max(1, Math.floor((size * fill) / Math.max(src.width, src.height)));
  const w = src.width * scale;
  const h = src.height * scale;
  const ox = Math.round((size - w) / 2);
  const oy = Math.round((size - h) / 2);
  const shadow = Math.max(1, Math.round(scale / 2));
  const blend = (px: number, py: number, rgb: number[], a: number) => {
    if (px < 0 || py < 0 || px >= size || py >= size || a === 0) return;
    const i = (py * size + px) * 4;
    const k = a / 255;
    for (let c = 0; c < 3; c++) png.data[i + c] = Math.round(rgb[c]! * k + png.data[i + c]! * (1 - k));
  };
  for (const pass of ['shadow', 'sprite'] as const) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = (Math.floor(y / scale) * src.width + Math.floor(x / scale)) * 4;
        const a = src.data[s + 3]!;
        if (pass === 'shadow') blend(ox + x + shadow, oy + y + shadow, [0x40, 0x05, 0x10], Math.round(a * 0.45));
        else blend(ox + x, oy + y, [src.data[s]!, src.data[s + 1]!, src.data[s + 2]!], a);
      }
    }
  }
  return PNG.sync.write(png);
}

const outputs: [string, Buffer][] = [
  ['icon-192.png', render(192, 0.62, true)],
  ['icon-512.png', render(512, 0.62, true)],
  ['maskable-512.png', render(512, 0.48, false)],
  ['apple-touch-icon.png', render(180, 0.6, false)],
];
for (const [name, buf] of outputs) {
  writeFileSync(path.join(outDir, name), buf);
  console.log(`icons/${name}`);
}
