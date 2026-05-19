// Builds an inline SVG that shows the ORIGINAL logo PNG through 12 per-letter
// masks. Each mask uses the traced contours that fall inside that letter's
// x/y region, so the visible pixels are the actual brand artwork (with all
// hair-line tails and serifs), one letter at a time — no rectangular cuts.

const fs = require('fs');

const svgRaw = fs.readFileSync('brand/logo-traced.svg', 'utf8');
const m = svgRaw.match(/d="([^"]+)"/);
if (!m) { console.error('no d'); process.exit(1); }
const dAttr = m[1];
const tokens = dAttr.split(/(?=\bM\s)/).map(s => s.trim()).filter(Boolean);

function bboxOf(subD) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const nums = subD.match(/-?\d+(?:\.\d+)?/g) || [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = parseFloat(nums[i]);
    const y = parseFloat(nums[i + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY,
           cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

const pieces = tokens.map(td => ({ d: td, bbox: bboxOf(td) }));

// Hand-tuned regions in 2048x2048 source. The "dot" goes first so it claims
// the small isolated piece above the "i" before "i" itself sweeps it up.
const letters = [
  { name: 'dot', x1: 1640, x2: 1770, y1: 580, y2: 720 },
  { name: 'S',  x1: 250,  x2: 590,  y1: 440, y2: 990 },
  { name: 'o',  x1: 590,  x2: 805,  y1: 440, y2: 990 },
  { name: 'b',  x1: 805,  x2: 1085, y1: 440, y2: 990 },
  { name: 'e',  x1: 1085, x2: 1320, y1: 440, y2: 990 },
  { name: 'r1', x1: 1320, x2: 1530, y1: 440, y2: 990 },
  { name: 'i',  x1: 1530, x2: 1780, y1: 740, y2: 990 },
  { name: 'P',  x1: 250,  x2: 700,  y1: 1030, y2: 1720 },
  { name: 'a',  x1: 700,  x2: 980,  y1: 1030, y2: 1720 },
  { name: 'r2', x1: 980,  x2: 1220, y1: 1030, y2: 1720 },
  { name: 't',  x1: 1220, x2: 1410, y1: 1030, y2: 1720 },
  { name: 'y',  x1: 1410, x2: 1780, y1: 1030, y2: 1850 },
];
const letterIdx = letters.map(() => []);

pieces.forEach(p => {
  const { cx, cy } = p.bbox;
  for (let i = 0; i < letters.length; i++) {
    const L = letters[i];
    if (cx >= L.x1 && cx <= L.x2 && cy >= L.y1 && cy <= L.y2) {
      letterIdx[i].push(p.d);
      break;
    }
  }
});

// Reorder for animation: S → o → b → e → r → i → dot → P → a → r → t → y
const animOrder = ['S','o','b','e','r1','i','dot','P','a','r2','t','y'];
const ordered = animOrder.map(n => {
  const i = letters.findIndex(l => l.name === n);
  return { name: n, paths: letterIdx[i] };
});

const STAGGER = 0.42, START = 0.5;
let svg = '<svg viewBox="0 0 2048 2048" preserveAspectRatio="xMidYMid meet" aria-label="Soberi Party" class="hero-logo-svg">\n';
svg += '  <defs>\n';
ordered.forEach((l, i) => {
  svg += '    <mask id="m' + i + '" maskUnits="userSpaceOnUse" x="0" y="0" width="2048" height="2048">\n';
  svg += '      <rect width="2048" height="2048" fill="black"/>\n';
  l.paths.forEach(d => { svg += '      <path d="' + d + '" fill="white"/>\n'; });
  svg += '    </mask>\n';
});
svg += '  </defs>\n';
ordered.forEach((l, i) => {
  const delay = (START + i * STAGGER).toFixed(2);
  svg += '  <image href="brand/logo-wide.png" x="0" y="0" width="2048" height="2048" ';
  svg += 'mask="url(#m' + i + ')" class="letter" style="animation-delay:' + delay + 's"/>\n';
});
svg += '</svg>';

fs.writeFileSync('brand/letters-masked.svg', svg);
console.log('done — paths per letter:', ordered.map(l => l.name + ':' + l.paths.length).join(', '));
