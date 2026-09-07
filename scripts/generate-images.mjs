/**
 * Draws the product artwork as vectors and rasterises it to high resolution PNG.
 * Run with: npm run images
 *
 * The artwork is an original illustration in the Pepsi Max palette rather than
 * retailer photography, so nothing copyrighted is redistributed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'products');
const SIZE = 1024;
const BLUE = '#0057b8';
const RED = '#eb1c2d';

const defs = `
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0c0c0e"/>
      <stop offset="0.18" stop-color="#3a3a40"/>
      <stop offset="0.42" stop-color="#141418"/>
      <stop offset="0.72" stop-color="#26262b"/>
      <stop offset="1" stop-color="#0a0a0c"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8e8e96"/>
      <stop offset="0.3" stop-color="#e6e6ea"/>
      <stop offset="0.62" stop-color="#a7a7af"/>
      <stop offset="1" stop-color="#77777f"/>
    </linearGradient>
    <linearGradient id="plastic" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#101014"/>
      <stop offset="0.22" stop-color="#44444c"/>
      <stop offset="0.5" stop-color="#16161a"/>
      <stop offset="0.78" stop-color="#2e2e35"/>
      <stop offset="1" stop-color="#0c0c10"/>
    </linearGradient>
    <linearGradient id="carton" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b1b20"/>
      <stop offset="1" stop-color="#07070a"/>
    </linearGradient>
    <radialGradient id="floor" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="rgba(0,0,0,0.34)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>

    <clipPath id="globeClip"><circle cx="0" cy="0" r="52"/></clipPath>

    <g id="globe">
      <circle cx="0" cy="0" r="52" fill="#f7f7f9"/>
      <g clip-path="url(#globeClip)">
        <path d="M-56 -56 H56 V-4 C24 -22 -20 6 -56 -2 Z" fill="${RED}"/>
        <path d="M-56 14 C-20 24 24 -4 56 12 V56 H-56 Z" fill="${BLUE}"/>
      </g>
      <circle cx="0" cy="0" r="52" fill="none" stroke="rgba(0,0,0,0.16)" stroke-width="2"/>
    </g>

    <g id="can">
      <rect x="-78" y="-166" width="156" height="332" rx="24" fill="url(#body)"/>
      <rect x="-78" y="-166" width="156" height="22" rx="11" fill="url(#metal)"/>
      <rect x="-78" y="144" width="156" height="22" rx="11" fill="url(#metal)"/>
      <rect x="-78" y="-166" width="156" height="332" rx="24" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="2"/>
      <g transform="translate(0,-38) scale(0.66)"><use href="#globe"/></g>
      <text x="0" y="66" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
            font-size="46" font-weight="700" letter-spacing="3" fill="#f7f7f9">MAX</text>
      <rect x="-78" y="86" width="156" height="6" fill="${BLUE}"/>
    </g>
  </defs>
`;

const shadow = (cx, cy, rx, ry) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#floor)"/>`;

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${defs}${body}</svg>`;

const bottle = svg(`
  ${shadow(512, 906, 210, 40)}
  <rect x="452" y="150" width="120" height="58" rx="12" fill="${BLUE}"/>
  <path d="M462 206 L462 300 C462 344 366 348 366 404 L366 828
           C366 868 388 890 424 890 L600 890 C636 890 658 868 658 828
           L658 404 C658 348 562 344 562 300 L562 206 Z" fill="url(#plastic)"/>
  <rect x="356" y="466" width="312" height="286" rx="16" fill="#0a0a0c"/>
  <g transform="translate(512 566) scale(1.36)"><use href="#globe"/></g>
  <text x="512" y="712" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="64" font-weight="700" letter-spacing="7" fill="#f7f7f9">MAX</text>
  <rect x="356" y="736" width="312" height="8" fill="${BLUE}"/>
`);

const row = (count, y, scale, gap) => {
  const step = 150 * scale + gap;
  const start = 512 - ((count - 1) * step) / 2;
  return Array.from({ length: count }, (unused, index) =>
    `<g transform="translate(${start + index * step} ${y}) scale(${scale})"><use href="#can"/></g>`,
  ).join('');
};

const pack4 = svg(`
  ${shadow(512, 762, 320, 44)}
  ${row(4, 570, 1.05, 8)}
`);

const pack8 = svg(`
  ${shadow(512, 792, 366, 46)}
  <g opacity="0.8">${row(4, 486, 0.84, 6)}</g>
  ${row(4, 618, 0.98, 6)}
`);

const pack24 = svg(`
  ${shadow(512, 858, 392, 46)}
  <g opacity="0.7">${row(3, 356, 0.62, 10)}</g>
  <g>
    <path d="M212 430 h600 v370 a26 26 0 0 1 -26 26 h-548 a26 26 0 0 1 -26 -26 z" fill="url(#carton)"/>
    <path d="M212 430 h600 l-58 -58 h-484 z" fill="#26262c"/>
    <rect x="212" y="430" width="600" height="396" rx="4" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
    <g transform="translate(400 596) scale(1.35)"><use href="#globe"/></g>
    <text x="400" y="700" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
          font-size="54" font-weight="700" letter-spacing="4" fill="#f7f7f9">MAX</text>
    <text x="676" y="640" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
          font-size="132" font-weight="700" fill="#f7f7f9">24</text>
    <text x="676" y="700" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
          font-size="38" font-weight="600" letter-spacing="3" fill="rgba(247,247,249,0.72)">CANS</text>
    <rect x="212" y="742" width="600" height="8" fill="${BLUE}"/>
  </g>
`);

const artwork = { bottle, 'pack-4': pack4, 'pack-8': pack8, 'pack-24': pack24 };

mkdirSync(OUT, { recursive: true });

for (const [name, markup] of Object.entries(artwork)) {
  writeFileSync(join(OUT, `${name}.svg`), `${markup}\n`);
  // Trim the transparent margin so the artwork fills its box in the layout.
  await sharp(Buffer.from(markup), { density: 288 })
    .trim({ threshold: 1 })
    .resize(SIZE, SIZE, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, `${name}.png`));
  console.log(`wrote ${name}.svg and ${name}.png`);
}
