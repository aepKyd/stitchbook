"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { create } = require("../gestures.js");

function setup(canMark = () => true) {
  const log = [];
  const g = create({ emit: a => log.push(a), canMark });
  const P = (id, kind, x, y, t, button = 0) => ({ id, kind, x, y, t, button });
  const types = () => log.map(a => a.type);
  return { g, log, P, types };
}
const close = (a, b) => Math.abs(a - b) < 1e-9;

test("свайп пальцем двигает и не отмечает", () => {
  const { g, log, P, types } = setup();
  g.down(P(1, "touch", 100, 100, 0));
  g.move(P(1, "touch", 130, 100, 50));
  g.up(P(1, "touch", 130, 100, 60));
  assert.ok(types().length > 0);
  assert.ok(types().every(t => t === "pan"));
  assert.equal(log.reduce((s, a) => s + a.dx, 0), 30);
});

test("короткое касание — подсказка", () => {
  const { g, log, P } = setup();
  g.down(P(1, "touch", 100, 100, 0));
  g.up(P(1, "touch", 100, 100, 120));
  assert.deepEqual(log, [{ type: "hint", x: 100, y: 100 }]);
});

test("удержание пальца начинает отметку", () => {
  const { g, log, P } = setup();
  g.down(P(1, "touch", 100, 100, 0));
  assert.equal(g.holdDeadline(), 300);
  g.tick(300);
  assert.deepEqual(log[0], { type: "markStart", kind: "touch", x: 100, y: 100 });
  g.move(P(1, "touch", 140, 100, 400));
  assert.deepEqual(log[1], { type: "markMove", x: 140, y: 100 });
  g.up(P(1, "touch", 140, 100, 450));
  assert.deepEqual(log.at(-1), { type: "markEnd" });
  assert.equal(g.holdDeadline(), null);
});

test("до порога удержания ничего", () => {
  const { g, log, P } = setup();
  g.down(P(1, "touch", 100, 100, 0));
  g.tick(299);
  assert.deepEqual(log, []);
});

test("дрожание в пределах 7 px не мешает удержанию", () => {
  const { g, P, types } = setup();
  g.down(P(1, "touch", 100, 100, 0));
  g.move(P(1, "touch", 107, 100, 100));
  g.tick(300);
  assert.equal(types()[0], "markStart");
  assert.ok(!types().includes("pan"));
});

test("сдвиг за порогом — движение, удержание больше не сработает", () => {
  const { g, P, types } = setup();
  g.down(P(1, "touch", 100, 100, 0));
  g.move(P(1, "touch", 109, 100, 100));
  assert.equal(g.holdDeadline(), null);
  g.tick(400);
  assert.ok(!types().includes("markStart"));
  assert.ok(types().includes("pan"));
});

test("Pencil отмечает сразу", () => {
  const { g, log, P } = setup();
  g.down(P(1, "pen", 50, 50, 0));
  assert.deepEqual(log[0], { type: "markStart", kind: "pen", x: 50, y: 50 });
  g.move(P(1, "pen", 70, 50, 10));
  assert.equal(log[1].type, "markMove");
  g.up(P(1, "pen", 70, 50, 20));
  assert.deepEqual(log.at(-1), { type: "markEnd" });
});

test("палец при активном Pencil игнорируется", () => {
  const { g, P, types } = setup();
  g.down(P(1, "pen", 50, 50, 0));
  g.down(P(2, "touch", 300, 300, 5));
  g.move(P(2, "touch", 360, 300, 10));
  g.tick(1000);
  g.up(P(2, "touch", 360, 300, 1100));
  assert.deepEqual(types(), ["markStart"]);
});

test("ладонь раньше Pencil", () => {
  const { g, log, P, types } = setup();
  g.down(P(1, "touch", 300, 300, 0));
  g.tick(300);
  g.down(P(2, "pen", 50, 50, 400));
  assert.deepEqual(types(), ["markStart", "markCancel", "markStart"]);
  assert.equal(log.at(-1).kind, "pen");
  g.move(P(1, "touch", 330, 300, 450));
  assert.equal(log.length, 3);
});

