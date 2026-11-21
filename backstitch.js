/* Поиск бэкстича на мелкой сетке k×k точек на клетку (Lab).
   Детали: тонкий штрих в клетке («дно» поперёк штриха), не попавший в её цвет,
   → лучший из шести стежков (четыре стороны, две диагонали).
   Контраст: граница клеток без деталей, где на фото переход резкий, а нитки близкие. Стежки одной нитки с общим узлом
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

    /* Уровень L включает всё, что находят уровни 1..L: иначе на текстуре «много»
       отбрасывало бы клетки с избытком штрихов и давало меньше линий, чем «мало». */
    const Lat = (sx, sy) => sub[(sy * W + sx) * 3];
    for (let l = 1; l <= level; l++) pass(T.tc[l], T.td[l]);

    function pass(tc, td) {
      /* --- шаг 1: детали ---
         Точка-штрих — «дно» поперёк штриха: на 2 точки в обе стороны по горизонтали
         или по вертикали светлее (для тёмного штриха) хотя бы на td. Так размытый
         штрих утончается до середины, а ступенька края области деталью не считается. */
      // у края картинки сравниваем с той стороной, которая есть
      function across(L, a, b, dir) {
        const v = [a, b].filter(t => t !== null);
        return dir < 0 ? Math.min(...v) - L : L - Math.max(...v);
      }
      function depth(sx, sy, L, dir) {   // dir −1: тёмный штрих, +1: светлый
        const h1 = across(L, sx >= 2 ? Lat(sx - 2, sy) : null, sx + 2 < W ? Lat(sx + 2, sy) : null, dir);
        const v1 = across(L, sy >= 2 ? Lat(sx, sy - 2) : null, sy + 2 < H ? Lat(sx, sy + 2) : null, dir);
        return Math.max(h1, v1);
      }
      const detailCell = new Uint8Array(w * h);
      const ridge = new Uint8Array(16), sign = new Int8Array(16);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const Lthr = palette[grid[y * w + x]].lab[0];
        let dark = 0, light = 0;
        sign.fill(0);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
          const sx = x * k + c, sy = y * k + r, L = Lat(sx, sy);
          if (Math.abs(L - Lthr) < td) continue;               // уже попало в цвет клетки
          if (depth(sx, sy, L, -1) >= td) { sign[r * 4 + c] = -1; dark++; }
          else if (depth(sx, sy, L, 1) >= td) { sign[r * 4 + c] = 1; light++; }
        }
        const pol = dark >= light ? -1 : 1, n = pol < 0 ? dark : light;
        if (n < 2 || n > 8) continue;
        detailCell[y * w + x] = 1;   // штрих есть — контраст рядом не ставим, даже если шаблон не подошёл
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

      /* --- шаг 2: контраст ---
         Границы клеток с деталью пропускаются: тонкий штрих у границы иначе даёт
         «лесенку» контраста по обе стороны от самой детали. */
      const depthK = k / 2;
      function edge(iA, iB, srcA, srcB, p, q) {
        if (detailCell[iA] || detailCell[iB]) return;
        const dSrc = dist(srcA, srcB);
        if (dSrc < tc) return;
        const la = palette[grid[iA]].lab, lb = palette[grid[iB]].lab;
        if (dist(la, lb) > dSrc / 2) return;
        const dark = la[0] <= lb[0] ? la : lb;
        put(p, q, [Math.max(5, dark[0] - 20), dark[1], dark[2]], "contrast");
      }
      for (let y = 0; y < h; y++) for (let x = 0; x + 1 < w; x++) {      // вертикальные границы
        const bx = (x + 1) * k;
        edge(y * w + x, y * w + x + 1,
          meanLab(bx - depthK, y * k, bx, (y + 1) * k), meanLab(bx, y * k, bx + depthK, (y + 1) * k),
          [x + 1, y], [x + 1, y + 1]);
      }
      for (let y = 0; y + 1 < h; y++) for (let x = 0; x < w; x++) {      // горизонтальные границы
        const by = (y + 1) * k;
        edge(y * w + x, (y + 1) * w + x,
          meanLab(x * k, by - depthK, (x + 1) * k, by), meanLab(x * k, by, (x + 1) * k, by + depthK),
          [x, y + 1], [x + 1, y + 1]);
      }
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

  /* Нитка для стежка: своя в пределах ΔE 10, иначе ближайшая из каталога
     (новая добавляется в colors с bs:true). Нитка контраста обязана быть темнее
     тёмной стороны хотя бы на 10: цель — эта сторона с L−20, значит L ≤ цель+10. */
  function threadPicker(colors, catalog) {
    return (lab, kind) => {
      const ok = L => kind !== "contrast" || L <= lab[0] + 10;
      let best = -1, bd = Infinity;
      colors.forEach((c, i) => { const d = dist(c.lab, lab); if (ok(c.lab[0]) && d < bd) { bd = d; best = i; } });
      if (bd <= 10) return best;
      let p = -1, pd = Infinity;
      catalog.forEach((c, j) => { const d = dist(c.lab, lab); if (ok(c.lab[0]) && d < pd) { pd = d; p = j; } });
      if (p < 0) return best >= 0 ? best : 0;
      const have = colors.findIndex(c => c.code === catalog[p].code);
      if (have >= 0) return have;
      colors.push({ ...catalog[p], bs: true, sym: "", count: 0, skip: false });
      return colors.length - 1;
    };
  }

  /* Не больше 4 бэкстич-ниток (индексы ≥ base): остаются самые используемые.
     Линии остальных — на близкую (ΔE ≤ 15) оставшуюся бэкстич-нитку, иначе линия
     выбрасывается: нитка крестиков сделала бы её невидимой. Неиспользованные
     бэкстич-нитки убираются из colors, индексы линий пересчитываются. */
  function pruneThreads(lines, colors, base, max = 4) {
    const use = new Map();
    lines.forEach(l => { if (l.c >= base) use.set(l.c, (use.get(l.c) || 0) + l.segs.length); });
    const keep = new Set([...use.keys()].sort((a, b) => use.get(b) - use.get(a)).slice(0, max));
    for (const l of lines) if (l.c >= base && !keep.has(l.c)) {
      let best = -1, bd = 15;
      for (const i of keep) { const d = dist(colors[i].lab, colors[l.c].lab); if (d <= bd) { bd = d; best = i; } }
      l.c = best;
    }
    lines = lines.filter(l => l.c >= 0);
    const remap = new Map(); let next = base;
    for (let i = base; i < colors.length; i++) if (keep.has(i)) remap.set(i, next++);
    const kept = colors.slice(base).filter((c, j) => keep.has(base + j));
    colors.length = base; colors.push(...kept);
    for (const l of lines) if (l.c >= base) l.c = remap.get(l.c);
    return mergeLines(lines);
  }

  // линии одной нитки с общим узлом склеиваются
  function mergeLines(lines) {
    const parent = lines.map((l, i) => i);
    const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const at = new Map();
    lines.forEach((l, i) => { for (const sg of l.segs) for (const n of sg) {
      const key = l.c + ":" + n;
      if (at.has(key)) { const a = root(i), b = root(at.get(key)); if (a !== b) parent[a] = b; }
      else at.set(key, i);
    } });
    const out = new Map();
    lines.forEach((l, i) => { const r = root(i); if (!out.has(r)) out.set(r, { c: l.c, segs: [] }); out.get(r).segs.push(...l.segs); });
    return [...out.values()];
  }

  const api = { find, threadPicker, pruneThreads, mergeLines, T_DEFAULT };
  root.Backstitch = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
