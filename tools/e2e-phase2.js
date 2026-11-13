#!/usr/bin/env node
/*
 * ver 3.0 Phase 2 のブラウザ自動確認（Playwright）
 *   node tools/e2e-phase2.js [--shots <dir>]
 * - トゥルーエンドまで通し、各ページの背景・立ち絵・光輪を確認（仮の絵を返すサーバ／実ファイルだけのサーバ）
 * - シーンの enter（boss=shake／sacrifice・end_true=flash）と段落の fx（sacrifice の flash）が実行される
 * - 段落の bg（end_true で hand_holding → tower_foot）
 * - 設定の演出オフ／prefers-reduced-motion では揺れ・フラッシュが出ない
 * - 素材が無くてもスクリプトエラーなく最後まで進む。localStorage に既存 5 件以外のキーを作らない
 */
"use strict";

var assert = require("assert");
var path = require("path");
var fs = require("fs");
var createServer = require("./preview-server.js").createServer;

var KEYS = ["chrono-tale-auto-v1", "chrono-tale-saves-v1", "chrono-tale-settings-v1", "chrono-tale-endings-v1", "chrono-tale-read-v1"];
var shotsDir = process.argv.indexOf("--shots") !== -1 ? process.argv[process.argv.indexOf("--shots") + 1] : null;
var checks = 0;
function same(a, b, msg) {
  checks += 1;
  assert.deepStrictEqual(a, b, msg);
}
function ok(c, msg) {
  checks += 1;
  assert.ok(c, msg);
}

function listen(server) {
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () {
      resolve("http://127.0.0.1:" + server.address().port + "/");
    });
  });
}

// アニメーションの開始を記録する（揺れ・フラッシュが実際に走ったかを見る）
function installProbe() {
  window.__anims = [];
  document.addEventListener(
    "animationstart",
    function (e) {
      window.__anims.push(e.animationName);
    },
    true
  );
}

async function open(browser, url, opts) {
  opts = opts || {};
  var context = await browser.newContext({
    viewport: opts.viewport || { width: 1366, height: 768 },
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference"
  });
  await context.addInitScript(installProbe);
  var page = await context.newPage();
  page.errors = [];
  page.on("pageerror", function (e) {
    page.errors.push(String(e));
  });
  await page.goto(url);
  await page.evaluate(function (settings) {
    window.localStorage.clear();
    window.localStorage.setItem("chrono-tale-settings-v1", JSON.stringify(settings));
  }, Object.assign({ textSpeed: 3, skipRead: false, volume: 0.6, muted: true, images: true }, opts.settings || {}));
  await page.reload();
  await page.waitForSelector("#title-screen:not([hidden])");
  return page;
}

function view(page) {
  return page.evaluate(function () {
    var layer = document.querySelector("#bg-layer .bg-img.is-active");
    var c = document.querySelector("#char-layer .chara.is-active");
    var halo = c && c.querySelector(".chara-halo");
    var anims = window.__anims.slice();
    window.__anims.length = 0;
    return {
      title: document.getElementById("scene-title").textContent,
      text: document.getElementById("scene-text").textContent,
      count: document.getElementById("page-count").textContent,
      bg: layer ? layer.style.backgroundImage.replace(/^url\("?|"?\)$/g, "").split("/").pop() : null,
      chara: c ? (c.querySelector("img").getAttribute("src") || "").split("/").pop().replace(/\.webp$/, "") : null,
      halo: halo ? halo.getAttribute("data-state") : null,
      haloOpacity: halo ? Number(getComputedStyle(halo).opacity) : null,
      anims: anims
    };
  });
}

async function settle(page) {
  await page.waitForFunction(function () {
    var imgs = document.querySelectorAll("#char-layer .chara img");
    return Array.prototype.every.call(imgs, function (i) { return !i.getAttribute("src") || i.complete; });
  });
  await page.waitForTimeout(350); // 画像の読み込み・入れ替えが落ち着くのを待つ
}

/** 選択肢（またはエンディング）が出るまで読み進め、各ページの画面状態を返す */
async function readScene(page, onPage) {
  var seen = [];
  for (;;) {
    await settle(page);
    var v = await view(page);
    seen.push(v);
    if (onPage) await onPage(v, seen.length - 1);
    var m = /^(\d+) \/ (\d+)$/.exec(v.count);
    if (!m || m[1] === m[2]) break;
    await page.keyboard.press("Enter");
    await page.waitForFunction(function (b) {
      return document.getElementById("page-count").textContent !== b;
    }, v.count);
  }
  return seen;
}

async function choose(page, text) {
  await page.waitForSelector("#choice-overlay:not([hidden]):not(.is-locked)");
  var before = await page.evaluate(function () {
    return document.getElementById("scene-title").textContent;
  });
  await page.locator("#choices .choice", { hasText: text }).first().click();
  await page.waitForFunction(function (b) {
    return document.getElementById("scene-title").textContent !== b && document.getElementById("choice-overlay").hidden;
  }, before);
}

