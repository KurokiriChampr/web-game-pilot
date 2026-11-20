#!/usr/bin/env node
/*
 * 選択肢なしのシーン遷移（scene.next）のブラウザ自動確認（Playwright）
 * ------------------------------------------------------------
 *   node tools/e2e-p5.js
 *
 * 検証用の別作品 tools/fixtures/linear（一本道を含む 13 シーン）をエンジンに重ねて動かす。本作のデータは使わない
 * （本作が変わっていないことは tools/e2e-p4.js の画面 164 枚の比較で確かめる）。
 *
 * 確かめること（設計書 docs/gui-next-design-report-20261117.md §2・テスト §2-3 の新規欄）
 *   1. タップと Enter で次のシーンへ進む／最終ページで待つ（自動では切り替えない）
 *   2. 幕の数（steps が next でも 1 増える）と章の呼び名
 *   3. 見える選択肢が 0 個のときは next へ進む／見える選択肢があれば選択肢が優先
 *   4. オートが一本道を通り抜け、選択肢で止まる
 *   5. 既読スキップは最終ページで止まる（シーンをまたがない）
 *   6. バックログに選択肢の行が入らない（シーンの行が続く）
 *   7. 一本道を 2 つ挟んだ先から、直前の選択肢へ戻れる（結末の「やり直す」とバックログの「戻る」）
 *   8. 「読んだシーン」の数
 *   9. 一本道の途中でセーブ → ロード → 再読み込み（セーブの形は従来の 6 項目のまま）
 */
"use strict";

var path = require("path");
var assert = require("assert");
var playwright = require("playwright");
var createServer = require("./preview-server.js").createServer;

var LINEAR = path.join(__dirname, "fixtures", "linear");
var P = "fixture-linear-";
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
      save = JSON.parse(window.localStorage.getItem("fixture-linear-save-v1"));
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
    var s = JSON.parse(window.localStorage.getItem("fixture-linear-save-v1"));
    return s.log.map(function (e) {
      return e.k === "c" ? "c:" + e.text : "s:" + e.title;
    });
  });
}
function readList(page) {
  return page.evaluate(function () {
    return JSON.parse(window.localStorage.getItem("fixture-linear-read-v1") || "[]");
  });
}