test("второй палец во время отметки откатывает", () => {
  const { g, P, types } = setup();
  g.down(P(1, "touch", 100, 100, 0));
  g.tick(300);
  g.down(P(2, "touch", 200, 100, 350));
  assert.deepEqual(types(), ["markStart", "markCancel"]);
  g.move(P(2, "touch", 220, 100, 360));
  assert.equal(types().at(-1), "pinch");
});

test("два пальца — зум и сдвиг", () => {
  const { g, log, P } = setup();
  g.down(P(1, "touch", 0, 0, 0));
  g.down(P(2, "touch", 100, 0, 10));
  g.move(P(2, "touch", 200, 0, 20));
  let a = log.at(-1);
  assert.equal(a.type, "pinch");
  assert.ok(close(a.scale, 2));
  assert.equal(a.cx, 100);
  assert.equal(a.dx, 50);
  g.move(P(1, "touch", 50, 0, 30));
  a = log.at(-1);
  assert.ok(close(a.scale, 150 / 200));
  assert.equal(a.dx, 25);
  assert.ok(!log.some(x => x.type.startsWith("mark") || x.type === "hint"));
});

test("после зума оставшийся палец ничего не делает", () => {
  const { g, log, P } = setup();
  g.down(P(1, "touch", 0, 0, 0));
  g.down(P(2, "touch", 100, 0, 10));
  g.move(P(2, "touch", 200, 0, 20));
  g.up(P(2, "touch", 200, 0, 30));
  const n = log.length;
  g.move(P(1, "touch", 80, 40, 40));
  g.tick(10000);
  g.up(P(1, "touch", 80, 40, 10001));
  assert.equal(log.length, n);
  g.down(P(3, "touch", 10, 10, 20000));
  assert.equal(g.holdDeadline(), 20300);
});

test("мелкие клетки — удержание приближает", () => {
  const { g, log, P } = setup(k => k !== "touch");
  g.down(P(1, "touch", 100, 100, 0));
  g.tick(300);
  assert.deepEqual(log, [{ type: "zoomTo", x: 100, y: 100 }]);
  g.move(P(1, "touch", 150, 100, 350));
  g.up(P(1, "touch", 150, 100, 400));
  assert.equal(log.length, 1);
});

test("мелкие клетки для Pencil", () => {
  const { g, log, P } = setup(() => false);
  g.down(P(1, "pen", 100, 100, 0));
  assert.deepEqual(log, [{ type: "zoomTo", x: 100, y: 100 }]);
  g.move(P(1, "pen", 150, 100, 10));
  assert.equal(log.length, 1);
});

test("мышь: левая отмечает, правая двигает", () => {
  const { g, log, P } = setup();
  g.down(P(1, "mouse", 10, 10, 0, 0));
  assert.deepEqual(log[0], { type: "markStart", kind: "mouse", x: 10, y: 10 });
  g.up(P(1, "mouse", 10, 10, 5, 0));
  g.down(P(1, "mouse", 10, 10, 100, 2));
  g.move(P(1, "mouse", 40, 20, 110, 2));
  assert.deepEqual(log.at(-1), { type: "pan", dx: 30, dy: 10 });
});

test("hover Pencil игнорируется", () => {
  const { g, log, P } = setup();
  g.move(P(1, "pen", 10, 10, 0));
  g.move(P(1, "pen", 30, 10, 10));
  assert.deepEqual(log, []);
});

test("cancel во время отметки сохраняет ряд", () => {
  const { g, log, P } = setup();
  g.down(P(1, "pen", 10, 10, 0));
  g.move(P(1, "pen", 30, 10, 10));
  g.cancel(P(1, "pen", 30, 10, 20));
  assert.deepEqual(log.at(-1), { type: "markEnd" });
});
