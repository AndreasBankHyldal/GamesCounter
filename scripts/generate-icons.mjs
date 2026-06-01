// Generates PWA icons from a felt + card-suit design.
// Run with: node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "icons");

const WHITE = "#ffffff";
const RED = "#e23b3b";

// Suit shapes normalised to a 100x100 box.
const SUITS = {
  spade:
    "M50 8 C50 8 14 40 14 60 C14 74 26 82 38 78 C40 90 34 94 30 96 L70 96 C66 94 60 90 62 78 C74 82 86 74 86 60 C86 40 50 8 50 8 Z",
  heart:
    "M50 90 C50 90 10 62 10 36 C10 20 24 12 38 18 C44 21 48 27 50 32 C52 27 56 21 62 18 C76 12 90 20 90 36 C90 62 50 90 50 90 Z",
  diamond: "M50 6 L92 50 L50 94 L8 50 Z",
  clubPath: "M44 55 L56 55 L62 92 L38 92 Z",
};

function suit(name, color, tx, ty, scale) {
  const g = (inner) =>
    `<g transform="translate(${tx} ${ty}) scale(${scale})" fill="${color}">${inner}</g>`;
  if (name === "club") {
    return g(
      `<circle cx="50" cy="30" r="18"/><circle cx="30" cy="58" r="18"/><circle cx="70" cy="58" r="18"/><path d="${SUITS.clubPath}"/>`
    );
  }
  return g(`<path d="${SUITS[name]}"/>`);
}

function buildSvg({ scale, offset }) {
  // offset = distance of each grid centre from the canvas centre (256)
  const half = 50 * scale;
  const lo = 256 - offset - half;
  const hi = 256 + offset - half;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="felt" cx="50%" cy="38%" r="80%">
      <stop offset="0%" stop-color="#1a7d44"/>
      <stop offset="55%" stop-color="#0c5e30"/>
      <stop offset="100%" stop-color="#063e20"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#felt)"/>
  ${suit("spade", WHITE, lo, lo, scale)}
  ${suit("heart", RED, hi, lo, scale)}
  ${suit("diamond", RED, lo, hi, scale)}
  ${suit("club", WHITE, hi, hi, scale)}
</svg>`;
}

const iconSvg = buildSvg({ scale: 1.7, offset: 92 });
const maskableSvg = buildSvg({ scale: 1.3, offset: 66 });

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const targets = [
    { svg: iconSvg, size: 192, file: "icon-192.png" },
    { svg: iconSvg, size: 512, file: "icon-512.png" },
    { svg: iconSvg, size: 180, file: "apple-icon.png" },
    { svg: maskableSvg, size: 512, file: "maskable-512.png" },
  ];
  for (const { svg, size, file } of targets) {
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(
      path.join(OUT_DIR, file)
    );
    console.log(`wrote public/icons/${file}`);
  }
  // Keep a vector copy too.
  await writeFile(path.join(OUT_DIR, "icon.svg"), iconSvg);
  console.log("wrote public/icons/icon.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
