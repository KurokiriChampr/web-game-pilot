#!/usr/bin/env node
/*
 * 周回をまたぐ解放（STORY.unlocks）のブラウザ自動確認（Playwright）
 * ------------------------------------------------------------
 *   node tools/e2e-p7.js
 *
 * 検証用の別作品 tools/fixtures/unlock（8 シーン・結末 6。解放 3 件：seen_aoi＝bad_aoi 1 つ、two_bad＝4 つのバッドのうち 2 つ、
 * true_route＝4 つ全部）をエンジンに重ねて動かす。本作のデータは使わない。
 *
 * 確かめること
 *   1. エンディング到達 → 新規開始（「もう一度はじめから」・タイトルの「はじめから」）→ フラグが立っている →
 *      そのフラグを条件にした選択肢・本文が見える。1 つ／2 つ／4 つ全部の組合せを、実際に 4 周して確かめる
 *   2. 進行中の既存セーブ（スロット・オートセーブ）には影響しない（ロード・つづきからでは、そのセーブのフラグのまま）
 *   3. 保存キーは従来の名前だけ（解放用の新しいキーは無い）。記録の消去で解放も消える
 */
"use strict";

var path = require("path");
var assert = require("assert");
var playwright = require("playwright");
var createServer = require("./preview-server.js").createServer;

var UNLOCK = path.join(__dirname, "fixtures", "unlock");
var P = "fixture-unlock-";
var SAVE = P + "save-v1";
var SETTINGS_FAST = { textSpeed: 3, autoSpeed: 2 }; // 文字は一瞬で表示、オートは「はやい」

var checks = 0;
function ok(cond, msg) {
  checks += 1;
  assert.ok(cond, msg);
}
function same(a, b, msg) {
  checks += 1;
  assert.deepStrictEqual(a, b, msg);
}
async function section(name, fn) {
  var before = checks;
  await fn();
  console.log("  ✓ " + name + "（" + (checks - before) + " 件）");
}
function listen(server) {
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () {
      resolve("http://127.0.0.1:" + server.address().port + "/");
    });
  });
}

// ---------- 画面操作 ----------
async function open(browser, url, storage) {
  var context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  var page = await context.newPage();
  page.errors = [];
  page.on("pageerror", function (e) {
    page.errors.push(e.message);
  });
  page.on("console", function (m) {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.errors.push(m.text());
  });
  var data = Object.assign({}, storage || {});
  data[P + "settings-v1"] = Object.assign({}, SETTINGS_FAST, data[P + "settings-v1"] || {});
  await page.addInitScript(function (d) {
    if (window.sessionStorage.getItem("__seeded")) return;
    window.sessionStorage.setItem("__seeded", "1");
    Object.keys(d).forEach(function (k) {
      window.localStorage.setItem(k, typeof d[k] === "string" ? d[k] : JSON.stringify(d[k]));
    });
  }, data);
  await page.goto(url);
  await page.waitForSelector("#title-screen:not([hidden])");
  return page;
}
async function close(page) {
  same(page.errors, [], "画面のエラーが無い");
  await page.context().close();
}
async function start(page) {
  await page.click("#start-btn");
  await page.waitForSelector("#game-screen:not([hidden])");
}
function view(page) {
  return page.evaluate(function () {
    var $ = function (id) {
      return document.getElementById(id);
    };
    var save = null;
    try {
      save = JSON.parse(window.localStorage.getItem("fixture-unlock-save-v1"));
    } catch (e) {
      save = null;
    }
    return {
      title: $("scene-title").textContent,
      step: $("scene-step").textContent,
      page: $("page-count").textContent,
      mark: !$("next-mark").hidden,
      choices: !$("choice-overlay").hidden,
      choiceTexts: Array.prototype.map.call(document.querySelectorAll("#choices .choice-text"), function (n) {
        return n.textContent;
      }),
      ending: !$("ending-overlay").hidden,
      skip: !$("skip-btn").disabled,
      auto: $("auto-btn").getAttribute("aria-pressed") === "true",
      save: save
    };
  });
}
/** 表示を待ってから見る（文字送りの完了とオーバーレイの解錠を待つ） */
async function settled(page) {
  await page.waitForFunction(function () {
    var c = document.getElementById("choice-overlay");
    var e = document.getElementById("ending-overlay");
    var t = document.getElementById("skip-hint");
    return !c.classList.contains("is-locked") && !e.classList.contains("is-locked") && (!t || t.hidden);
  });
  await page.waitForTimeout(60);
  return view(page);
}
async function waitTitle(page, title) {
  await page.waitForFunction(function (t) {
    return document.getElementById("scene-title").textContent === t;
  }, title);
  return settled(page);
}
async function pick(page, n, nextTitle) {
  for (var guard = 0; guard < 20; guard++) {
    if (await page.evaluate(function () { return !document.getElementById("choice-overlay").hidden; })) break;
    await page.keyboard.press("Enter");
  }
  await page.waitForFunction(function () {
    var c = document.getElementById("choice-overlay");
    return !c.hidden && !c.classList.contains("is-locked");
  });
  await page.keyboard.press(String(n));
  return waitTitle(page, nextTitle);
}
async function tapText(page) {
  await page.click("#scene-text", { position: { x: 20, y: 10 } });
}
function logKinds(page) {
  return page.evaluate(function () {
    var s = JSON.parse(window.localStorage.getItem("fixture-unlock-save-v1"));
    return s.log.map(function (e) {
      return e.k === "c" ? "c:" + e.text : "s:" + e.title;
    });
  });
}
function readList(page) {
  return page.evaluate(function () {
    return JSON.parse(window.localStorage.getItem("fixture-unlock-read-v1") || "[]");
  });
}