// トゥルーエンドへの経路（寄り道 3 つを全部通る）：[シーン ID, 選ぶ選択肢の一部]
var ROUTE = [
  ["awakening", "花びらに、そっと触れてみる"],
  ["meet", "大丈夫？"],
  ["explain", "一緒に欠片を探そう"],
  ["village", "パン屋の店先"],
  ["bakery", "硬貨を置いて"],
  ["forest", "身を盾にする"],
  ["campfire", "丸パンを半分に割って"],
  ["river", "渡し舟を調べてみる"],
  ["boat", "川の上を歩いて渡る"],
  ["mirror", "進めたいと思える"],
  ["ruins", "望む。"],
  ["night", "懐のオルゴール"],
  ["melody", "一緒に口ずさむ"],
  ["boss", "止まってしまえと願ったのは"],
  ["sacrifice", "だめだ！"],
  ["end_true", null]
];

async function playRoute(page, onPage) {
  var out = {};
  await page.click("#start-btn");
  for (var i = 0; i < ROUTE.length; i++) {
    var id = ROUTE[i][0];
    out[id] = await readScene(page, onPage ? onPage.bind(null, id) : null);
    if (ROUTE[i][1]) await choose(page, ROUTE[i][1]);
  }
  return out;
}

function col(list, key) {
  return list.map(function (v) {
    return v[key];
  });
}
function allAnims(list) {
  return list.reduce(function (a, v) {
    return a.concat(v.anims);
  }, []);
}
function has(list, name) {
  return list.indexOf(name) !== -1;
}

