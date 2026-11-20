#!/usr/bin/env node
/*
 * 状態変数（STORY.vars / state.vars）のブラウザ自動確認（Playwright）
 * ------------------------------------------------------------
 *   node tools/e2e-p6.js
 *
 * 検証用の別作品 tools/fixtures/vars（7 シーン・結末 4。変数 gold と人物ごとの trust）をエンジンに重ねて動かす。
 * 本作のデータは使わない（本作のセーブに vars が現れないことは tools/e2e.js・tools/e2e-p3.js のセーブの形の確認と
 * tools/test-stage.js で確かめる）。
 *
 * 確かめること（設計書 docs/gui-next-design-report-20261117.md §1・テスト §1-3 の新規欄のうち HUD 以外）
 *   1. 変数の増減で分岐が変わる（effects.vars の加算・代入・範囲、onEnter.vars、requires と next の関数、本文の関数）
 *   2. 選択肢への巻き戻し（結末の「やり直す」とバックログの「戻る」）で変数も戻る
 *   3. セーブ → ロード → 再読み込みで値が戻る。セーブの形は従来の 6 項目＋vars、保存キーは従来の名前だけ
 *   4. vars の無い旧セーブ（変数を足す前の形）を読める：宣言の初期値で補い、控えに vars の無い選択肢の行には「戻る」を出さない
 */
"use strict";

var path = require("path");
var assert = require("assert");
var playwright = require("playwright");
var createServer = require("./preview-server.js").createServer;

