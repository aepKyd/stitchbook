/* Автомат жестов рабочего экрана. Без DOM: принимает нормализованные указатели
   {id, kind:"touch"|"pen"|"mouse", button, x, y, t} и отдаёт действия через emit.
   Палец: касание двигает, удержание — отметка. Pencil и левая кнопка мыши —
   отметка сразу. Два пальца — зум и сдвиг; начатая отметка откатывается.
   Пока Pencil на экране, пальцы (ладонь) игнорируются; ещё penGraceMs после
   отрыва Pencil удержание пальцем не отмечает и не приближает — ладонь между
   штрихами ложится как раз в это время. */
(function (root) {
  "use strict";

  function create({ emit, canMark, holdMs = 300, slopPx = 8, penGraceMs = 2000 }) {
    const ptrs = new Map();       // учитываемые указатели: id → {kind, x, y}
    const ignored = new Set();    // id, которые до своего up ничего не делают
    let state = "idle";           // idle|pending|panning|marking|pinching|mousePan|done
    let owner = null, ownerKind = null;
    let pend = null;              // {x0, y0, t0} для pending
    let last = null;              // прошлая точка для pan
    let pinch = null;             // {d, cx, cy}
    let lastPenT = -Infinity;     // когда Pencil последний раз оторвался

    const touches = () => [...ptrs.entries()].filter(([, v]) => v.kind === "touch");
    const penDown = () => [...ptrs.values()].some(v => v.kind === "pen");

    function startNow(p) {
      owner = p.id; ownerKind = p.kind;
      if (canMark(p.kind)) { state = "marking"; emit({ type: "markStart", kind: p.kind, x: p.x, y: p.y }); }
      else { state = "done"; emit({ type: "zoomTo", x: p.x, y: p.y }); }
    }
    function pinchGeom() {
      const [[, a], [, b]] = touches();
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }

    function down(p) {
      if (p.kind === "pen") {
        if (penDown() || state === "mousePan" || ownerKind === "mouse" && state === "marking") { ignored.add(p.id); return; }
        if (state === "marking" && ownerKind === "touch") emit({ type: "markCancel" });
        for (const [id] of touches()) { ptrs.delete(id); ignored.add(id); }
        ptrs.set(p.id, { kind: p.kind, x: p.x, y: p.y });
        startNow(p);
        return;
      }
      if (p.kind === "touch" && penDown()) { ignored.add(p.id); return; }
      if (p.kind === "mouse") {
        if (state !== "idle") { ignored.add(p.id); return; }
        ptrs.set(p.id, { kind: p.kind, x: p.x, y: p.y });
        if (p.button === 0) startNow(p);
        else { state = "mousePan"; owner = p.id; ownerKind = "mouse"; last = { x: p.x, y: p.y }; }
        return;
      }
      // палец. Первичное касание значит, что других пальцев на экране нет:
      // записи о них остались от потерянного up — выбрасываем
      if (p.primary && touches().length) dropTouches();
      const n = touches().length;
      if (n >= 2 || ptrs.size > n) { ignored.add(p.id); return; }   // третий палец или идёт жест мыши
      ptrs.set(p.id, { kind: p.kind, x: p.x, y: p.y });
      if (n === 0) {
        state = "pending"; owner = p.id; ownerKind = "touch";
        pend = { x0: p.x, y0: p.y, t0: p.t, noHold: p.t - lastPenT < penGraceMs }; last = { x: p.x, y: p.y };
        return;
      }
      if (state === "marking") emit({ type: "markCancel" });
      state = "pinching"; pend = null;
      pinch = pinchGeom();
    }

    function move(p) {
      if (ignored.has(p.id) || !ptrs.has(p.id)) return;
      const v = ptrs.get(p.id); v.x = p.x; v.y = p.y;
      switch (state) {
        case "pending":
          if (Math.hypot(p.x - pend.x0, p.y - pend.y0) > slopPx) { state = "panning"; pend = null; panTo(p); }
          break;
        case "panning": case "mousePan":
          panTo(p); break;
        case "marking":
          if (p.id === owner) emit({ type: "markMove", x: p.x, y: p.y });
          break;
        case "pinching": {
          const g = pinchGeom();
          emit({ type: "pinch", scale: g.d / pinch.d, cx: g.cx, cy: g.cy, dx: g.cx - pinch.cx, dy: g.cy - pinch.cy });
          pinch = g;
          break;
        }
      }
    }
    function panTo(p) {
      emit({ type: "pan", dx: p.x - last.x, dy: p.y - last.y });
      last = { x: p.x, y: p.y };
    }

    function finish(p, hint) {
      if (ignored.delete(p.id) || !ptrs.has(p.id)) return;
      if (ptrs.get(p.id).kind === "pen") lastPenT = p.t;
      ptrs.delete(p.id);
      switch (state) {
        case "pending":
          if (hint && !pend.noHold) emit({ type: "hint", x: p.x, y: p.y });
          state = "idle"; break;
        case "marking":
          // отмена пальца — это iOS отбраковал ладонь: отметку не сохраняем
          if (p.id === owner) { emit({ type: !hint && ownerKind === "touch" ? "markCancel" : "markEnd" }); state = "idle"; }
          break;
        case "panning": case "mousePan":
          state = "idle"; break;
        case "pinching":
          state = "done"; break;
      }
      if (ptrs.size === 0) clear();
    }
    function clear() { state = "idle"; owner = ownerKind = null; pend = pinch = null; }
    function dropTouches() {
      if (state === "marking" && ownerKind === "touch") emit({ type: "markCancel" });
      for (const [id] of touches()) ptrs.delete(id);
      if (ptrs.size === 0) clear();
    }

    function tick(t) {
      if (state !== "pending" || pend.noHold || t - pend.t0 < holdMs) return;
      const v = ptrs.get(owner);
      pend = null;
      startNow({ id: owner, kind: "touch", x: v.x, y: v.y });
    }

    return {
      down, move, tick,
      up: p => finish(p, true),
      cancel: p => finish(p, false),
      holdDeadline: () => state === "pending" && !pend.noHold ? pend.t0 + holdMs : null,
      // экран скрыт или открыта другая схема: забыть все указатели
      reset() {
        if (state === "marking") emit({ type: "markCancel" });
        ptrs.clear(); ignored.clear(); clear();
      }
    };
  }

  const api = { create };
  root.Gestures = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
