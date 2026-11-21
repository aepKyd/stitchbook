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
