# Отметка крестиков на iPad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pencil отмечает сразу, палец — удержанием, одно касание пальцем двигает, два пальца — зум+сдвиг с откатом начатой отметки; режимы «Шить/✥» убраны.

**Architecture:** Новый чистый модуль `gestures.js` (UMD, как `stitchfile.js`) — автомат, который принимает нормализованные указатели и отдаёт действия. `index.html` — тонкий адаптер: переводит pointer-события в вызовы автомата и исполняет действия над `S.view`/`S.done`.

**Tech Stack:** ванильный JS в одном `index.html`, Pointer Events, `node --test` без зависимостей.

**Spec:** `openspec/changes/ipad-marking/specs/chart-marking/spec.md`, `openspec/changes/ipad-marking/design.md`

## Global Constraints

- Без сборки и зависимостей; новый файл подключается `<script src="gestures.js"></script>` перед основным `<script>` и добавляется в `ASSETS` в `sw.js`; `VERSION` → `"stitchbook-v3"`.
- Пороги: `holdMs = 300`, `slopPx = 8`; `canMark`: `S.view.s >= 14` для `touch`, `>= 6` для `pen` и `mouse`; `zoomTo` — масштаб 22 px на клетку.
- Тексты: подсказка ровно `Удерживайте палец, чтобы отметить`.
- Тесты: `node --test tests/*.test.js`.

## Review Focus

1. Ладонь легла раньше Pencil и успела по удержанию начать отметку → касание Pencil откатывает её (`markCancel`) и начинает свою. Тест: Task 1 `ладонь раньше Pencil`.
2. Медленный свайп пальцем, который за 300 мс сдвинулся меньше чем на 8 px, а потом поехал → не должен превращаться в отметку после того, как уже стал движением. Тест: Task 1 `сдвиг за порогом — движение, удержание больше не сработает`.
3. Конец зума: один палец поднят, второй ещё на экране → не двигает и не отмечает. Тест: Task 1 `после зума оставшийся палец ничего не делает`.
4. Pencil парит над экраном (hover) → pointermove без касания не отмечает. Тест: Task 1 `hover Pencil игнорируется`.
5. Удержание на пропущенной клетке или на клетке чужой нитки, затем ведение на нужные → значение задаёт первая изменяемая клетка. Проверка: Task 2, шаг браузерной проверки (d).

---

### Task 1: Автомат жестов `gestures.js`

**Files:**
- Create: `gestures.js`
- Test: `tests/gestures.test.js`

**Interfaces:**
- Produces:
  - `Gestures.create({emit, canMark, holdMs = 300, slopPx = 8}) → g`
    - `emit(action)` — колбэк; `canMark(kind: "touch"|"pen"|"mouse") → boolean`
  - `g.down(p)`, `g.move(p)`, `g.up(p)`, `g.cancel(p)`, где `p = {id, kind, button, x, y, t}` (`x,y` — clientX/Y, `t` — мс)
  - `g.tick(t)` — проверить удержание на момент `t`
  - `g.holdDeadline() → number|null` — время, когда истечёт удержание текущего `pending`, иначе `null`
  - Действия: `{type:"pan",dx,dy}`, `{type:"pinch",scale,cx,cy,dx,dy}` (scale и dx/dy — приращения с прошлого pinch; применять: сдвиг на dx,dy, затем масштаб scale вокруг cx,cy), `{type:"markStart",kind,x,y}`, `{type:"markMove",x,y}`, `{type:"markEnd"}`, `{type:"markCancel"}`, `{type:"zoomTo",x,y}`, `{type:"hint",x,y}`
  - Экспорт: `self.Gestures` в браузере, `module.exports` в node.

Поведение — по состояниям из `design.md` (`idle/pending/panning/marking/pinching/mousePan/done`) плюс:
- `pen` down в любом состоянии от `touch`: если `marking` от пальца → `markCancel`; все текущие `touch`-указатели становятся игнорируемыми до их `up`; новые `touch` во время активного `pen` игнорируются.
- Третий и следующие пальцы игнорируются.
- `cancel(p)` в `marking` → `markEnd`; в остальных — как `up`, но без `hint`.
- `move` для указателя, который не был `down` (hover) — ничего.
- Мышь: `button 0` → сразу `marking` (или `zoomTo` + `done`, если `canMark("mouse")` ложно); `button 1|2` → `mousePan`, выдаёт `pan`.

