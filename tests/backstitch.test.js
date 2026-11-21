"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { find } = require("../backstitch.js");

const K = 4;
// мелкая сетка k×k на клетку; fn(sx, sy) → L, a = b = 0
function img(w, h, fn) {
  const W = w * K, H = h * K, sub = new Float32Array(W * H * 3);
  for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) sub[(sy * W + sx) * 3] = fn(sx, sy);
  return sub;
}
const pick = lab => (lab[0] < 50 ? 1 : 0);
function run(o) {
  return find({ k: K, level: 2, pickThread: pick, grid: new Int32Array(o.w * o.h), palette: [{ lab: [55, 0, 0] }], ...o });
}
const allSegs = lines => lines.flatMap(l => l.segs);
const node = (w, x, y) => y * (w + 1) + x;

test("контраст на резкой границе при одинаковой нитке", () => {
  const w = 6, h = 4;
  const lines = run({ w, h, sub: img(w, h, sx => (sx < 12 ? 70 : 40)) });
  assert.equal(lines.length, 1);
  const segs = lines[0].segs.map(s => s.join("-")).sort();
  const want = [0, 1, 2, 3].map(y => `${node(w, 3, y)}-${node(w, 3, y + 1)}`).sort();
  assert.deepEqual(segs, want);
});

test("нет линии при контрастных нитках", () => {
  const w = 6, h = 4, grid = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 3; x < w; x++) grid[y * w + x] = 1;
  const lines = run({ w, h, grid, palette: [{ lab: [70, 0, 0] }, { lab: [40, 0, 0] }],
    sub: img(w, h, sx => (sx < 12 ? 70 : 40)) });
  assert.deepEqual(lines, []);
});

test("нет линии на плавном градиенте", () => {
  const w = 10, h = 4;
  assert.deepEqual(run({ w, h, sub: img(w, h, sx => 40 + sx) }), []);
});

test("тонкая диагональ — диагональные стежки", () => {
  const w = 6, h = 6;
  const lines = run({ w, h, palette: [{ lab: [80, 0, 0] }], sub: img(w, h, (sx, sy) => (sx === sy ? 20 : 80)) });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].segs.length >= 4);
  for (const [a, b] of lines[0].segs) {
    const y = Math.floor(a / (w + 1));
    assert.deepEqual([a, b], [node(w, y, y), node(w, y + 1, y + 1)]);
  }
});

test("галочка — две диагонали с общим узлом", () => {
  const w = 6, h = 4;
  const dark = (sx, sy) => (sx >= 4 && sx <= 7 && sy === sx) || (sx >= 8 && sx <= 11 && sy === 15 - sx);
  const lines = run({ w, h, palette: [{ lab: [85, 0, 0] }], sub: img(w, h, (sx, sy) => (dark(sx, sy) ? 20 : 85)) });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].segs.length, 2);
  const v = node(w, 2, 2);
  assert.ok(lines[0].segs.every(s => s.includes(v)));
});

test("тонкая горизонталь посреди клеток", () => {
  const w = 6, h = 4;
  const lines = run({ w, h, palette: [{ lab: [80, 0, 0] }], sub: img(w, h, (sx, sy) => (sy === 5 ? 20 : 80)) });
  const segs = allSegs(lines);
  assert.ok(segs.length >= 5);
  for (const [a, b] of segs) {
    assert.equal(Math.floor(a / (w + 1)), 1);
    assert.equal(b - a, 1);
  }
});

test("однотонная картинка — пусто", () => {
  const w = 5, h = 5;
  assert.deepEqual(run({ w, h, sub: img(w, h, () => 60) }), []);
});

test("level 0 — пусто", () => {
  const w = 6, h = 4;
  assert.deepEqual(run({ w, h, level: 0, sub: img(w, h, sx => (sx < 12 ? 70 : 40)) }), []);
});