var VARS = path.join(__dirname, "fixtures", "vars");
var P = "fixture-vars-";
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
      save = JSON.parse(window.localStorage.getItem("fixture-vars-save-v1"));
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
    var s = JSON.parse(window.localStorage.getItem("fixture-vars-save-v1"));
    return s.log.map(function (e) {
      return e.k === "c" ? "c:" + e.text : "s:" + e.title;
    });
  });
}
function readList(page) {
  return page.evaluate(function () {
    return JSON.parse(window.localStorage.getItem("fixture-vars-read-v1") || "[]");
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
var INIT = { gold: 100, trust: { aoi: 0, beni: 0, sui: 0 } };
var ALL = ["花を買う（30）", "指輪を買う（120）", "何も買わない"];

// ---------- 1・2. 分岐・巻き戻し ----------
async function branches(browser, url) {
  var page = await open(browser, url);
  await start(page);
  var v = await settled(page);
  same(v.save.vars, INIT, "はじめから：vars は宣言の初期値");
  v = await pick(page, 1, "市場"); // アオイ +3・ベニ −1（0 止まり）、市場の onEnter で gold +20
  same(v.save.vars, { gold: 120, trust: { aoi: 3, beni: 0, sui: 0 } }, "effects.vars（人物ごと・下限）と行き先の onEnter.vars");
  await page.keyboard.press("Enter");
  v = await settled(page);
  same(v.choiceTexts, ALL, "所持金 120 なら requires の指輪も見える");
  v = await pick(page, 1, "広場"); // 花：gold −30、アオイ +1
  same(v.save.vars, { gold: 90, trust: { aoi: 4, beni: 0, sui: 0 } });
  await page.keyboard.press("Enter");
  await settled(page);
  same(await page.textContent("#scene-text"), "（広 2）財布の中身は 90 枚。", "本文の関数が変数を読む");
  v = await toEnd(page, "アオイと");
  same(v.ending, true, "trust.aoi 4 → next の関数で END A");

  // 結末の「やり直す」：市場の選択肢へ戻ると、変数も選ぶ前（市場に入った時点）の値
  await page.click("#ending-retry");
  v = await waitTitle(page, "市場");
  same([v.choices, v.save.vars], [true, { gold: 120, trust: { aoi: 3, beni: 0, sui: 0 } }], "「やり直す」で変数も戻る");
  v = await pick(page, 3, "広場"); // 何も買わない：アオイは 3 のまま
  same(v.save.vars.trust.aoi, 3);
  await page.keyboard.press("Enter");
  v = await toEnd(page, "ひとりで");
  same(v.ending, true, "1 の差で行き先が変わる（END D）");

  // バックログの「戻る」：最初の選択肢へ戻ると初期値
  await page.click("#ending-retry");
  await waitTitle(page, "市場");
  var log = await openLog(page);
  same([log.choices, log.jumps], [["▶ アオイと話す"], 1], "選択肢の行に「戻る」が出る（控えに vars がある）");
  await page.click(".log-jump");
  await page.waitForSelector("#confirm-dialog[open]");
  await page.click("#confirm-ok");
  v = await waitTitle(page, "三人の旅人");
  same([v.choices, v.save.vars, v.save.steps], [true, INIT, 0], "バックログから戻ると、変数は初期値");

  // スイ：+12 は上限 10、gold −30 ＋ 20 = 90 → 指輪は隠れる
  v = await pick(page, 3, "市場");
  same(v.save.vars, { gold: 90, trust: { aoi: 0, beni: 0, sui: 10 } }, "上限で止まる");
  await page.keyboard.press("Enter");
  v = await settled(page);
  same(v.choiceTexts, ["花を買う（30）", "何も買わない"], "所持金 90 では指輪が隠れる");
  await pick(page, 2, "広場");
  await page.keyboard.press("Enter");
  v = await toEnd(page, "スイと");
  same(v.ending, true, "END C");

  // 指輪：gold を 0 に代入、ベニ +5 → END B
  await page.click("#ending-retry");
  await waitTitle(page, "市場");
  log = await openLog(page);
  await page.click(".log-jump");
  await page.waitForSelector("#confirm-dialog[open]");
  await page.click("#confirm-ok");
  await waitTitle(page, "三人の旅人");
  await pick(page, 1, "市場");
  await page.keyboard.press("Enter");
  await settled(page);
  v = await pick(page, 2, "広場");
  same(v.save.vars, { gold: 0, trust: { aoi: 3, beni: 5, sui: 0 } }, "{ set: 0 } の代入");
  await page.keyboard.press("Enter");
  v = await toEnd(page, "ベニと");
  same(v.ending, true, "END B");
  same(JSON.parse(await page.evaluate(function () {
    return window.localStorage.getItem("fixture-vars-endings-v1");
  })).sort(), ["alone", "aoi", "beni", "sui"], "4 つの結末すべてに、変数の値しだいで届いた");
  await close(page);
}

// ---------- 3. セーブ → ロード → 再読み込み ----------
async function saveLoad(browser, url) {
  var page = await open(browser, url);
  await start(page);
  await settled(page);
  await pick(page, 2, "市場"); // ベニ +3、gold 120
  await page.click("#save-btn");
  await page.waitForSelector("#saves-dialog[open]");
  await page.click("#saves-list .save-row:nth-child(1) .btn-primary");
  await page.waitForFunction(function () {
    return !!window.localStorage.getItem("fixture-vars-slots-v1");
  });
  var slot = await page.evaluate(function () {
    return JSON.parse(window.localStorage.getItem("fixture-vars-slots-v1"))["1"].state;
  });
  same(Object.keys(slot).sort(), ["affection", "flags", "log", "scene", "shards", "steps", "vars"], "セーブの項目は従来の 6 つ＋vars");
  same(slot.vars, { gold: 120, trust: { aoi: 0, beni: 3, sui: 0 } });
  same(slot.log.filter(function (e) {
    return e.k === "c";
  })[0].s.vars, INIT, "選択肢の行の控えにも vars の写しが入る");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#saves-dialog:not([open])", { state: "attached" });

  // 先へ進めて値を変えてから、スロットをロード
  await page.keyboard.press("Enter");
  await settled(page);
  var v = await pick(page, 2, "広場");
  same(v.save.vars.gold, 0);
  await page.click("#menu-btn");
  await page.waitForSelector("#menu-dialog[open]");
  await page.click("#menu-load");
  await page.waitForSelector("#saves-dialog[open]");
  await page.click("#saves-list .save-row:nth-child(2) .btn-primary"); // 1 行目はオートセーブ
  await page.waitForSelector("#confirm-dialog[open]");
  await page.click("#confirm-ok");
  v = await waitTitle(page, "市場");
  same(v.save.vars, { gold: 120, trust: { aoi: 0, beni: 3, sui: 0 } }, "ロードで値が戻る");
  await page.keyboard.press("Enter");
  v = await settled(page);
  same(v.choiceTexts, ALL, "ロード後の requires も戻った値で判断");

  // 再読み込み → つづきから
  await page.reload();
  await page.waitForSelector("#continue-btn:not([hidden])");
  await page.click("#continue-btn");
  v = await waitTitle(page, "市場");
  same(v.save.vars, { gold: 120, trust: { aoi: 0, beni: 3, sui: 0 } }, "再読み込みしても値が戻る");
  same(Object.keys(await page.evaluate(function () {
    return Object.assign({}, window.localStorage);
  })).sort(), [P + "read-v1", P + "save-v1", P + "settings-v1", P + "slots-v1"], "保存キーは従来の名前だけ");
  await close(page);
}

// ---------- 4. vars の無い旧セーブ ----------
async function oldSave(browser, url) {
  var opening = { k: "s", title: "三人の旅人", paras: ["（序 1）宿の食堂に、旅人が三人いる。", "（序 2）誰と話そうか。"], who: ["", "アオイ"] };
  var old = {
    scene: "market",
    affection: 0,
    shards: 0,
    flags: {},
    steps: 1,
    log: [
      opening,
      { k: "c", text: "スイと話す", s: { scene: "opening", affection: 0, shards: 0, flags: {}, steps: 0 } }, // 変数を足す前の控え（vars なし）
      { k: "s", title: "市場", paras: ["（市 1）市場は賑わっている。", "（市 2）何か買っていこうか。"] }
    ]
  };
  var store = {};
  store[SAVE] = old;
  store[P + "slots-v1"] = { 1: { savedAt: 1, state: old } };
  store[P + "endings-v1"] = ["alone"]; // 「戻る」の解放条件（結末を 1 つ見ている）
  var page = await open(browser, url, store);
  ok(!(await page.isHidden("#continue-btn")), "vars の無いオートセーブでも「つづきから」が出る");
  await page.click("#continue-btn");
  var v = await waitTitle(page, "市場");
  same(v.save.vars, INIT, "読み込むと宣言の初期値で補われ、オートセーブに書かれる");
  same(Object.keys(v.save).sort(), ["affection", "flags", "log", "scene", "shards", "steps", "vars"]);
  await page.keyboard.press("Enter");
  v = await settled(page);
  same(v.choiceTexts, ["花を買う（30）", "何も買わない"], "補った値（gold 100）で requires を判断");
  var log = await openLog(page);
  same([log.choices, log.jumps], [["▶ スイと話す"], 0], "控えに vars の無い選択肢の行には「戻る」を出さない");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#log-dialog:not([open])", { state: "attached" });
  v = await pick(page, 1, "広場");
  same(v.save.vars, { gold: 70, trust: { aoi: 1, beni: 0, sui: 0 } }, "補ったあとは普通に更新される");
  log = await openLog(page);
  same([log.choices, log.jumps], [["▶ スイと話す", "▶ 花を買う（30）"], 1], "新しく選んだ行（控えに vars あり）には「戻る」が出る");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#log-dialog:not([open])", { state: "attached" });
  await page.keyboard.press("Enter");
  v = await toEnd(page, "ひとりで");
  ok(!(await page.isHidden("#ending-retry")), "結末の「やり直す」は vars のある控えへ戻る");
  await page.click("#ending-retry");
  v = await waitTitle(page, "市場");
  same(v.save.vars, INIT, "戻ると補った初期値");
  await close(page);

  // スロットの旧セーブも読める
  page = await open(browser, url, store);
  await page.click("#continue-btn");
  await waitTitle(page, "市場");
  await page.click("#menu-btn");
  await page.waitForSelector("#menu-dialog[open]");
  await page.click("#menu-load");
  await page.waitForSelector("#saves-dialog[open]");
  ok((await texts(page, "#saves-list .save-row")).length >= 2, "スロットが並ぶ");
  await page.click("#saves-list .save-row:nth-child(2) .btn-primary");
  await page.waitForSelector("#confirm-dialog[open]");
  await page.click("#confirm-ok");
  v = await waitTitle(page, "市場");
  same(v.save.vars, INIT, "vars の無いスロットも、初期値で補って読める");
  await close(page);
}

(async function main() {
  var browser = await playwright.chromium.launch();
  var server = createServer({ roots: [VARS, path.resolve(__dirname, "..")] });
  var url = await listen(server);
  try {
    console.log("状態変数（STORY.vars）の確認：tools/fixtures/vars");
    await section("1・2. 変数の増減で分岐が変わる／巻き戻しで変数も戻る", function () {
      return branches(browser, url);
    });
    await section("3. セーブ → ロード → 再読み込みで値が戻る", function () {
      return saveLoad(browser, url);
    });
    await section("4. vars の無い旧セーブを読める", function () {
      return oldSave(browser, url);
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