- [ ] **Step 1: Write the failing tests** — `tests/gestures.test.js`, хелперы:

```js
const { create } = require("../gestures.js");
function setup(canMark = () => true) {
  const log = []; const g = create({ emit: a => log.push(a), canMark });
  const P = (id, kind, x, y, t, button = 0) => ({ id, kind, x, y, t, button });
  const types = () => log.map(a => a.type);
  return { g, log, P, types };
}
```

Тесты (имя → действия → ожидание):
- `свайп пальцем двигает и не отмечает`: down touch (100,100,t0) → move (130,100,t50) → up → `types()` содержит только `"pan"`, сумма `dx` = 30.
- `короткое касание — подсказка`: down (100,100,0) → up (100,100,120) → `log` = `[{type:"hint",x:100,y:100}]`.
- `удержание пальца начинает отметку`: down (0) → `holdDeadline()` = 300 → `tick(300)` → `log[0]` = `{type:"markStart",kind:"touch",x:100,y:100}` → move (140,100) → `markMove` → up → последний `markEnd`.
- `до порога удержания ничего`: down (0) → `tick(299)` → `log` пуст.
- `дрожание в пределах 7 px не мешает удержанию`: down (100,100,0) → move (107,100,100) → `tick(300)` → `markStart`; `pan` нет.
- `сдвиг за порогом — движение, удержание больше не сработает`: down (100,100,0) → move (109,100,100) → `holdDeadline()` = null → `tick(400)` → нет `markStart`; есть `pan`.
- `Pencil отмечает сразу`: down pen (50,50,0) → `log[0]` = `{type:"markStart",kind:"pen",x:50,y:50}` без `tick`; move → `markMove`; up → `markEnd`.
- `палец при активном Pencil игнорируется`: down pen → down touch id2 → move touch → up touch → в `log` только `markStart` от pen.
- `ладонь раньше Pencil`: down touch (0) → `tick(300)` → `markStart` touch → down pen → `types()` = `["markStart","markCancel","markStart"]`, последний `kind:"pen"`; дальнейший move touch ничего не даёт.
- `второй палец во время отметки откатывает`: down touch id1 → `tick(300)` → down touch id2 → `markCancel`; move id2 → `pinch`.
- `два пальца — зум и сдвиг`: down id1 (0,0) → down id2 (100,0) → move id2 (200,0) → `pinch` с `scale` = 2, `cx` = 100, `dx` = 50; move id1 (50,0) → `pinch` (scale = 150/200, dx = 25).
- `после зума оставшийся палец ничего не делает`: pinch как выше → up id2 → move id1 → `log` без новых действий; `tick(10000)` — ничего; up id1 → новый down работает как `idle`.
- `мелкие клетки — удержание приближает`: `setup(k => k !== "touch")`; down touch → `tick(300)` → `[{type:"zoomTo",x,y}]`; move/up → ничего нового.
- `мелкие клетки для Pencil`: `setup(() => false)`; down pen → `zoomTo`; move → ничего.
- `мышь: левая отмечает, правая двигает`: down mouse button 0 → `markStart kind:"mouse"`; up; down mouse button 2 → move → `pan`.
- `hover Pencil игнорируется`: move pen без down → `log` пуст.
- `cancel во время отметки сохраняет ряд`: pen down → move → `cancel` → последний `markEnd`.

- [ ] **Step 2: Run tests — expect FAIL** (`Cannot find module '../gestures.js'`)

Run: `node --test tests/*.test.js`

- [ ] **Step 3: Implement `gestures.js`** — автомат по интерфейсу выше; хранит `Map` активных указателей, состояние, «владельца» жеста и множество игнорируемых `touch`. Расстояние и середина pinch считаются по двум первым пальцам; `scale` = новое расстояние / прошлое.

- [ ] **Step 4: Run tests — expect PASS** (все, включая 13 старых из `stitchfile.test.js`)

Run: `node --test tests/*.test.js`

- [ ] **Step 5: Commit**

```bash
git add gestures.js tests/gestures.test.js
git commit -m "Автомат жестов: удержание пальцем, Pencil сразу, защита от ладони (#2)"
```

---

### Task 2: Адаптер в `index.html`, удаление режимов