test("level 3 не меньше level 1", () => {
  const w = 8, h = 8;
  const f = (sx, sy) => (sx === sy ? 20 : sx < 16 ? 75 : 55);
  const sub = img(w, h, f);
  const n1 = allSegs(run({ w, h, sub, level: 1 })).length;
  const n3 = allSegs(run({ w, h, sub, level: 3 })).length;
  assert.ok(n3 >= n1, `${n3} < ${n1}`);
  assert.ok(n3 > 0);
});

test("одиночный стежок выбрасывается", () => {
  const w = 6, h = 6;
  const sub = img(w, h, (sx, sy) => (sx === sy && sx >= 8 && sx <= 11 ? 20 : 80));
  assert.deepEqual(run({ w, h, palette: [{ lab: [80, 0, 0] }], sub }), []);
});

test("разные нитки — разные линии", () => {
  const w = 8, h = 4;
  const f = (sx, sy) => (sx === sy ? 20 : sx === sy + 16 ? 30 : 85);
  const lines = run({ w, h, palette: [{ lab: [85, 0, 0] }], sub: img(w, h, f),
    pickThread: lab => (lab[0] < 25 ? 1 : 2) });
  assert.deepEqual(lines.map(l => l.c).sort(), [1, 2]);
});

test("контраст у края", () => {
  const w = 4, h = 5;
  const lines = run({ w, h, sub: img(w, h, (sx, sy) => (sy < 12 ? 70 : 40)) });
  const segs = allSegs(lines).map(s => s.join("-")).sort();
  const want = [0, 1, 2, 3].map(x => `${node(w, x, 3)}-${node(w, x + 1, 3)}`).sort();
  assert.deepEqual(segs, want);
});

test("нитка контраста — от более тёмной стороны с L−20", () => {
  const w = 6, h = 4, seen = [];
  run({ w, h, sub: img(w, h, sx => (sx < 12 ? 70 : 40)), pickThread: (lab, kind) => { seen.push([lab[0], kind]); return 0; } });
  assert.ok(seen.length > 0);
  assert.ok(seen.every(([L, kind]) => kind === "contrast" && L === 35));
});

/* --- правки по финальному ревью --- */
// размытая тёмная диагональ x = y: профиль Гаусса σ (в точках мелкой сетки)
const blurDiag = (sigma, bg = 85, depth = 65) => (sx, sy) => {
  const d = (sx - sy) / Math.SQRT2;
  return bg - depth * Math.exp(-(d * d) / (2 * sigma * sigma));
};

test("I-1: размытая диагональ — только диагональные стежки", () => {
  const w = 12, h = 12;
  const lines = run({ w, h, palette: [{ lab: [85, 0, 0] }], sub: img(w, h, blurDiag(1)) });
  const segs = allSegs(lines);
  assert.equal(segs.length, 12);
  for (const [a, b] of segs) assert.equal(b - a, w + 2, `не диагональ: ${a}-${b}`);
});

test("I-1: на размытой диагонали уровни монотонны", () => {
  const w = 12, h = 12, sub = img(w, h, blurDiag(0.8));
  const n = [1, 2, 3].map(level => allSegs(run({ w, h, level, palette: [{ lab: [85, 0, 0] }], sub })).length);
  assert.ok(n[0] <= n[1] && n[1] <= n[2], n.join("/"));
});

for (const off of [1, 2, 3]) {
  test(`I-2: край контрастных ниток со смещением ${off} внутри клетки — пусто`, () => {
    const w = 6, h = 4, edge = 12 + off, grid = new Int32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid[y * w + x] = (x * 4 + 2 < edge) ? 0 : 1;
    const lines = run({ w, h, grid, palette: [{ lab: [30, 0, 0] }, { lab: [80, 0, 0] }],
      sub: img(w, h, sx => (sx < edge ? 30 : 80)) });
    assert.deepEqual(lines, []);
  });
}

test("уровни монотонны на мелкой текстуре", () => {
  const w = 40, h = 40;
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const vals = new Float32Array(w * 2 * h * 2).map(() => 30 + rnd() * 50);
  const sub = img(w, h, (sx, sy) => vals[(sy >> 1) * w * 2 + (sx >> 1)]);
  const n = [1, 2, 3].map(level => allSegs(run({ w, h, level, sub })).length);
  assert.ok(n[0] <= n[1] && n[1] <= n[2], n.join("/"));
});

