/* Файл схемы (.stitch.json): разбор и проверка при импорте.
   Формат пишет pack() в index.html. Файл пришёл извне — доверять ему нельзя:
   проверяем размеры, RLE, индексы цветов и оставляем только известные поля. */
(function (root) {
  "use strict";
  const BAD = "файл повреждён";
  const MAX_CELLS = 1e6;
  const MAX_SEGS = 200000;

  function fail(msg) { throw new Error(msg); }
  const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

  // RLE: [значение, длина, значение, длина, ...]; сумма длин должна быть total
  function checkRle(o, maxVal, total) {
    if (total === 0 && Array.isArray(o) && o.length === 0) return;
    if (!Array.isArray(o) || o.length === 0 || o.length % 2) fail(BAD);
    let len = 0;
    for (let i = 0; i < o.length; i += 2) {
      if (!isInt(o[i], 0, maxVal) || !isInt(o[i + 1], 1, total)) fail(BAD);
      len += o[i + 1];
      if (len > total) fail(BAD);
    }
    if (len !== total) fail(BAD);
  }

  function parseStitchFile(text) {
    let p;
    try { p = JSON.parse(String(text).replace(/^﻿/, "")); }
    catch (e) { fail("это не файл схемы"); }
    if (!p || typeof p !== "object" || !("grid" in p) || !("colors" in p)) fail("это не файл схемы");
    if (p.v !== 1 && p.v !== 2) fail(`файл схемы версии ${p.v} — обновите приложение`);

    if (!isInt(p.w, 1, 10000) || !isInt(p.h, 1, 10000) || p.w * p.h > MAX_CELLS) fail(BAD);
    const total = p.w * p.h;
    if (!Array.isArray(p.colors) || p.colors.length === 0) fail(BAD);

    const colors = p.colors.map(c => {
      if (!c || typeof c !== "object") fail(BAD);
      if (!isInt(c.r, 0, 255) || !isInt(c.g, 0, 255) || !isInt(c.b, 0, 255)) fail(BAD);
      return {
        code: String(c.code ?? "").slice(0, 16),
        name: String(c.name ?? "").slice(0, 60),
        r: c.r, g: c.g, b: c.b,
        sym: String(c.sym ?? "?").slice(0, 2),
        count: isInt(c.count, 0, total) ? c.count : 0,
        skip: !!c.skip,
        bs: !!c.bs
      };
    });
    checkRle(p.grid, colors.length - 1, total);
    checkRle(p.done, 1, total);

    // бэкстич (v2): стежок — пара соседних узлов сетки (w+1)×(h+1)
    let lines = [], lineDone = [];
    if (p.v === 2) {
      if (!Array.isArray(p.lines)) fail(BAD);
      const nodes = (p.w + 1) * (p.h + 1);
      let segCount = 0;
      lines = p.lines.map(l => {
        if (!l || typeof l !== "object" || !isInt(l.c, 0, colors.length - 1)) fail(BAD);
        const s = l.s;
        if (!Array.isArray(s) || s.length < 4 || s.length % 2) fail(BAD);
        for (let i = 0; i < s.length; i += 2) {
          if (!isInt(s[i], 0, nodes - 1) || !isInt(s[i + 1], 0, nodes - 1)) fail(BAD);
          const dx = Math.abs(s[i] % (p.w + 1) - s[i + 1] % (p.w + 1));
          const dy = Math.abs(Math.floor(s[i] / (p.w + 1)) - Math.floor(s[i + 1] / (p.w + 1)));
          if (dx > 1 || dy > 1 || dx + dy === 0) fail(BAD);
        }
        segCount += s.length / 2;
        if (segCount > MAX_SEGS) fail(BAD);
        return { c: l.c, s: s.slice() };
      });
      checkRle(p.lineDone, 1, lines.length);
      lineDone = p.lineDone.slice();
    }

    const id = typeof p.id === "string" && /^[0-9a-zA-Z_-]{1,40}$/.test(p.id)
      ? p.id : "p" + Date.now().toString(36);
    const name = typeof p.name === "string" && p.name.trim()
      ? p.name.trim().slice(0, 80) : "Схема из файла";
    const count = isInt(p.count, 1, 100) ? p.count : 14;

    return { v: 2, id, name, w: p.w, h: p.h, count, colors, grid: p.grid, done: p.done, lines, lineDone,
             at: Number.isFinite(p.at) ? p.at : Date.now() };
  }

  // по имени/типу: системы часто отдают .json как "" или text/plain
  function looksLikeStitchFile(f) {
    if (!f) return false;
    return /\.json$/i.test(f.name || "") || /json/i.test(f.type || "");
  }

  const api = { parseStitchFile, looksLikeStitchFile };
  root.StitchFile = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
