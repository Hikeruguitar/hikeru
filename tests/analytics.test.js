"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const htmlSource = fs.readFileSync(
  path.join(__dirname, "..", "index.html"),
  "utf8"
);

test("匿名アクセス解析のコードを一度だけ読み込む", () => {
  const beaconScripts = htmlSource.match(
    /<script\b[^>]*static\.cloudflareinsights\.com\/beacon\.min\.js[^>]*>/g
  ) || [];

  assert.equal(beaconScripts.length, 1);
  assert.match(beaconScripts[0], /type="module"/);
  assert.match(
    beaconScripts[0],
    /data-cf-beacon='\{"token":"51f983f8a19c4d089b4b0d4045734fe9"\}'/
  );
});