// ---------- 1〜3. 進み方・幕と章・見える選択肢が 0 個 ----------
async function basics(browser, url) {
  var page = await open(browser, url);
  await start(page);
  var v = await settled(page);
  same([v.title, v.step, v.page], ["分かれ道", "第1幕", "1 / 2"], "開始シーン");
  v = await pick(page, 1, "左の道・一"); // 左の道（Enter 以外の操作は数字キー）
  same([v.step, v.page, v.mark, v.choices], ["第2幕", "1 / 2", true, false], "選択肢で入った一本道のシーン（第 2 幕）");

  // 最終ページで待つ：送りの印を出し、選択肢は出さず、時間がたっても切り替えない
  await page.keyboard.press("Enter");
  v = await settled(page);
  same([v.title, v.page, v.mark, v.choices, v.ending], ["左の道・一", "2 / 2", true, false, false], "最終ページで送りの印を出して待つ");
  await page.waitForTimeout(2500);
  v = await view(page);
  same([v.title, v.page, v.mark], ["左の道・一", "2 / 2", true], "オートでなければ、待っても次のシーンへは切り替えない");
  ok((await readList(page)).indexOf("l1") !== -1, "最終ページを表示した時点で「シーンを最後まで読んだ」が付く");
  same(v.save.scene, "l1", "送り待ちの間、オートセーブはいまのシーンのまま");

  // Enter で次のシーンへ
  await page.keyboard.press("Enter");
  v = await waitTitle(page, "左の道・二");
  same([v.step, v.page, v.mark], ["第3幕", "1 / 3", true], "Enter で次のシーンへ。最初のページから、幕は +1");
  same([v.save.scene, v.save.steps, v.save.flags], ["l2", 2, { left: true }], "オートセーブ（scene・steps）");

  // タップで次のシーンへ（文字送り中のタップは全文表示、表示済みなら次のページ）
  await tapText(page);
  await tapText(page);
  v = await settled(page);
  same([v.page, v.mark], ["3 / 3", true], "タップでも最終ページまで進む");
  await tapText(page);
  v = await waitTitle(page, "門前");
  same(v.step, "第二章　門の先", "章のあるシーンへ入ると、幕の呼び名が章の題名になる");
  same(v.save.steps, 3, "章をまたいでも幕の数は数え続ける");

  // gate の next は関数：鍵なし → fork。fork は「鍵が要る選択肢だけ＋next」で、見える選択肢が 0 個 → next
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  v = await waitTitle(page, "行き止まりの壁");
  same(v.save.steps, 4, "関数の next（状態しだいの行き先）");
  await page.keyboard.press("Enter");
  v = await settled(page);
  same([v.page, v.mark, v.choices, v.choiceTexts], ["2 / 2", true, false, []], "見える選択肢が 0 個なら、選択肢の画面を出さずに送り待ち");
  await page.keyboard.press("Enter");
  v = await waitTitle(page, "最後の道");
  same(v.save.steps, 5);
  await page.keyboard.press("Enter");
  v = await settled(page);
  same([v.choices, v.choiceTexts, v.mark], [true, ["旅を終える", "もう少し歩く"], false], "選択肢だけのシーンは今までどおり");
  // 送りの操作では選択肢を飛ばさない
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  v = await view(page);
  same([v.title, v.choices], ["最後の道", true], "選択肢が出ているとき、送りでは先へ進まない");
  await close(page);

  // 鍵あり（右の道の onEnter で鍵）→ gate の関数 → door：見える選択肢があるので選択肢が優先
  page = await open(browser, url);
  await start(page);
  await settled(page);
  v = await pick(page, 2, "右の道");
  same(v.save.flags, { key: true }, "行き先の onEnter が適用される");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  v = await waitTitle(page, "門前");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  v = await waitTitle(page, "鍵穴の扉");
  await page.keyboard.press("Enter");
  v = await settled(page);
  same([v.choices, v.choiceTexts, v.mark], [true, ["鍵で扉を開ける"], false], "見える選択肢が 1 つ以上あれば、next より選択肢が優先");
  await page.waitForTimeout(600);
  same((await view(page)).title, "鍵穴の扉", "選択肢が出ているときは next へ進まない");
  v = await pick(page, 1, "扉の向こう");
  same(v.ending, true, "選択肢から結末へ");
  await close(page);
}