async function run(browser) {
  var artUrl = await listen(createServer({ placeholders: true }));
  var realUrl = await listen(createServer({}));

  // ---- 1. 仮の絵つき：舞台割り当てと演出 ----
  var page = await open(browser, artUrl);
  var r = await playRoute(page, async function (id, v, i) {
    if (!shotsDir) return;
    var want = { "forest:2": 1, "night:2": 1, "sacrifice:3": 1, "end_true:8": 1, "end_true:9": 1 };
    if (want[id + ":" + i]) {
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(shotsDir, id + "-p" + (i + 1) + "-1366x768.jpg"), type: "jpeg", quality: 80 });
    }
  });
  same(col(r.awakening, "bg"), ["awakening.jpg", "awakening.jpg", "awakening.jpg", "awakening.jpg"]);
  same(col(r.awakening, "chara"), [null, null, null, null]);
  same(col(r.village, "bg"), ["village_plaza.webp", "village_plaza.webp", "village_plaza.webp"]);
  same(col(r.village, "chara"), [null, "stand_normal", "stand_sad"]);
  same(col(r.bakery, "chara"), [null, null, "stand_smile", "stand_smile"]);
  same(col(r.bakery, "bg")[0], "bakery.jpg");
  same(col(r.forest, "chara"), ["stand_normal", "stand_surprised", "stand_surprised"]);
  same(col(r.forest, "halo"), ["weak", "flicker", "flicker"]);
  same(col(r.campfire, "chara"), ["stand_sad", "sit_down", "sit_down"]);
  same(col(r.river, "chara"), ["stand_smile", "stand_normal", "stand_normal", "stand_normal"]);
  same(col(r.river, "bg")[0], "river.jpg");
  same(col(r.boat, "chara"), [null, null, "stand_normal", "stand_normal"]);
  same(col(r.mirror, "chara"), [null, null, null, "stand_sad"]);
  same(col(r.ruins, "chara"), ["stand_normal", "stand_normal", "stand_normal"]);
  same(col(r.night, "chara"), ["sit_down", "sit_down", "sit_down", "sit_down"]);
  same(col(r.night, "halo"), ["weak", "weak", "flicker", "flicker"]);
  same(col(r.night, "bg")[0], "dune_night.webp");
  same(col(r.melody, "chara"), ["sit_down", "sit_down", "sit_surprised", "sit_eyes_closed"]);
  same(col(r.melody, "bg")[0], "dune_night.webp");
  same(col(r.boss, "chara"), [null, null, null, null]);
  same(col(r.boss, "bg")[0], "boss.jpg");
  ok(has(r.boss[0].anims, "shake") && has(r.boss[0].anims, "shakeBg"), "boss の enter=shake（ウィンドウと背景が揺れる）");
  ok(!has(allAnims(r.boss.slice(1)), "shake"), "揺れはシーン開始時だけ");
  same(col(r.sacrifice, "chara"), ["stand_serious", "stand_serious", "stand_serious", "stand_serious"]);
  same(col(r.sacrifice, "halo"), ["weak", "weak", "strong", "strong"]);
  same(r.sacrifice[3].haloOpacity > 0.8, true, "strong は明るい");
  ok(has(r.sacrifice[0].anims, "flash"), "sacrifice の enter=flash");
  ok(has(r.sacrifice[1].anims, "flash"), "reached 分岐の 2 段落目で fx=flash");
  ok(!has(r.sacrifice[2].anims, "flash") && !has(r.sacrifice[3].anims, "flash"), "フラッシュはそのページだけ");
  same(col(r.sacrifice, "bg")[0], "sacrifice.jpg");
  // end_true：花びら・オルゴールの分岐段落が入り 9 ページ（kindness / bakeryPromise なし）
  same(r.end_true.length, 9);
  ok(has(r.end_true[0].anims, "flash"), "end_true の enter=flash");
  same(col(r.end_true, "bg"), ["hand_holding.webp", "hand_holding.webp", "hand_holding.webp", "tower_foot.webp", "tower_foot.webp", "tower_foot.webp", "tower_foot.webp", "tower_foot.webp", "tower_foot.webp"], "段落の bg で切り替わる");
  same(col(r.end_true, "chara"), [null, null, null, null, null, null, "stand_normal", "stand_smile", "stand_smile"]);
  same(col(r.end_true.slice(6), "halo"), ["off", "off", "off"]);
  same(col(r.end_true.slice(6), "haloOpacity"), [0, 0, 0], "halo off は見えない");
  same(page.errors, [], "スクリプトエラーなし");
  var keys = await page.evaluate(function () {
    return Object.keys(window.localStorage).sort();
  });
  same(keys.filter(function (k) { return KEYS.indexOf(k) === -1; }), [], "localStorage に既存 5 件以外のキーを作らない");
  same(await page.evaluate(function () { return document.getElementById("app-version").textContent; }), "ver 3.0-p2");
  await page.context().close();
  console.log("  ✓ 仮の絵つき：舞台割り当て・enter・段落 fx / bg");

  // ---- 2. 設定で演出オフ ----
  page = await open(browser, artUrl, { settings: { effects: false } });
  r = await playRoute(page);
  var seen = Object.keys(r).reduce(function (a, id) { return a.concat(allAnims(r[id])); }, []);
  ok(!has(seen, "shake") && !has(seen, "shakeBg") && !has(seen, "flash") && !has(seen, "charaHop"), "演出オフでは揺れ・フラッシュ・跳ねが出ない");
  same(col(r.sacrifice, "halo"), ["weak", "weak", "strong", "strong"], "演出オフでも舞台（立ち絵・光輪の状態）は同じ");
  same(col(r.end_true, "bg")[3], "tower_foot.webp", "演出オフでも背景は切り替わる");
  same(page.errors, []);
  // 設定画面のチェックボックスで戻せる
  await page.context().close();
  page = await open(browser, artUrl);
  await page.click("#title-settings-btn");
  same(await page.isChecked("#set-effects"), true, "既定はオン");
  await page.uncheck("#set-effects");
  same(await page.evaluate(function () { return document.body.classList.contains("fx-off"); }), true);
  same(await page.evaluate(function () { return JSON.parse(window.localStorage.getItem("chrono-tale-settings-v1")).effects; }), false, "設定は既存キーに保存");
  await page.context().close();
  console.log("  ✓ 設定の演出オフ");

  // ---- 3. prefers-reduced-motion ----
  page = await open(browser, artUrl, { reducedMotion: true });
  r = await playRoute(page);
  seen = Object.keys(r).reduce(function (a, id) { return a.concat(allAnims(r[id])); }, []);
  ok(!has(seen, "shake") && !has(seen, "shakeBg") && !has(seen, "flash") && !has(seen, "charaHop"), "reduced-motion では揺れ・フラッシュ・跳ねが出ない");
  same(page.errors, []);
  await page.context().close();
  console.log("  ✓ prefers-reduced-motion");

  // ---- 4. 実ファイルだけ（無い素材はフォールバック）----
  page = await open(browser, realUrl, { viewport: { width: 390, height: 844 } });
  var exists = function (rel) { return fs.existsSync(path.join(__dirname, "..", "assets", "images", rel)); };
  r = await playRoute(page);
  same(page.errors, [], "素材が無くてもスクリプトエラーなし");
  same(col(r.village, "bg")[0], exists("bg/village_plaza.webp") ? "village_plaza.webp" : "village.jpg", "背景が無ければシーンの 1 枚絵へ戻る");
  same(col(r.night, "bg")[0], exists("bg/dune_night.webp") ? "dune_night.webp" : "night.jpg");
  same(col(r.melody, "bg")[0], exists("bg/dune_night.webp") ? "dune_night.webp" : "melody.jpg");
  same(col(r.end_true, "bg")[0], exists("bg/hand_holding.webp") ? "hand_holding.webp" : "end_true.jpg");
  same(col(r.end_true, "bg")[3], "tower_foot.webp");
  same(col(r.bakery, "chara")[2], exists("chara/rine/stand_smile.webp") ? "stand_smile" : null, "表情ファイルが無ければ枠を出さない");
  same(col(r.village, "chara")[1], "stand_normal");
  same(col(r.sacrifice, "chara")[0], "stand_serious");
  await page.context().close();
  console.log("  ✓ 実ファイルだけ（フォールバック）");
}

(async function () {
  var chromium = require("playwright").chromium;
  var browser = await chromium.launch();
  try {
    await run(browser);
    console.log("OK: " + checks + " 件の確認に合格");
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    process.exit();
  }
})();