/* --- нитки бэкстича: подбор и лимит (вынесено из index.html) --- */
const { threadPicker, pruneThreads } = require("../backstitch.js");
const cat = labs => labs.map((lab, i) => ({ code: "D" + i, lab }));

test("M-3: нитка контраста темнее тёмной стороны хотя бы на 10", () => {
  const colors = [{ code: "X", lab: [69, 0, 0] }];
  const pick = threadPicker(colors, cat([[65, 0, 0], [45, 0, 0]]));
  const c = pick([49, 0, 0], "contrast");          // сторона L 69 → цель 49
  assert.equal(colors[c].lab[0], 45);
  assert.equal(colors[c].bs, true);
});

test("деталь берёт ближайшую нитку без ограничения по тону", () => {
  const colors = [{ code: "X", lab: [20, 0, 0] }];
  const pick = threadPicker(colors, cat([[65, 0, 0], [45, 0, 0]]));
  assert.equal(colors[pick([60, 0, 0], "detail")].lab[0], 65);
});

test("своя нитка в пределах ΔE 10 переиспользуется", () => {
  const colors = [{ code: "X", lab: [40, 0, 0] }];
  const pick = threadPicker(colors, cat([[45, 0, 0]]));
  assert.equal(pick([44, 0, 0], "detail"), 0);
  assert.equal(colors.length, 1);
});

function bsSetup(labs) {
  const colors = [{ code: "X", lab: [90, 0, 0] }, ...labs.map((lab, i) => ({ code: "B" + i, lab, bs: true }))];
  return colors;
}

test("I-3: пятая нитка далеко от оставшихся — её линия выбрасывается", () => {
  const colors = bsSetup([[10, 0, 0], [30, 40, 0], [30, -40, 0], [30, 0, 40], [30, 0, -40]]);
  const lines = [5, 4, 3, 2, 1].map((n, i) => ({ c: 1 + i, segs: Array.from({ length: n + 1 }, (_, k) => [100 * i + k, 100 * i + k + 1]) }));
  const out = pruneThreads(lines, colors, 1);
  assert.equal(out.length, 4);
  assert.equal(colors.length, 5);
  assert.ok(out.every(l => l.c >= 1 && l.c <= 4));
});

test("I-3: близкая пятая нитка переходит на оставшуюся, линии склеиваются", () => {
  const colors = bsSetup([[10, 0, 0], [30, 40, 0], [30, -40, 0], [30, 0, 40], [14, 0, 0]]);
  const lines = [
    { c: 1, segs: [[0, 1], [1, 2], [2, 3]] },
    { c: 2, segs: [[100, 101], [101, 102], [102, 103]] },
    { c: 3, segs: [[200, 201], [201, 202], [202, 203]] },
    { c: 4, segs: [[300, 301], [301, 302], [302, 303]] },
    { c: 5, segs: [[3, 4], [4, 5]] }
  ];
  const out = pruneThreads(lines, colors, 1);
  assert.equal(out.length, 4);
  const merged = out.find(l => l.segs.some(s => s[0] === 4));
  assert.equal(merged.segs.length, 5);
  assert.equal(colors[merged.c].code, "B0");
});

test("лимит не трогает нитки крестиков и убирает неиспользованные бэкстич-нитки", () => {
  const colors = [{ code: "X", lab: [90, 0, 0] }, { code: "Y", lab: [50, 0, 0] }, { code: "B0", lab: [10, 0, 0], bs: true }, { code: "B1", lab: [20, 0, 0], bs: true }];
  const out = pruneThreads([{ c: 1, segs: [[0, 1], [1, 2]] }, { c: 3, segs: [[5, 6], [6, 7]] }], colors, 2);
  assert.deepEqual(colors.map(c => c.code), ["X", "Y", "B1"]);
  assert.deepEqual(out.map(l => l.c).sort(), [1, 2]);
});