// ---------- 4. オート ----------
async function autoRun(browser, url) {
  var page = await open(browser, url);
  await start(page);
  await settled(page);
  await pick(page, 1, "左の道・一");
  var t0 = Date.now();
  await page.click("#auto-btn");
  same((await view(page)).auto, true, "オートをオン");
  var seen = [];
  await page.exposeFunction("__note", function (t) {
    seen.push(t);
  });
  await page.evaluate(function () {
    var node = document.getElementById("scene-title");
    new MutationObserver(function () {
      window.__note(node.textContent);
    }).observe(node, { childList: true, characterData: true, subtree: true });
  });
  await page.waitForFunction(
    function () {
      var c = document.getElementById("choice-overlay");
      return document.getElementById("scene-title").textContent === "最後の道" && !c.hidden;
    },
    null,
    { timeout: 60000 }
  );
  var v = await settled(page);
  same(seen.filter(function (t, i) {
    return seen.indexOf(t) === i;
  }), ["左の道・二", "門前", "行き止まりの壁", "最後の道"], "オートが一本道（関数の next・見える選択肢 0 個の next を含む）を通り抜ける");
  same([v.choices, v.auto], [true, true], "選択肢で止まる（オートの状態は保つ）");
  ok(Date.now() - t0 > 4 * 700, "ページごとにいつもの待ち時間を置いている");
  await page.waitForTimeout(2500);
  v = await view(page);
  same([v.title, v.choices], ["最後の道", true], "選択肢は自動では選ばない");
  same(await logKinds(page), ["s:分かれ道", "c:左の道へ", "s:左の道・一", "s:左の道・二", "s:門前", "s:行き止まりの壁", "s:最後の道"], "オートで進んだぶんも、シーンの行だけが続く");
  // 選んだあと、次のシーン（結末）でオートは止まる
  await pick(page, 1, "旅の終わり");
  await page.waitForFunction(function () {
    return !document.getElementById("ending-overlay").hidden;
  });
  same((await view(page)).auto, false, "結末ではオートが切れる（今と同じ）");
  await close(page);

  // 送り待ちのときにオートをオンにしても、待ち時間のあとで進む
  page = await open(browser, url);
  await start(page);
  await settled(page);
  await pick(page, 3, "まっすぐの道・一");
  await page.keyboard.press("Enter");
  v = await settled(page);
  same([v.page, v.mark], ["2 / 2", true], "送り待ち");
  await page.keyboard.press("a");
  v = await waitTitle(page, "まっすぐの道・二");
  same(v.auto, true, "送り待ちでオンにしたオートが、次のシーンへ進める");
  await close(page);
}

// ---------- 5. 既読スキップ ----------
async function skipRun(browser, url) {
  var page = await open(browser, url);
  await start(page);
  await settled(page);
  await pick(page, 1, "左の道・一");
  await page.keyboard.press("Enter"); // l1 を読み、l2 へ
  await settled(page);
  await page.keyboard.press("Enter");
  await waitTitle(page, "左の道・二");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // l2 の 3 ページ目まで読む
  var v = await settled(page);
  same(v.page, "3 / 3");
  // タイトルへ戻って、はじめから（既読が残る）
  await page.evaluate(function () {
    document.querySelector('[data-action="title"]').click();
  });
  await page.waitForSelector("#title-screen:not([hidden])");
  await start(page);
  await settled(page);
  await pick(page, 1, "左の道・一");
  v = await view(page);
  same(v.skip, true, "既読のシーンではスキップできる");
  await page.click("#skip-btn");
  v = await settled(page);
  same([v.title, v.page, v.mark, v.skip], ["左の道・一", "2 / 2", true, false], "スキップは最終ページで止まり、シーンをまたがない");
  await page.waitForTimeout(800);
  same((await view(page)).title, "左の道・一", "スキップのあと、自動では次のシーンへ進まない");
  await page.keyboard.press("Enter");
  v = await waitTitle(page, "左の道・二");
  same(v.skip, true, "1 回送ると次のシーンへ。そこからまたスキップできる");
  await page.click("#skip-btn");
  v = await settled(page);
  same([v.title, v.page, v.mark], ["左の道・二", "3 / 3", true], "次のシーンでも最終ページで止まる");
  await close(page);
}

