// Crops the original 2048x2048 logo PNG into one tile per letter using
// hand-tuned x-ranges (script letters are connected, so bbox grouping can't
// separate them automatically). Writes brand/letters/01.png..NN.png and
// brand/letters.json with each tile's % position within the source canvas.

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

const PNG_SRC  = 'brand/logo-wide.png';
const OUT_DIR  = 'brand/letters';
const OUT_JSON = 'brand/letters.json';
const SRC_SIZE = 2048;

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Visual ranges in the 2048x2048 source, measured from the traced bbox.
// Row 1 ("Soberi") sits at y 460-985, row 2 ("Party") at y 1030-1700.
// Within each row, vertical seams between letters are picked to land in the
// thin connecting strokes of the script so each tile reads as one glyph.
const ROW1_TOP = 440, ROW1_BOTTOM = 990;
const ROW2_TOP = 1030, ROW2_BOTTOM = 1720;

const tiles = [
  // Top row: S, o, b, e, r, i
  { name: 'S',  row: 0, x1: 280,  x2: 590,  yTop: ROW1_TOP, yBot: ROW1_BOTTOM },
  { name: 'o',  row: 0, x1: 590,  x2: 805,  yTop: ROW1_TOP, yBot: ROW1_BOTTOM },
  { name: 'b',  row: 0, x1: 805,  x2: 1085, yTop: ROW1_TOP, yBot: ROW1_BOTTOM },
  { name: 'e',  row: 0, x1: 1085, x2: 1320, yTop: ROW1_TOP, yBot: ROW1_BOTTOM },
  { name: 'r',  row: 0, x1: 1320, x2: 1530, yTop: ROW1_TOP, yBot: ROW1_BOTTOM },
  { name: 'i',  row: 0, x1: 1530, x2: 1760, yTop: ROW1_TOP, yBot: ROW1_BOTTOM },
  // Detached dot above "i" — separate tiny tile
  { name: 'dot', row: 0, x1: 1660, x2: 1750, yTop: 600, yBot: 705 },
  // Bottom row: P, a, r, t, y
  { name: 'P',  row: 1, x1: 290,  x2: 700,  yTop: ROW2_TOP, yBot: ROW2_BOTTOM },
  { name: 'a',  row: 1, x1: 700,  x2: 980,  yTop: ROW2_TOP, yBot: ROW2_BOTTOM },
  { name: 'r',  row: 1, x1: 980,  x2: 1220, yTop: ROW2_TOP, yBot: ROW2_BOTTOM },
  { name: 't',  row: 1, x1: 1220, x2: 1410, yTop: ROW2_TOP, yBot: ROW2_BOTTOM },
  { name: 'y',  row: 1, x1: 1410, x2: 1740, yTop: ROW2_TOP, yBot: ROW2_BOTTOM },
];

(async () => {
  const meta = [];
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const left = Math.max(0, t.x1);
    const top  = Math.max(0, t.yTop);
    const width  = Math.min(SRC_SIZE, t.x2) - left;
    const height = Math.min(SRC_SIZE, t.yBot) - top;
    if (width <= 0 || height <= 0) continue;

    const outName = String(i + 1).padStart(2, '0') + '-' + t.name + '.png';
    const outPath = path.join(OUT_DIR, outName);
    await sharp(PNG_SRC).extract({ left, top, width, height }).toFile(outPath);

    meta.push({
      file: 'brand/letters/' + outName,
      name: t.name,
      row: t.row,
      leftPct:   (left   / SRC_SIZE) * 100,
      topPct:    (top    / SRC_SIZE) * 100,
      widthPct:  (width  / SRC_SIZE) * 100,
      heightPct: (height / SRC_SIZE) * 100,
    });
    console.log('cropped', outName, width + 'x' + height, 'at', left + ',' + top);
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(meta, null, 2));
  console.log('Wrote', OUT_JSON, '—', meta.length, 'tiles');
})().catch(e => { console.error(e); process.exit(1); });
