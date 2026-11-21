/* Поиск бэкстича на мелкой сетке k×k точек на клетку (Lab).
   Контраст: граница клеток, где на фото переход резкий, а нитки близкие.
   Детали: тонкий штрих в клетке, не попавший в её цвет, → лучший из шести
   стежков (четыре стороны, две диагонали). Стежки одной нитки с общим узлом
   склеиваются в линии; линии короче двух стежков выбрасываются.
   Узел n = y*(w+1)+x; стежок [n1, n2], n1 < n2. */
(function (root) {
  "use strict";
  const T_DEFAULT = { tc: { 1: 30, 2: 22, 3: 15 }, td: { 1: 30, 2: 22, 3: 15 } };

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // шаблоны 4×4: 4 слота, слот — список точек [col, row] внутри клетки
  const nb4 = (c, r) => [[c, r], [c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]
    .filter(([x, y]) => x >= 0 && y >= 0 && x < 4 && y < 4);
  const TEMPLATES = [
    { name: "\\", slots: [0, 1, 2, 3].map(i => nb4(i, i)), seg: (x, y) => [[x, y], [x + 1, y + 1]] },
    { name: "/", slots: [0, 1, 2, 3].map(i => nb4(3 - i, i)), seg: (x, y) => [[x + 1, y], [x, y + 1]] },
    { name: "top", slots: [0, 1, 2, 3].map(i => [[i, 0], [i, 1]]), seg: (x, y) => [[x, y], [x + 1, y]] },
    { name: "bottom", slots: [0, 1, 2, 3].map(i => [[i, 2], [i, 3]]), seg: (x, y) => [[x, y + 1], [x + 1, y + 1]] },
    { name: "left", slots: [0, 1, 2, 3].map(i => [[0, i], [1, i]]), seg: (x, y) => [[x, y], [x, y + 1]] },
    { name: "right", slots: [0, 1, 2, 3].map(i => [[2, i], [3, i]]), seg: (x, y) => [[x + 1, y], [x + 1, y + 1]] }
  ];

  function find({ w, h, k = 4, sub, grid, palette, level, pickThread, T = T_DEFAULT }) {
    if (!level) return [];
    if (k !== 4) throw new Error("backstitch: поддерживается только k = 4");
    const tc = T.tc[level], td = T.td[level];
    const W = w * k, H = h * k;
    const node = (x, y) => y * (w + 1) + x;
    const segs = new Map();   // "n1-n2" → {n1, n2, c, kind}

    function put(p, q, lab, kind) {
      let n1 = node(p[0], p[1]), n2 = node(q[0], q[1]);
      if (n1 > n2) [n1, n2] = [n2, n1];
      const key = n1 + "-" + n2;
      const prev = segs.get(key);
      if (prev && (prev.kind === "contrast" || kind === "detail")) return;   // контраст важнее
      segs.set(key, { n1, n2, c: pickThread(lab, kind), kind });
    }

    // среднее Lab прямоугольника мелкой сетки
    function meanLab(x0, y0, x1, y1) {
      let L = 0, a = 0, b = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const i = (sy * W + sx) * 3; L += sub[i]; a += sub[i + 1]; b += sub[i + 2]; n++;
      }
      return [L / n, a / n, b / n];
    }

    /* --- шаг 1: контраст --- */
    const depth = k / 2;
    function edge(gA, gB, srcA, srcB, p, q) {
      const dSrc = dist(srcA, srcB);
      if (dSrc < tc) return;
      const la = palette[gA].lab, lb = palette[gB].lab;
      if (dist(la, lb) > dSrc / 2) return;
      const dark = la[0] <= lb[0] ? la : lb;
      put(p, q, [Math.max(5, dark[0] - 20), dark[1], dark[2]], "contrast");
    }
    for (let y = 0; y < h; y++) for (let x = 0; x + 1 < w; x++) {      // вертикальные границы
      const bx = (x + 1) * k;
      edge(grid[y * w + x], grid[y * w + x + 1],
        meanLab(bx - depth, y * k, bx, (y + 1) * k), meanLab(bx, y * k, bx + depth, (y + 1) * k),
        [x + 1, y], [x + 1, y + 1]);
    }
    for (let y = 0; y + 1 < h; y++) for (let x = 0; x < w; x++) {      // горизонтальные границы
      const by = (y + 1) * k;
      edge(grid[y * w + x], grid[(y + 1) * w + x],
        meanLab(x * k, by - depth, (x + 1) * k, by), meanLab(x * k, by, (x + 1) * k, by + depth),
        [x, y + 1], [x + 1, y + 1]);
    }

    /* --- шаг 2: детали --- */
    // префиксные суммы L для фона по блоку 3×3 клеток
    const ps = new Float64Array((W + 1) * (H + 1));
    for (let sy = 0; sy < H; sy++) {
      let row = 0;
      for (let sx = 0; sx < W; sx++) {
        row += sub[(sy * W + sx) * 3];
        ps[(sy + 1) * (W + 1) + sx + 1] = ps[sy * (W + 1) + sx + 1] + row;
      }
    }
    const rectL = (x0, y0, x1, y1) =>
      (ps[y1 * (W + 1) + x1] - ps[y0 * (W + 1) + x1] - ps[y1 * (W + 1) + x0] + ps[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));

    const ridge = new Uint8Array(16);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const Lbg = rectL(Math.max(0, x - 1) * k, Math.max(0, y - 1) * k, Math.min(w, x + 2) * k, Math.min(h, y + 2) * k);
      const Lthr = palette[grid[y * w + x]].lab[0];
      let dark = 0, light = 0;
      const sign = new Int8Array(16);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const L = sub[((y * k + r) * W + x * k + c) * 3];
        if (Math.abs(L - Lbg) >= td && Math.abs(L - Lthr) >= td) {
          sign[r * 4 + c] = L < Lbg ? -1 : 1;
          if (L < Lbg) dark++; else light++;
        }
      }
      const pol = dark >= light ? -1 : 1, n = pol < 0 ? dark : light;
      if (n < 2 || n > 8) continue;
      let lab = [0, 0, 0];
      for (let i = 0; i < 16; i++) {
        ridge[i] = sign[i] === pol ? 1 : 0;
        if (ridge[i]) {
          const j = ((y * k + (i >> 2)) * W + x * k + (i & 3)) * 3;
          lab[0] += sub[j]; lab[1] += sub[j + 1]; lab[2] += sub[j + 2];
        }
      }
      lab = lab.map(v => v / n);
      let best = null, bestScore = 2;
      for (const t of TEMPLATES) {
        const score = t.slots.filter(slot => slot.some(([c, r]) => ridge[r * 4 + c])).length;
        if (score > bestScore) { best = t; bestScore = score; }
      }
      if (best) { const [p, q] = best.seg(x, y); put(p, q, lab, "detail"); }
    }

    /* --- шаг 3: линии --- */
    const byThread = new Map();
    for (const s of segs.values()) {
      if (!byThread.has(s.c)) byThread.set(s.c, []);
      byThread.get(s.c).push(s);
    }
    const lines = [];
    for (const [c, list] of byThread) {
      const parent = new Map();
      const findRoot = v => { while (parent.get(v) !== v) { parent.set(v, parent.get(parent.get(v))); v = parent.get(v); } return v; };
      for (const s of list) {
        for (const v of [s.n1, s.n2]) if (!parent.has(v)) parent.set(v, v);
        const a = findRoot(s.n1), b = findRoot(s.n2);
        if (a !== b) parent.set(a, b);
      }
      const groups = new Map();
      for (const s of list) {
        const r = findRoot(s.n1);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push([s.n1, s.n2]);
      }
      for (const g of groups.values()) if (g.length >= 2) lines.push({ c, segs: g });
    }
    return lines;
  }

  const api = { find, T_DEFAULT };
  root.Backstitch = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