function texts(page, sel) {
  return page.evaluate(function (s) {
    return Array.prototype.map.call(document.querySelectorAll(s), function (n) {
      return n.textContent;
    });
  }, sel);
}
async function endingShown(page) {
  await page.waitForFunction(function () {
    var e = document.getElementById("ending-overlay");
    return !e.hidden && !e.classList.contains("is-locked");
  });
}
/** 広場（next の関数）から、送りを重ねて結末 title へ入る（結末に入ったら送らない） */
async function toEnd(page, title) {
  for (var guard = 0; guard < 6; guard++) {
    var now = await page.evaluate(function () {
      return document.getElementById("scene-title").textContent;
    });
    if (now === title) break;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
  }
  var v = await waitTitle(page, title);
  await endingShown(page);
  return v;
}
async function openLog(page) {
  await page.click("#log-btn");
  await page.waitForSelector("#log-dialog[open]");
  return page.evaluate(function () {
    var list = document.getElementById("log-list");
    return {
      choices: Array.prototype.map.call(list.querySelectorAll(".log-choice-text"), function (n) {
        return n.textContent;
      }),
      jumps: list.querySelectorAll(".log-jump").length
    };
  });
}
var ROUTES = ["アオイについていく", "ベニについていく", "スイについていく", "クロについていく"];
var OPENING = "四つの道";

function endings(page) {
  return page.evaluate(function () {
    return JSON.parse(window.localStorage.getItem("fixture-unlock-endings-v1") || "[]");
  });
}
function keys(page) {
  return page.evaluate(function () {
    return Object.keys(Object.assign({}, window.localStorage)).sort();
  });
}
/** 序の本文を最後まで送って、ページ数と選択肢を見る */
async function openingView(page) {
  var v = await settled(page);
  for (var guard = 0; guard < 6 && !v.choices; guard++) {
    await page.keyboard.press("Enter");
    v = await settled(page);
  }
  return v;
}
/** 結末の画面の「もう一度はじめから」 */
async function again(page) {
  await page.click("#ending-restart");
  return waitTitle(page, OPENING);
}

