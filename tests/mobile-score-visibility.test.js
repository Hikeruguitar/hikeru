"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const cssSource = fs.readFileSync(
  path.join(__dirname, "..", "style.css"),
  "utf8"
);

test("フレット入力中も譜面を非表示にしない", () => {
  const hiddenFocusedSelectors = [
    ...cssSource.matchAll(/([^{}]+)\{([^{}]*)\}/g)
  ]
    .filter(([, selector, body]) => (
      selector.includes("is-fret-input-focused")
      && body.includes("visibility: hidden")
    ))
    .map(([, selector]) => selector)
    .join("\n");

  assert.match(hiddenFocusedSelectors, /\.input-tabs/);
  assert.match(hiddenFocusedSelectors, /\.playback-panel/);
  assert.doesNotMatch(hiddenFocusedSelectors, /\.score-sticky/);
});
