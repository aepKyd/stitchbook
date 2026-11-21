"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseStitchFile, looksLikeStitchFile } = require("../stitchfile.js");

// то, что сейчас пишет pack() в index.html
function sample(over = {}) {
  return {
    v: 1, id: "pabc123", name: "Кот", w: 3, h: 2, count: 14,
    colors: [
      { code: "310", name: "Black", r: 0, g: 0, b: 0, sym: "■", count: 4, skip: false },
      { code: "White", name: "White", r: 252, g: 251, b: 248, sym: "□", count: 2, skip: false }
    ],
    grid: [0, 4, 1, 2],
    done: [1, 1, 0, 5],
    at: 1763740000000,
    ...over
  };
}
const txt = o => JSON.stringify(o);

test("принимает файл, который пишет экспорт", () => {
  const p = parseStitchFile(txt(sample()));
  assert.equal(p.id, "pabc123");
  assert.equal(p.name, "Кот");
  assert.equal(p.w, 3);
  assert.equal(p.colors.length, 2);
  assert.deepEqual(p.grid, [0, 4, 1, 2]);
});

test("не JSON — понятная ошибка", () => {
  assert.throws(() => parseStitchFile("\x89PNG..."), /не файл схемы/);
});

test("JSON, но не схема", () => {
  assert.throws(() => parseStitchFile(txt({ hello: 1 })), /не файл схемы/);
});

test("неизвестная версия формата", () => {
  assert.throws(() => parseStitchFile(txt(sample({ v: 99 }))), /версии 99/);
});

test("сетка не совпадает с размером", () => {
  assert.throws(() => parseStitchFile(txt(sample({ grid: [0, 5] }))), /повреждён/);
});

test("индекс цвета вне палитры", () => {
  assert.throws(() => parseStitchFile(txt(sample({ grid: [0, 4, 7, 2] }))), /повреждён/);
});

test("прогресс не той длины", () => {
  assert.throws(() => parseStitchFile(txt(sample({ done: [0, 2] }))), /повреждён/);
});

test("прогресс только 0/1", () => {
  assert.throws(() => parseStitchFile(txt(sample({ done: [2, 6] }))), /повреждён/);
});

test("цвет без корректного RGB", () => {
  const s = sample(); s.colors[0].r = 300;
  assert.throws(() => parseStitchFile(txt(s)), /повреждён/);
});

test("без id/имени — подставляет свои", () => {
  const s = sample(); delete s.id; delete s.name;
  const p = parseStitchFile(txt(s));
  assert.match(p.id, /^p[0-9a-z]+$/);
  assert.equal(p.name, "Схема из файла");
});

test("лишние поля цвета отбрасываются, skip приводится к boolean", () => {
  const s = sample(); s.colors[0].evil = "<img>"; delete s.colors[1].skip;
  const p = parseStitchFile(txt(s));
  assert.equal("evil" in p.colors[0], false);
  assert.equal(p.colors[1].skip, false);
});

test("BOM в начале файла не мешает", () => {
  const p = parseStitchFile("﻿" + txt(sample()));
  assert.equal(p.id, "pabc123");
});

test("распознаёт файл схемы по имени и типу", () => {
  assert.equal(looksLikeStitchFile({ name: "Кот.stitch.json", type: "" }), true);
  assert.equal(looksLikeStitchFile({ name: "x.JSON", type: "" }), true);
  assert.equal(looksLikeStitchFile({ name: "blob", type: "application/json" }), true);
  assert.equal(looksLikeStitchFile({ name: "IMG_1.HEIC", type: "image/heic" }), false);
  assert.equal(looksLikeStitchFile({ name: "photo.jpg", type: "image/jpeg" }), false);
});