// ---------- 1・2. 4 周の通し ----------
async function rounds(browser, url) {
  var page = await open(browser, url);
  await start(page);
  var v = await openingView(page);
  same([v.save.flags, v.choiceTexts, v.page], [{}, ROUTES, "2 / 2"], "1 周目：フラグなし、選択肢は 4 つ、序は 2 ページ");
  // 1 周目の途中をスロット 1 にセーブ（あとで「既存のセーブには影響しない」を確かめる）
  await page.click("#save-btn");
  await page.waitForSelector("#saves-dialog[open]");
  await page.click("#saves-list .save-row:nth-child(1) .btn-primary");
  await page.waitForFunction(function () {
    return !!window.localStorage.getItem("fixture-unlock-slots-v1");
  });
  await page.keyboard.press("Escape");
  await page.waitForSelector("#saves-dialog:not([open])", { state: "attached" });

  v = await pick(page, 1, "アオイの道");
  await endingShown(page);
  same(await endings(page), ["bad_aoi"], "到達が記録される（従来のキー）");

  // 2 周目：bad_aoi 1 つ → seen_aoi
  v = await again(page);
  same(v.save.flags, { seen_aoi: true }, "2 周目：新規開始で seen_aoi が立つ（オートセーブにも入る）");
  v = await openingView(page);
  same([v.choiceTexts, v.page], [ROUTES, "3 / 3"], "seen_aoi を読む本文のページが増える。2 つ未満なので選択肢は 4 つのまま");
  same(await page.textContent("#scene-text"), "（序 2）誰についていこうか。");
  v = await pick(page, 2, "ベニの道");
  await endingShown(page);

  // 3 周目：2 つ → two_bad（「見覚えのある道」が見える）
  v = await again(page);
  same(v.save.flags, { seen_aoi: true, two_bad: true }, "3 周目：2 つ到達で two_bad も立つ");
  v = await openingView(page);
  same(v.choiceTexts, ROUTES.concat(["見覚えのある道"]), "two_bad を条件にした選択肢が見える");

  // 既存のセーブ（1 周目のスロット）は影響を受けない
  await page.click("#menu-btn");
  await page.waitForSelector("#menu-dialog[open]");
  await page.click("#menu-load");
  await page.waitForSelector("#saves-dialog[open]");
  await page.click("#saves-list .save-row:nth-child(2) .btn-primary"); // 1 行目はオートセーブ
  await page.waitForSelector("#confirm-dialog[open]");
  await page.click("#confirm-ok");
  v = await waitTitle(page, OPENING);
  v = await openingView(page);
  same([v.save.flags, v.choiceTexts, v.page], [{}, ROUTES, "2 / 2"], "1 周目のスロットをロードすると、フラグはそのセーブのまま（解放は足されない）");
  v = await pick(page, 3, "スイの道"); // 既存のセーブから進めて 3 つ目に到達
  await endingShown(page);
  same((await endings(page)).sort(), ["bad_aoi", "bad_beni", "bad_sui"], "既存のセーブから進めた到達も記録される");

  // 4 周目（タイトルの「はじめから」）：3 つ → まだ真実の扉は無い
  await page.click("#ending-title");
  await page.waitForSelector("#title-screen:not([hidden])");
  await start(page);
  v = await openingView(page);
  same([v.save.flags, v.choiceTexts], [{ seen_aoi: true, two_bad: true }, ROUTES.concat(["見覚えのある道"])], "タイトルから新規開始しても解放が効く。3 つではまだ true_route は無い");
  v = await pick(page, 4, "クロの道");
  await endingShown(page);

  // 5 周目：4 つ全部 → true_route（「真実の扉」→ トゥルー）
  v = await again(page);
  same(v.save.flags, { seen_aoi: true, two_bad: true, true_route: true }, "4 つ全部に到達した次の周で true_route が立つ");
  v = await openingView(page);
  same(v.choiceTexts, ROUTES.concat(["見覚えのある道", "真実の扉"]), "true_route を条件にした選択肢が見える");
  v = await pick(page, 6, "扉の向こう");
  await page.keyboard.press("Enter");
  await settled(page);
  same(await page.textContent("#scene-text"), "（扉 2）すべてを覚えている。", "解放のフラグを読む本文");
  v = await toEnd(page, "真実");
  same(v.ending, true, "TRUE END に届く");
  same((await endings(page)).sort(), ["bad_aoi", "bad_beni", "bad_kuro", "bad_sui", "true"]);
  same(await keys(page), [P + "endings-v1", P + "read-v1", P + "settings-v1", P + "slots-v1"], "保存キーは従来の名前だけ（解放用のキーは無い）");

  // 結末の「やり直す」（最後の選択肢へ）：その周のフラグのまま
  await page.click("#ending-retry");
  v = await waitTitle(page, OPENING);
  same(v.save.flags, { seen_aoi: true, two_bad: true, true_route: true }, "「やり直す」はその周の控えから（フラグもそのまま）");
  v = await pick(page, 5, "見覚えのある道");
  await endingShown(page);
  await close(page);
}

