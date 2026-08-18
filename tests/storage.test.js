"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const appSource = fs
  .readFileSync(
    path.join(__dirname, "..", "app.js"),
    "utf8"
  )
  .replace(/\r?\nstart\(\);\s*$/, "");

function makeDomNode() {
  return {
    checked: false,
    classList: {
      add() {},
      contains() { return false; },
      remove() {},
      toggle() {}
    },
    disabled: false,
    innerHTML: "",
    style: {},
    textContent: "",
    value: "",
    addEventListener() {},
    appendChild() {},
    close() {},
    querySelector() { return makeDomNode(); },
    querySelectorAll() { return []; },
    scrollTo() {},
    setAttribute() {},
    showModal() {}
  };
}

function makeRuntime(initialValues = {}, options = {}) {
  const values = new Map(
    Object.entries(initialValues)
  );

  const localStorage = {
    getItem(key) {
      if (options.throwOnRead) {
        throw new Error("storage read blocked");
      }

      return values.has(key)
        ? values.get(key)
        : null;
    },
    setItem(key, value) {
      if (options.throwOnWrite) {
        throw new Error("storage write blocked");
      }

      values.set(key, String(value));
    }
  };

  const immediateTimeout = callback => {
    callback();
    return 1;
  };

  const context = vm.createContext({
    clearInterval() {},
    clearTimeout() {},
    console: {
      error() {},
      log() {},
      warn() {}
    },
    document: {
      body: makeDomNode(),
      createElement: makeDomNode,
      createElementNS: makeDomNode,
      documentElement: makeDomNode(),
      getElementById: makeDomNode,
      querySelector: makeDomNode,
      querySelectorAll() { return []; }
    },
    localStorage,
    navigator: {
      maxTouchPoints: 0
    },
    requestAnimationFrame() { return 1; },
    setInterval() { return 1; },
    setTimeout: immediateTimeout,
    window: {
      addEventListener() {},
      crypto: {
        randomUUID() { return "generated-id"; }
      },
      matchMedia() {
        return { matches: false };
      },
      setTimeout: immediateTimeout
    }
  });

  vm.runInContext(appSource, context);

  return {
    evaluate(code) {
      return vm.runInContext(code, context);
    },
    values
  };
}

function savedScore(id, bpm = 120) {
  return JSON.stringify({
    bpm,
    score: {
      measures: [
        [
          {
            id,
            kind: "note",
            duration: "quarter"
          }
        ],
        []
      ],
      relations: {
        slurs: [],
        ties: [],
        tuplets: []
      }
    }
  });
}

test("保存場所が使えなくてもアプリの処理を止めない", () => {
  const runtime = makeRuntime(
    {},
    {
      throwOnRead: true,
      throwOnWrite: true
    }
  );

  assert.equal(
    runtime.evaluate("restoreState()"),
    false
  );
  assert.equal(
    runtime.evaluate("saveState()"),
    false
  );
});

test("現行データが壊れている場合は旧データを復元する", () => {
  const runtime = makeRuntime({
    "kikutab.ver0.1.score": "{broken",
    "hikeru.ver0.1.score": JSON.stringify({
      bpm: 88,
      measures: [
        [
          {
            beats: 1,
            id: "legacy-note",
            kind: "note"
          }
        ],
        []
      ]
    })
  });

  assert.equal(runtime.evaluate("restoreState()"), true);
  assert.equal(runtime.evaluate("state.bpm"), 88);
  assert.equal(
    runtime.evaluate("state.score.measures[0][0].duration"),
    "quarter"
  );
  assert.equal(
    JSON.parse(
      runtime.values.get("kikutab.ver0.1.score")
    ).score.measures[0][0].id,
    "legacy-note"
  );
});

test("正常な現行データがある場合は旧データで上書きしない", () => {
  const runtime = makeRuntime({
    "kikutab.ver0.1.score": savedScore("current-note", 150),
    "hikeru.ver0.1.score": savedScore("legacy-note", 80)
  });

  assert.equal(runtime.evaluate("restoreState()"), true);
  assert.equal(runtime.evaluate("state.bpm"), 150);
  assert.equal(
    runtime.evaluate("state.score.measures[0][0].id"),
    "current-note"
  );
});

test("空の譜面でもBPMは復元する", () => {
  const runtime = makeRuntime({
    "kikutab.ver0.1.score": JSON.stringify({
      bpm: 96,
      score: {
        measures: [[], []],
        relations: {
          slurs: [],
          ties: [],
          tuplets: []
        }
      }
    })
  });

  assert.equal(runtime.evaluate("restoreState()"), false);
  assert.equal(runtime.evaluate("state.bpm"), 96);
});

test("入力欄が表示範囲内なら画面を動かさない", () => {
  const runtime = makeRuntime();

  assert.equal(
    runtime.evaluate(
      "calculateRevealScrollDelta(120, 166, 12, 488)"
    ),
    0
  );
});

test("入力欄の下がキーボードに隠れた分だけ移動する", () => {
  const runtime = makeRuntime();

  assert.equal(
    runtime.evaluate(
      "calculateRevealScrollDelta(442, 520, 12, 488)"
    ),
    32
  );
});

test("固定表示に隠れた入力欄を下へ戻す", () => {
  const runtime = makeRuntime();

  assert.equal(
    runtime.evaluate(
      "calculateRevealScrollDelta(180, 226, 210, 488)"
    ),
    -30
  );
});