**Files:**
- Modify: `index.html` — разметка `.tools` (кнопки `#mStitch`, `#mPan`), CSS `#chart`, блок `/* --- жесты --- */` (pointer-обработчики, `paint`), обработчики `#mStitch/#mPan`, `S.mode`, `openWork` (сброс флага подсказки)
- Modify: `sw.js` — `ASSETS` += `"gestures.js"`, `VERSION = "stitchbook-v3"`
- Modify: `README.md` — раздел «Что внутри»: строка про жесты (Pencil сразу, палец удержанием, два пальца — зум)

**Interfaces:**
- Consumes: `Gestures.create`, `g.down/move/up/cancel/tick/holdDeadline`, действия Task 1.

Требования к адаптеру:
- `p` из события: `{id:e.pointerId, kind:e.pointerType==="pen"?"pen":e.pointerType==="mouse"?"mouse":"touch", button:e.button, x:e.clientX, y:e.clientY, t:e.timeStamp}`; `tick` вызывается с `performance.now()`.
- После каждого `down`/`move`: если `g.holdDeadline()` не `null` — перепланировать один `setTimeout` на этот момент; иначе снять таймер.
- `markStart`: снимок `S.done.slice()`, `stroke = {val:null, cells:new Set(), snapshot, start:{x,y}}`; значение `val` задаёт первая клетка, которую `paint` действительно может изменить (не `skip`, и при `S.sel>=0` — `S.grid[i]===S.sel`): `val = S.done[i] ? 0 : 1`.
- `markMove`: `paint(cellAt)` для точки (с текущей логикой фильтров).
- `markEnd`: как текущий `pointerup` со `stroke` (в `S.undo` — только если `cells.size`).
- `markCancel`: `S.done = stroke.snapshot`, `stroke = null`, `draw()`, в `S.undo` не писать.
- Пока `stroke` есть — в `draw()` рамка `2px` цвета `#ffd23f` (`--marker`) вокруг стартовой клетки.
- `pan`/`pinch`/`zoomTo` — изменение `S.view` и `draw()`; `zoomTo`: `ns = 22`, точка `(x,y)` остаётся на месте.
- `hint`: если под точкой есть клетка и в этом открытии схемы подсказки не было → `toast("Удерживайте палец, чтобы отметить")`.
- `canMark(kind)`: `S.view.s >= (kind === "touch" ? 14 : 6)`.
- `#chart`: `contextmenu` → `preventDefault()`; CSS `-webkit-touch-callout:none; -webkit-user-select:none; user-select:none`.
- Удалить `#mStitch`, `#mPan`, их `onclick`, `S.mode` и все проверки `S.mode`.

- [ ] **Step 1: Подключить `gestures.js`, заменить обработчики, удалить режимы, обновить `sw.js` и README** по требованиям выше.

- [ ] **Step 2: Юнит-тесты не сломаны**

Run: `node --test tests/*.test.js` — Expected: все PASS.

- [ ] **Step 3: Браузерная проверка (Playwright).** `python3 -m http.server` из worktree; собрать схему из сгенерированной картинки (как в PR #4); события слать `cv.dispatchEvent(new PointerEvent(type,{pointerId,pointerType,clientX,clientY,button,bubbles:true}))` и ждать таймер удержания через `await new Promise(r=>setTimeout(r,350))`. Ожидания:
  - (a) touch down → move 60 px → up: `S.done` без изменений, `S.view.ox` сдвинулся на 60;
  - (b) touch down → ждать 350 мс → move через 3 клетки → up: отмечены 4 клетки, `S.undo.length` +1; «↶» возвращает все 4;
  - (c) touch down → 350 мс → второй touch down: `S.done` равен снимку до жеста, `S.undo.length` не изменился;
  - (d) выбрать нитку (`S.sel`), удержание на клетке другого цвета → ведение на клетки выбранной нитки: они отмечены, остальные нет;
  - (e) pen down → move → up: клетки отмечены без ожидания; touch во время pen ничего не меняет;
  - (f) после `fitView()` на схеме, где `S.view.s < 14`: удержание пальцем → `S.view.s === 22`, `S.done` без изменений;
  - (g) короткий touch → toast с текстом подсказки, второй короткий touch → toast не появился заново;
  - (h) кнопок `#mStitch`, `#mPan` нет в DOM; ошибок в консоли нет.

- [ ] **Step 4: Commit**

```bash
git add index.html sw.js README.md
git commit -m "Рабочий экран на автомате жестов, режимы «Шить/✥» убраны (#2)"
```