// ---------- 2・3. 記録を入れた状態から：つづきから／はじめから／記録の消去 ----------
async function seeded(browser, url) {
  var old = {
    scene: "opening",
    affection: 0,
    shards: 0,
    flags: { met: true },
    steps: 0,
    log: [{ k: "s", title: OPENING, paras: ["（序 1）分かれ道に、四人が立っている。", "（序 2）誰についていこうか。"] }]
  };
  var store = {};
  store[SAVE] = old;
  store[P + "endings-v1"] = ["bad_aoi", "bad_beni", "bad_sui", "bad_kuro"];
  var page = await open(browser, url, store);
  ok(!(await page.isHidden("#continue-btn")), "「つづきから」が出る");
  await page.click("#continue-btn");
  var v = await waitTitle(page, OPENING);
  v = await openingView(page);
  same([v.save.flags, v.choiceTexts], [{ met: true }, ROUTES], "つづきから：進行中のセーブは、全部到達していてもフラグを足さない");
  await page.click("#menu-btn");
  await page.waitForSelector("#menu-dialog[open]");
  await page.click("#menu-restart");
  await page.waitForSelector("#confirm-dialog[open]");
  await page.click("#confirm-ok");
  v = await waitTitle(page, OPENING);
  same(v.save.flags, { seen_aoi: true, two_bad: true, true_route: true }, "メニューの「最初から」：新規開始なので解放が効く（その周のフラグ met は引き継がない）");
  v = await openingView(page);
  same(v.choiceTexts, ROUTES.concat(["見覚えのある道", "真実の扉"]));

  // 記録の消去 → 解放も消える
  await page.click("#menu-btn");
  await page.waitForSelector("#menu-dialog[open]");
  await page.click("#menu-title");
  await page.waitForSelector("#title-screen:not([hidden])");
  await page.click("#title-settings-btn");
  await page.waitForSelector("#settings-dialog[open]");
  await page.click("#reset-data");
  await page.waitForSelector("#confirm-dialog[open]");
  await page.click("#confirm-ok");
  await page.waitForSelector("#settings-dialog:not([open])", { state: "attached" });
  same(await endings(page), [], "到達記録が消える");
  await start(page);
  v = await openingView(page);
  same([v.save.flags, v.choiceTexts], [{}, ROUTES], "消去のあとの新規開始ではフラグは立たない");
  await close(page);
}

(async function main() {
  var browser = await playwright.chromium.launch();
  var server = createServer({ roots: [UNLOCK, path.resolve(__dirname, "..")] });
  var url = await listen(server);
  try {
    console.log("周回をまたぐ解放（STORY.unlocks）の確認：tools/fixtures/unlock");
    await section("1・2. 到達 → 新規開始 → フラグ → 選択肢（1 つ／2 つ／4 つ全部）、既存のセーブは不変", function () {
      return rounds(browser, url);
    });
    await section("2・3. つづきから／最初から／記録の消去、保存キー", function () {
      return seeded(browser, url);
    });
    console.log("OK: " + checks + " 件の検査に合格");
  } finally {
    await browser.close();
    server.close();
  }
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
