"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const htmlSource = fs.readFileSync(
  path.join(__dirname, "index.html"),
  "utf8"
);

const scriptSource = fs.readFileSync(
  path.join(__dirname, "prototype.js"),
  "utf8"
);

class MockClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach(name => this.values.add(name));
  }

  remove(...names) {
    names.forEach(name => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    if (force === undefined) {
      force = !this.values.has(name);
    }

    if (force) {
      this.values.add(name);
    } else {
      this.values.delete(name);
    }

    return force;
  }
}

class MockNode {
  constructor() {
    this.attributes = new Map();
    this.childMap = new Map();
    this.children = [];
    this.classList = new MockClassList();
    this.dataset = {};
    this.disabled = false;
    this.listeners = new Map();
    this.scrollLeft = 0;
    this.clientWidth = 390;
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(name, value)
    };
    this.textContent = "";
  }

  set innerHTML(value) {
    this.children = [];
    this.textContent = value;
  }

  get innerHTML() {
    return this.textContent;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  appendChild(node) {
    this.children.push(node);
    return node;
  }

  click() {
    if (this.disabled) {
      return;
    }

    (this.listeners.get("click") || []).forEach(listener => listener({ target: this }));
  }

  querySelector(selector) {
    return this.childMap.get(selector) || null;
  }

  scrollTo(options) {
    this.scrollLeft = Number(options?.left) || 0;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

function makeDataNodes(values, key) {
  return values.map(value => {
    const node = new MockNode();
    node.dataset[key] = String(value);
    return node;
  });
}

function makeRuntime() {
  const ids = [
    ...htmlSource.matchAll(/\bid="([^"]+)"/g)
  ].map(match => match[1]);

  const nodesById = new Map(
    ids.map(id => [id, new MockNode()])
  );

  const stepMarkers = makeDataNodes(
    ["duration", "string", "fret"],
    "stepMarker"
  );

  const kindButtons = makeDataNodes(
    ["note", "rest"],
    "kind"
  );

  const durationButtons = makeDataNodes(
    ["whole", "half", "quarter", "eighth", "sixteenth"],
    "duration"
  );

  durationButtons.forEach(button => {
    button.childMap.set(".duration-symbol", new MockNode());
    button.childMap.set("b", new MockNode());
    button.childMap.set("small", new MockNode());
  });

  const stringButtons = makeDataNodes([1, 2, 3, 4, 5, 6], "string");
  const digitButtons = makeDataNodes([1, 2, 3, 4, 5, 6, 7, 8, 9, 0], "digit");
  const timerCallbacks = new Map();
  let timerCounter = 0;

  const selectorMap = new Map([
    ["[data-step-marker]", stepMarkers],
    ["[data-kind]", kindButtons],
    ["[data-duration]", durationButtons],
    ["[data-string]", stringButtons],
    ["[data-digit]", digitButtons]
  ]);

  const document = {
    createElement() {
      return new MockNode();
    },
    getElementById(id) {
      return nodesById.get(id) || null;
    },
    querySelectorAll(selector) {
      return selectorMap.get(selector) || [];
    }
  };

  const window = {
    AudioContext: null,
    clearTimeout(id) {
      timerCallbacks.delete(id);
    },
    setTimeout(callback) {
      timerCounter += 1;
      timerCallbacks.set(timerCounter, callback);
      return timerCounter;
    }
  };

  const context = vm.createContext({
    console,
    document,
    window
  });

  vm.runInContext(scriptSource, context);

  return {
    digitButtons,
    durationButtons,
    kindButtons,
    nodesById,
    scoreNotes: nodesById.get("score-notes"),
    stringButtons,
    state() {
      return window.KIKUtabPrototype.getState();
    }
  };
}

function findDataNode(nodes, key, value) {
  return nodes.find(node => node.dataset[key] === String(value));
}

test("音価からTAB決定まで段階的に入力できる", () => {
  const runtime = makeRuntime();

  findDataNode(runtime.durationButtons, "duration", "quarter").click();
  assert.equal(runtime.state().step, "string");
  assert.equal(runtime.state().items.length, 1);

  findDataNode(runtime.stringButtons, "string", 3).click();
  assert.equal(runtime.state().step, "fret");

  findDataNode(runtime.digitButtons, "digit", 5).click();
  runtime.nodesById.get("confirm-fret-button").click();

  assert.equal(runtime.state().step, "duration");
  assert.equal(runtime.state().items[0].string, 3);
  assert.equal(runtime.state().items[0].fret, 5);
});

test("休符、Undo、Redo、既存TAB編集、削除を操作できる", () => {
  const runtime = makeRuntime();

  findDataNode(runtime.durationButtons, "duration", "quarter").click();
  findDataNode(runtime.stringButtons, "string", 3).click();
  findDataNode(runtime.digitButtons, "digit", 5).click();
  runtime.nodesById.get("confirm-fret-button").click();

  findDataNode(runtime.kindButtons, "kind", "rest").click();
  findDataNode(runtime.durationButtons, "duration", "eighth").click();
  assert.equal(runtime.state().items[1].kind, "rest");

  runtime.nodesById.get("undo-button").click();
  assert.equal(runtime.state().items.length, 1);

  runtime.nodesById.get("redo-button").click();
  assert.equal(runtime.state().items.length, 2);

  runtime.scoreNotes.children[0].click();
  runtime.nodesById.get("edit-tab-button").click();
  findDataNode(runtime.stringButtons, "string", 2).click();
  findDataNode(runtime.digitButtons, "digit", 1).click();
  findDataNode(runtime.digitButtons, "digit", 2).click();
  runtime.nodesById.get("confirm-fret-button").click();

  assert.equal(runtime.state().items[0].string, 2);
  assert.equal(runtime.state().items[0].fret, 12);

  runtime.scoreNotes.children[0].click();
  runtime.nodesById.get("delete-note-button").click();
  assert.equal(runtime.state().items.length, 1);
  assert.equal(runtime.state().items[0].kind, "rest");
});

test("再生状態、ループ、速度を操作できる", () => {
  const runtime = makeRuntime();

  findDataNode(runtime.kindButtons, "kind", "rest").click();
  findDataNode(runtime.durationButtons, "duration", "quarter").click();

  runtime.nodesById.get("loop-button").click();
  runtime.nodesById.get("speed-button").click();
  runtime.nodesById.get("play-button").click();

  assert.equal(runtime.state().loop, true);
  assert.equal(runtime.state().speed, 1.25);
  assert.equal(runtime.state().playing, true);

  runtime.nodesById.get("play-button").click();
  assert.equal(runtime.state().playing, false);
});

test("2小節を超える入力を受け付けない", () => {
  const runtime = makeRuntime();

  findDataNode(runtime.kindButtons, "kind", "rest").click();
  findDataNode(runtime.durationButtons, "duration", "whole").click();
  findDataNode(runtime.durationButtons, "duration", "whole").click();

  assert.equal(runtime.state().items.length, 2);
  assert.equal(
    findDataNode(runtime.durationButtons, "duration", "quarter").disabled,
    true
  );

  findDataNode(runtime.durationButtons, "duration", "whole").click();
  assert.equal(runtime.state().items.length, 2);
});