// ---------- 6・7. バックログと巻き戻し ----------
async function logAndRewind(browser, url) {
  // 結末を 1 つ見ている（「この選択肢に戻る」の解放条件）
  var page = await open(browser, url, {});
  await start(page);
  await settled(page);
  await pick(page, 3, "まっすぐの道・一");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  var v = await waitTitle(page, "まっすぐの道・二");
  same(v.save.steps, 2);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  v = await waitTitle(page, "丘の上");
  await page.waitForFunction(function () {
    var e = document.getElementById("ending-overlay");
    return !e.hidden && !e.classList.contains("is-locked");
  });
  ok(!(await page.isHidden("#ending-retry")), "一本道を 2 つ挟んだ結末でも「最後の選択肢からやり直す」が出る");
  await page.click("#ending-retry");
  v = await waitTitle(page, "分かれ道");
  same([v.choices, v.step, v.page], [true, "第1幕", "2 / 2"], "いちばん近い選択肢（一本道の 2 シーンより前）へ戻る");
  same([v.save.scene, v.save.steps, v.save.log.length], ["opening", 0, 1], "戻った選択肢の時点の状態（幕の数も戻る）がオートセーブに入る");
  v = await pick(page, 1, "左の道・一");
  same([v.save.steps, v.save.flags], [1, { left: true }], "戻ったあとは選び直した状態で進む（幕の数も戻っている）");
  same(await logKinds(page), ["s:分かれ道", "c:左の道へ", "s:左の道・一"], "戻した先の一本道は、ログから外れている");

  // 一本道を 2 つ進んだ先でバックログを開く：選択肢の行は 1 つ、シーンの行が続く。「戻る」で選択肢へ
  for (var i = 0; i < 2; i++) await page.keyboard.press("Enter");
  await waitTitle(page, "左の道・二");
  for (i = 0; i < 3; i++) await page.keyboard.press("Enter");
  await waitTitle(page, "門前");
  var log = await (async function () {
    await page.click("#log-btn");
    await page.waitForSelector("#log-dialog[open]");
    return page.evaluate(function () {
      var list = document.getElementById("log-list");
      return {
        scenes: Array.prototype.map.call(list.querySelectorAll(".log-scene"), function (n) {
          return n.textContent;
        }),
        choices: Array.prototype.map.call(list.querySelectorAll(".log-choice-text"), function (n) {
          return n.textContent;
        }),
        jumps: list.querySelectorAll(".log-jump").length
      };
    });
  })();
  same(log, { scenes: ["分かれ道", "左の道・一", "左の道・二", "門前"], choices: ["▶ 左の道へ"], jumps: 1 }, "バックログ：next で進んだところに選択肢の行は入らない");
  same(await logKinds(page), ["s:分かれ道", "c:左の道へ", "s:左の道・一", "s:左の道・二", "s:門前"], "保存されるログも、行の種類は s と c だけ");
  await page.click(".log-jump");
  await page.waitForSelector("#confirm-dialog[open]");
  await page.click("#confirm-ok");
  v = await waitTitle(page, "分かれ道");
  same([v.choices, v.save.scene, v.save.steps, v.save.flags], [true, "opening", 0, {}], "一本道を 2 つ挟んだ先から、直前の選択肢へ戻れる（状態も選ぶ前へ）");
  await close(page);
}

// ---------- 8. 読んだシーン ----------
async function readCount(browser, url) {
  var page = await open(browser, url);
  same(await page.textContent("#scene-rate"), "0 / 13", "最初は 0");
  await start(page);
  await settled(page);
  await pick(page, 3, "まっすぐの道・一"); // 分かれ道を読んだ
  await page.keyboard.press("Enter"); // s1 の最終ページ → 読んだ
  await settled(page);
  await page.keyboard.press("Enter");
  await waitTitle(page, "まっすぐの道・二"); // s2 は 1 ページ目だけ（まだ読んでいない）
  var read = await readList(page);
  same(read.filter(function (k) {
    return k.indexOf("#") === -1 && k.indexOf(">") === -1;
  }), ["opening", "s1"], "シーンの記録は最終ページを表示した時点で付く（一本道でも同じ）");
  same(read.filter(function (k) {
    return k.indexOf(">") !== -1;
  }).length, 1, "選択肢の記録は、選んだ 1 つだけ（next では付かない）");
  same(read.filter(function (k) {
    return k.indexOf("#") !== -1;
  }).length, 2 + 2 + 1, "ページの記録は今と同じ（読んだページ数ぶん）");
  await page.evaluate(function () {
    document.querySelector('[data-action="title"]').click();
  });
  await page.waitForSelector("#title-screen:not([hidden])");
  same(await page.textContent("#scene-rate"), "2 / 13", "「読んだシーン」の数");
  await close(page);
}

// ---------- 9. 一本道の途中でセーブ → ロード → 再読み込み ----------
async function saveLoad(browser, url) {
  var page = await open(browser, url);
  await start(page);
  await settled(page);
  await pick(page, 1, "左の道・一");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await waitTitle(page, "左の道・二");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  var v = await settled(page);
  same([v.page, v.mark], ["3 / 3", true], "一本道の最終ページで送り待ち");
  // 手動セーブ（送り待ちのままでもセーブできる）
  await page.click("#save-btn");
  await page.waitForSelector("#saves-dialog[open]");
  await page.click("#saves-list .save-row:nth-child(1) .btn-primary");
  await page.waitForFunction(function () {
    return !!window.localStorage.getItem("fixture-linear-slots-v1");
  });
  var slot = await page.evaluate(function () {
    return JSON.parse(window.localStorage.getItem("fixture-linear-slots-v1"))["1"].state;
  });
  same(Object.keys(slot).sort(), ["affection", "flags", "log", "scene", "shards", "steps"], "セーブの項目は従来の 6 つのまま（送り待ちは保存しない）");
  same([slot.scene, slot.steps], ["l2", 2]);
  same(Object.keys(await page.evaluate(function () {
    return Object.assign({}, window.localStorage);
  })).sort(), [P + "read-v1", P + "save-v1", P + "settings-v1", P + "slots-v1"], "保存キーは従来の名前だけ");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#saves-dialog:not([open])", { state: "attached" });

  // 先へ進めてから、スロットをロード
  await page.keyboard.press("Enter");
  await waitTitle(page, "門前");
  await page.click("#menu-btn");
  await page.waitForSelector("#menu-dialog[open]");
  await page.click("#menu-load");
  await page.waitForSelector("#saves-dialog[open]");
  await page.click("#saves-list .save-row:nth-child(2) .btn-primary"); // 1 行目はオートセーブ
  await page.waitForSelector("#confirm-dialog[open]");
  await page.click("#confirm-ok");
  v = await waitTitle(page, "左の道・二");
  same([v.page, v.mark, v.step], ["1 / 3", true, "第3幕"], "ロードするとシーンの最初のページから");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  v = await waitTitle(page, "門前");
  same(v.save.steps, 3, "ロード後も next で進める");

  // 再読み込み → つづきから：オートセーブ（いまのシーンの頭）から
  await page.keyboard.press("Enter");
  v = await settled(page);
  same([v.page, v.mark], ["2 / 2", true], "送り待ちで再読み込みする");
  await page.reload();
  await page.waitForSelector("#continue-btn:not([hidden])");
  await page.click("#continue-btn");
  v = await waitTitle(page, "門前");
  same([v.page, v.step, v.save.steps], ["1 / 2", "第二章　門の先", 3], "再読み込みすると、そのシーンの頭に戻る");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  v = await waitTitle(page, "行き止まりの壁");
  same(v.save.steps, 4, "再開後も next で進める");
  await close(page);
}

(async function main() {
  var browser = await playwright.chromium.launch();
  var server = createServer({ roots: [LINEAR, path.resolve(__dirname, "..")] });
  var url = await listen(server);
  try {
    console.log("scene.next（一本道）の確認：tools/fixtures/linear");
    await section("1〜3. 送りで次のシーンへ／最終ページで待つ／幕と章／見える選択肢が 0 個なら next・あれば選択肢", function () {
      return basics(browser, url);
    });
    await section("4. オートが一本道を通り抜け、選択肢で止まる", function () {
      return autoRun(browser, url);
    });
    await section("5. 既読スキップは最終ページで止まる", function () {
      return skipRun(browser, url);
    });
    await section("6・7. バックログに選択肢の行が入らない／一本道 2 つの先から直前の選択肢へ戻る", function () {
      return logAndRewind(browser, url);
    });
    await section("8. 読んだシーンの数", function () {
      return readCount(browser, url);
    });
    await section("9. 一本道の途中でセーブ → ロード → 再読み込み", function () {
      return saveLoad(browser, url);
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
