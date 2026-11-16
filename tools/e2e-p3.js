#!/usr/bin/env node
/*
 * ver 3.0-p3（GUI・機能アップデート）のブラウザ自動確認（Playwright）
 * ------------------------------------------------------------
 *   node tools/e2e-p3.js [--shots <dir>] [--old <旧版を展開したフォルダ>]...
 *     --old は複数指定できる（例: 3.0-p2 と 2.1）。p3 で作ったデータを旧版で開き、
 *     「読んだシーン n / 20」が変わらないこと・未知の要素が残ること・エラーが出ないことを確かめる。
 *     例: git archive 840f51e | tar -x -C /tmp/p2 && node tools/e2e-p3.js --old /tmp/p2
 *
 * 確認する内容
 *   0. 版表記と ELEMENT_IDS（index.html／game.js がそろっているか。ファイルを直接読む）
 *   A. バックログは読んだページまで／「この選択肢に戻る」は結末を 1 つ見るまで出ない／
 *      結末画面の「最後の選択肢からやり直す」は到達時点で使える／戻した状態が選ぶ直前と一致する
 *   B. クイックバー（5 つ・44px 以上・絵文字なし）／オート／自前の確認ダイアログ（confirm を使わない）／
 *      HUD と設定に BGM の操作が残っている
 *   C. ページ単位の既読（未読の手前で止まるスキップ）／選んだ選択肢の印／既読データの形と旧版との共存
 *   D. 文字の大きさ・ウィンドウの濃さ・見本／全ページがウィンドウに収まる
 *   F. タイトル：縦画面でロゴが顔の帯に重ならない／「つづきから」の再開位置／4 結末すべてで演出が変わる
 *   小さい端末（360×640）での見え方、localStorage のキーが 5 件のまま
 */
"use strict";

var fs = require("fs");
var path = require("path");
var assert = require("assert");
var playwright = require("playwright");
var createServer = require("./preview-server.js").createServer;

var ROOT = path.resolve(__dirname, "..");
var KEYS = ["chrono-tale-save-v1", "chrono-tale-endings-v1", "chrono-tale-slots-v1", "chrono-tale-settings-v1", "chrono-tale-read-v1"];
var SAVE = KEYS[0];
var ENDINGS = KEYS[1];
var SLOTS = KEYS[2];
var SETTINGS = KEYS[3];
var READ = KEYS[4];
var VERSION = "3.0-p3";
var SMALL = { width: 360, height: 640 };
var PORTRAIT = { width: 390, height: 844 };
var LANDSCAPE = { width: 1366, height: 768 };
var BASE_SETTINGS = { textSpeed: 3, skipRead: false, volume: 0.6, muted: true, images: true };
var FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "v2.1-localstorage.json"), "utf8"));
var BASELINE = JSON.parse(fs.readFileSync(path.join(__dirname, "baseline", "v2.1-text.json"), "utf8"));
var STORY = require(path.join(ROOT, "js", "story.js"));
var Stage = require(path.join(ROOT, "js", "stage.js"));

var args = process.argv.slice(2);
var shotsDir = args.indexOf("--shots") !== -1 ? args[args.indexOf("--shots") + 1] : null;
var oldDirs = args.reduce(function (list, a, i) {
  return a === "--old" ? list.concat(args[i + 1]) : list;
}, []);

var checks = 0;
var notes = [];
function ok(cond, msg) {
  checks += 1;
  assert.ok(cond, msg);
}
function same(a, b, msg) {
  checks += 1;
  assert.deepStrictEqual(a, b, msg);
}

function listen(server) {
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () {
      resolve("http://127.0.0.1:" + server.address().port + "/");
    });
  });
}

// ---------- 画面操作 ----------
async function open(browser, url, opts) {
  opts = opts || {};
  var context = await browser.newContext({
    viewport: opts.viewport || PORTRAIT,
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference"
  });
  var page = await context.newPage();
  page.errors = [];
  page.nativeDialogs = [];
  page.on("pageerror", function (e) {
    page.errors.push(String(e));
  });
  page.on("dialog", function (d) {
    page.nativeDialogs.push(d.message());
    d.accept();
  });
  await page.goto(url);
  var storage = Object.assign({}, opts.storage || {});
  if (!(SETTINGS in storage)) storage[SETTINGS] = JSON.stringify(Object.assign({}, BASE_SETTINGS, opts.settings || {}));
  await page.evaluate(function (data) {
    window.localStorage.clear();
    Object.keys(data).forEach(function (k) {
      window.localStorage.setItem(k, data[k]);
    });
  }, storage);
  await page.reload();
  await page.waitForSelector("#title-screen:not([hidden])");
  return page;
}

function store(page, key) {
  return page.evaluate(function (k) {
    var raw = window.localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, key);
}
function setStore(page, key, value) {
  return page.evaluate(
    function (a) {
      window.localStorage.setItem(a[0], JSON.stringify(a[1]));
    },
    [key, value]
  );
}
function dump(page) {
  return page.evaluate(function () {
    var out = {};
    for (var i = 0; i < window.localStorage.length; i++) {
      var k = window.localStorage.key(i);
      out[k] = window.localStorage.getItem(k);
    }
    return out;
  });
}

function view(page) {
  return page.evaluate(function () {
    var name = document.getElementById("speaker-name");
    return {
      title: document.getElementById("scene-title").textContent,
      text: document.getElementById("scene-text").textContent,
      count: document.getElementById("page-count").textContent,
      choosing: !document.getElementById("choice-overlay").hidden,
      ending: !document.getElementById("ending-overlay").hidden,
      skip: !document.getElementById("skip-btn").disabled,
      auto: document.getElementById("auto-btn").getAttribute("aria-pressed") === "true",
      speaker: name && !name.hidden ? name.textContent : ""
    };
  });
}

async function nextPage(page) {
  var before = (await view(page)).count;
  await page.keyboard.press("Enter");
  await page.waitForFunction(function (b) {
    return document.getElementById("page-count").textContent !== b;
  }, before);
}

/** 選択肢（またはエンディング）が出るまで読み進め、通ったページを返す */
async function readScene(page) {
  var seen = [];
  for (;;) {
    var v = await view(page);
    seen.push(v);
    var m = /^(\d+) \/ (\d+)$/.exec(v.count);
    if (!m || m[1] === m[2]) break;
    await nextPage(page);
  }
  return seen;
}

async function choose(page, text) {
  await page.waitForSelector("#choice-overlay:not([hidden]):not(.is-locked)");
  var before = (await view(page)).title;
  var target = typeof text === "number" ? page.locator("#choices .choice").nth(text - 1) : page.locator("#choices .choice", { hasText: text }).first();
  await target.click();
  await page.waitForFunction(function (b) {
    return document.getElementById("scene-title").textContent !== b && document.getElementById("choice-overlay").hidden;
  }, before);
}

async function confirmOpen(page) {
  await page.waitForSelector("#confirm-dialog[open]");
  return page.textContent("#confirm-message");
}
async function confirmOk(page) {
  await page.click("#confirm-ok");
  await page.waitForSelector("#confirm-dialog:not([open])", { state: "attached" });
}
async function confirmCancel(page) {
  await page.click("#confirm-cancel");
  await page.waitForSelector("#confirm-dialog:not([open])", { state: "attached" });
}

async function openLog(page) {
  await page.click("#log-btn");
  await page.waitForSelector("#log-dialog[open]");
  return page.evaluate(function () {
    var list = document.getElementById("log-list");
    return {
      text: list.textContent,
      paras: Array.prototype.map.call(list.querySelectorAll(".log-para"), function (n) {
        var who = n.querySelector(".log-who");
        return who ? n.textContent.slice(who.textContent.length) : n.textContent;
      }),
      choices: list.querySelectorAll(".log-choice").length,
      jumps: list.querySelectorAll(".log-jump").length
    };
  });
}
async function closeDialog(page, id) {
  await page.keyboard.press("Escape");
  await page.waitForSelector("#" + id + ":not([open])", { state: "attached" });
  // 閉じたあと、フォーカスが開いたボタンからメッセージウィンドウへ戻る（close イベント）のを待つ
  await page.waitForFunction(function () {
    var a = document.activeElement;
    return !a || !a.closest || !a.closest(".quickbar, .hud");
  });
}

/** オートセーブに状態を入れて「つづきから」で再開する */
async function resume(browser, url, saved, opts) {
  opts = opts || {};
  var storage = Object.assign({}, opts.storage || {});
  storage[SAVE] = JSON.stringify(Object.assign({ affection: 0, shards: 0, flags: {}, steps: 0, log: [] }, saved));
  var page = await open(browser, url, Object.assign({}, opts, { storage: storage }));
  await page.click("#continue-btn");
  await page.waitForSelector("#game-screen:not([hidden])");
  return page;
}

function rect(page, selector) {
  return page.evaluate(function (sel) {
    var n = document.querySelector(sel);
    if (!n) return null;
    var r = n.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  }, selector);
}

async function shot(page, name) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shotsDir, name + ".png") });
}

function uniqueParas() {
  var set = {};
  Object.keys(BASELINE.texts).forEach(function (id) {
    BASELINE.texts[id].lists.forEach(function (list) {
      list.forEach(function (p) {
        set[p] = true;
      });
    });
  });
  return Object.keys(set);
}

function pageKey(id, text) {
  return id + "#" + Stage.hashText(text);
}
function choiceKey(id, text) {
  return id + ">" + Stage.hashText(text);
}
function pagesOf(id, flags, affection) {
  var scene = STORY.scenes[id];
  var s = { scene: id, affection: affection || 0, shards: 0, flags: flags || {}, steps: 0, log: [] };
  return Stage.pageTexts(typeof scene.text === "function" ? scene.text(s) : scene.text);
}
function countScenes(list) {
  return list.filter(function (k) {
    return !!STORY.scenes[k];
  }).length;
}

var EMOJI = /\p{Extended_Pictographic}/u;

async function section(name, fn) {
  var before = checks;
  await fn();
  console.log("  ✓ " + name + "（" + (checks - before) + " 件）");
}

// ---------- 0. ファイルの整合 ----------
function staticChecks() {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  var js = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
  same((/data-app-version="([^"]+)"/.exec(html) || [])[1], VERSION, "index.html の data-app-version");
  var queries = html.match(/\?v=[\w.-]+(?=")/g) || [];
  same(queries, ["?v=" + VERSION, "?v=" + VERSION, "?v=" + VERSION, "?v=" + VERSION, "?v=" + VERSION], "?v= は 5 か所とも同じ版");
  same((/var VERSION = "([^"]+)"/.exec(js) || [])[1], VERSION, "game.js の VERSION");
  same((html.match(/ver 3\.0-p\d+/g) || []).filter(function (v) { return v !== "ver " + VERSION; }), [], "画面に書いてある版表記");
  var block = /var ELEMENT_IDS = \{([\s\S]*?)\n {2}\};/.exec(js)[1];
  var ids = [];
  block.replace(/:\s*"([^"]+)"/g, function (_, id) {
    ids.push(id);
  });
  ok(ids.length > 60, "ELEMENT_IDS を読めた（" + ids.length + " 件）");
  var missing = ids.filter(function (id) {
    return html.indexOf('id="' + id + '"') === -1;
  });
  same(missing, [], "ELEMENT_IDS の部品が index.html にすべてある");
  // 今回足した部品が ELEMENT_IDS に入っている（古い index.html との混在を検出できる）
  ["quickbar", "auto-btn", "save-btn", "confirm-dialog", "confirm-ok", "ending-retry", "continue-where", "set-font", "set-window", "set-auto", "settings-preview"].forEach(function (id) {
    ok(ids.indexOf(id) !== -1, "ELEMENT_IDS に " + id);
  });
  ok(!/window\.confirm|[^.\w]confirm\(/.test(js), "game.js はブラウザ標準の confirm を使わない");
  ok(!/\balert\(|\bprompt\(/.test(js), "alert / prompt も使わない");
  var storageKeys = (js.match(/"chrono-tale-[a-z-]+v1"/g) || []).map(function (k) { return k.replace(/"/g, ""); });
  same(storageKeys.slice().sort(), KEYS.slice().sort(), "game.js の localStorage キーは既存 5 件のまま");
  notes.push("ELEMENT_IDS " + ids.length + " 件、?v= " + queries.length + " か所");
}

async function run(browser) {
  var server = createServer({});
  var artServer = createServer({ placeholders: true });
  var url = await listen(server);
  var artUrl = await listen(artServer);

  await section("0. 版表記・ELEMENT_IDS・キー名（ファイルの照合）", async function () {
    staticChecks();
    var page = await open(browser, url);
    same(await page.textContent("#app-version"), "ver " + VERSION);
    same(await page.evaluate(function () { return document.querySelectorAll("[role=alert]").length; }), 0, "「古い画面」の案内は出ない");
    await page.context().close();
  });

  // ============================================================
  await section("A-1. バックログは「読んだページまで」", async function () {
    var page = await open(browser, url);
    await page.click("#start-btn");
    var all = pagesOf("awakening", {});
    same(all.length, 4);
    for (var i = 0; i < all.length; i++) {
      var log = await openLog(page);
      same(log.paras, all.slice(0, i + 1), "awakening " + (i + 1) + " ページ目：バックログはそこまで");
      await closeDialog(page, "log-dialog");
      if (i < all.length - 1) await nextPage(page);
    }
    // 保存されるデータは従来どおり全段落（表示だけで絞っている）
    same((await store(page, SAVE)).log, [{ k: "s", title: "止まった草原", paras: all }], "保存形式は変えない");
    // 次のシーンへ進むと、前のシーンは全ページ・いまのシーンは 1 ページ目まで
    await choose(page, 1);
    var meet = pagesOf("meet", { petal: true });
    log = await openLog(page);
    same(log.paras, all.concat(meet.slice(0, 1)), "前のシーンは全部、いまのシーンは 1 ページ目まで");
    await closeDialog(page, "log-dialog");
    // 文字送りの途中でも、次のページは出ない
    await page.context().close();
    page = await open(browser, url, { settings: { textSpeed: 0 } });
    await page.click("#start-btn");
    await page.waitForTimeout(300);
    log = await openLog(page);
    same(log.paras, all.slice(0, 1), "文字送り中も 1 ページ目だけ");
    same(page.errors, []);
    await page.context().close();
  });

  await section("A-2. 「この選択肢に戻る」は結末を 1 つ見るまで出ない（判定は既存の結末データ）", async function () {
    var page = await open(browser, url);
    await page.click("#start-btn");
    var states = {}; // シーンに着いた時点のオートセーブ
    states.awakening = await store(page, SAVE);
    await readScene(page);
    await choose(page, 1);
    states.meet = await store(page, SAVE);
    await readScene(page);
    await choose(page, 1);
    states.explain = await store(page, SAVE);
    await readScene(page);
    await choose(page, 1);
    states.village = await store(page, SAVE);
    same(await store(page, ENDINGS), null, "結末はまだ 1 つも見ていない");
    var log = await openLog(page);
    same([log.choices, log.jumps], [3, 0], "結末を見る前：選択肢の行はあるが「戻る」は無い");
    await closeDialog(page, "log-dialog");

    // シナリオに無い ID だけでは解放されない
    await setStore(page, ENDINGS, ["nonexistent"]);
    log = await openLog(page);
    same(log.jumps, 0, "実在しない結末 ID では解放しない");
    await closeDialog(page, "log-dialog");

    // 既存の結末データに 1 つ入ると解放（どの結末でもよい）
    await setStore(page, ENDINGS, ["bad"]);
    log = await openLog(page);
    same([log.choices, log.jumps], [3, 3], "結末を 1 つ見たあと：各選択肢の行に「この選択肢に戻る」");
    var size = await rect(page, "#log-list .log-jump");
    ok(size.height >= 44, "「戻る」のタップ領域は 44px 以上（" + Math.round(size.height) + "px）");
    await shot(page, "A-backlog-jump-390x844");

    // やめる → 何も変わらない
    await page.locator("#log-list .log-jump").nth(1).click();
    ok((await confirmOpen(page)).indexOf("この選択肢まで戻りますか") === 0, "確認を出す");
    await confirmCancel(page);
    same(await store(page, SAVE), states.village, "やめると状態はそのまま");

    // 2 つ目の選択肢（meet）へ戻る
    await page.locator("#log-list .log-jump").nth(1).click();
    await confirmOpen(page);
    await confirmOk(page);
    await page.waitForSelector("#choice-overlay:not([hidden])");
    var v = await view(page);
    same([v.title, v.count, v.choosing], ["時計塔の少女", "5 / 5", true], "そのシーンの最終ページ＋選択肢に戻る");
    same(await store(page, SAVE), states.meet, "戻した状態＝そのシーンに着いたときの状態（好感度・欠片・フラグ・幕数・ログ）");
    same(await page.evaluate(function () { return document.querySelectorAll("dialog[open]").length; }), 0, "ダイアログは閉じる");
    log = await openLog(page);
    same([log.choices, log.jumps], [1, 1], "戻った先より後ろのログは消える");
    await closeDialog(page, "log-dialog");

    // 別の選択肢を選び直せる
    await choose(page, 2);
    v = await view(page);
    same(v.title, "時の女神リーネ");
    var st = await store(page, SAVE);
    same([st.steps, st.flags.petal, st.log.length], [2, true, 5], "選び直したあとの状態（幕数 2、ログ＝シーン 3＋選択 2）");
    ok(st.affection !== states.explain.affection, "別の選択肢の効果が入る（好感度 " + states.explain.affection + " → " + st.affection + "）");

    // いちばん最初の選択肢まで戻れる
    await openLog(page);
    await page.locator("#log-list .log-jump").first().click();
    await confirmOpen(page);
    await confirmOk(page);
    await page.waitForSelector("#choice-overlay:not([hidden])");
    same(await store(page, SAVE), states.awakening, "最初の選択肢まで戻すと開始時点の状態");
    same(Object.keys(await store(page, SAVE)).sort(), ["affection", "flags", "log", "scene", "shards", "steps"], "セーブの最上位の形は変えない");
    same(page.nativeDialogs, [], "ブラウザ標準の確認窓は出ない");
    same(page.errors, []);
    await page.context().close();
  });

  await section("A-3. 旧データの行（控えなし）には「戻る」を出さない", async function () {
    var storage = Object.assign({}, FIXTURE);
    delete storage[SETTINGS];
    var page = await open(browser, url, { storage: storage });
    same(await store(page, ENDINGS), ["normal"], "旧データに結末 1 つ");
    await page.click("#continue-btn");
    await page.waitForSelector("#game-screen:not([hidden])");
    var log = await openLog(page);
    ok(log.choices >= 5, "旧バックログに選択肢の行がある（" + log.choices + " 行）");
    same(log.jumps, 0, "旧版で選んだ行には出ない");
    await closeDialog(page, "log-dialog");
    var oldChoices = log.choices;
    await readScene(page);
    await choose(page, 1);
    log = await openLog(page);
    same([log.choices, log.jumps], [oldChoices + 1, 1], "新版で選んだ行にだけ出る");
    same(page.errors, []);
    await page.context().close();
  });

  await section("A-4. 結末画面の「最後の選択肢からやり直す」（到達時点で使える）", async function () {
    // 結末を 1 つも見ていない状態から BAD END へ
    var page = await resume(browser, url, { scene: "boss", affection: 0, shards: 3, steps: 12 });
    same(await store(page, ENDINGS), null);
    await readScene(page);
    var before = await store(page, SAVE);
    await choose(page, "剣を抜き");
    same((await view(page)).title, STORY.scenes.end_bad.title);
    // 結末の本文を読んでいる途中：まだ結末画面は出ていない
    same(await page.isVisible("#ending-overlay"), false);
    await readScene(page);
    await page.waitForSelector("#ending-overlay:not([hidden]):not(.is-locked)");
    same(await page.textContent("#ending-name"), "BAD END「止まった世界の旅人」");
    ok(await page.isVisible("#ending-retry"), "初めての結末でも「最後の選択肢からやり直す」が出る");
    same((await page.textContent("#ending-retry")).trim(), "最後の選択肢からやり直す");
    same(await store(page, SAVE), null, "結末ではオートセーブは消えている（従来どおり）");
    var buttons = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll("#ending-box .btn:not([hidden])"), function (b) {
        var r = b.getBoundingClientRect();
        return { text: b.textContent.trim(), h: Math.round(r.height), inView: r.top >= 0 && r.bottom <= window.innerHeight };
      });
    });
    same(buttons.map(function (b) { return b.text; }), ["最後の選択肢からやり直す", "もう一度はじめから", "ロード", "タイトルへ"]);
    ok(buttons.every(function (b) { return b.h >= 44 && b.inView; }), "結末画面のボタンは 44px 以上で画面内");
    await shot(page, "A-ending-retry-390x844");

    await page.click("#ending-retry");
    await page.waitForSelector("#choice-overlay:not([hidden])");
    var v = await view(page);
    same([v.title, v.choosing, v.ending], [STORY.scenes.boss.title, true, false], "直前の選択肢（boss）へ戻る");
    same(await store(page, SAVE), before, "状態は選ぶ直前と同じ。オートセーブも戻る");
    same(await store(page, ENDINGS), ["bad"], "見た結末の記録は残る");
    // 戻ったあと、もう一度選べる（同じ選択でも結末まで進み、また「やり直す」が出る）
    await choose(page, "剣を抜き");
    await readScene(page);
    await page.waitForSelector("#ending-overlay:not([hidden]):not(.is-locked)");
    ok(await page.isVisible("#ending-retry"), "選び直したあとの結末でも使える");
    same(page.errors, []);
    await page.context().close();

    // 小さい端末でも 4 つのボタンが 1 画面に収まる
    page = await resume(browser, url, { scene: "boss", affection: 0, shards: 3, steps: 12 }, { viewport: SMALL });
    await readScene(page);
    await choose(page, "剣を抜き");
    await readScene(page);
    await page.waitForSelector("#ending-overlay:not([hidden]):not(.is-locked)");
    var box = await rect(page, "#ending-box");
    var stage = await rect(page, "#stage");
    ok(box.top >= stage.top - 1 && box.bottom <= stage.bottom + 1, "360×640：結末の枠がステージ内に収まる（" + Math.round(box.top) + "〜" + Math.round(box.bottom) + " / " + Math.round(stage.top) + "〜" + Math.round(stage.bottom) + "）");
    await shot(page, "A-ending-retry-360x640");
    await page.context().close();
  });

  // ============================================================
  await section("B-1. クイックバー（5 つ・下端・44px 以上・SVG と文字ラベル）と HUD", async function () {
    var sizes = [SMALL, PORTRAIT, { width: 430, height: 932 }, { width: 768, height: 1024 }, LANDSCAPE, { width: 844, height: 390 }];
    var page = await open(browser, url, { viewport: SMALL });
    await page.click("#start-btn");
    for (var size of sizes) {
      await page.setViewportSize(size);
      await page.waitForTimeout(350);
      var info = await page.evaluate(function () {
        var bar = document.getElementById("quickbar").getBoundingClientRect();
        var box = document.getElementById("textbox").getBoundingClientRect();
        return {
          bar: { top: bar.top, bottom: bar.bottom },
          textBottom: box.bottom,
          vh: window.innerHeight,
          vw: window.innerWidth,
          btns: Array.prototype.map.call(document.querySelectorAll("#quickbar .qbtn"), function (b) {
            var r = b.getBoundingClientRect();
            var svg = b.querySelector("svg use");
            return {
              id: b.id,
              label: b.textContent.trim(),
              w: r.width,
              h: r.height,
              left: r.left,
              right: r.right,
              icon: svg ? svg.getAttribute("href") : null,
              iconW: b.querySelector("svg").getBoundingClientRect().width
            };
          })
        };
      });
      var tag = size.width + "×" + size.height;
      same(info.btns.map(function (b) { return b.id + ":" + b.label; }), ["log-btn:ログ", "auto-btn:オート", "skip-btn:スキップ", "save-btn:セーブ", "menu-btn:メニュー"], tag + " 並び");
      ok(info.btns.every(function (b) { return b.w >= 44 && b.h >= 44; }), tag + " タップ領域 44px 以上（最小 " + Math.round(Math.min.apply(null, info.btns.map(function (b) { return Math.min(b.w, b.h); }))) + "px）");
      ok(info.btns.every(function (b) { return b.icon && b.icon.indexOf("#i-") === 0 && b.iconW >= 16; }), tag + " SVG アイコン");
      ok(info.btns.every(function (b) { return b.left >= 0 && b.right <= info.vw + 0.5; }), tag + " 画面内");
      ok(Math.abs(info.bar.bottom - info.vh) < 1, tag + " 画面の下端にある");
      ok(info.bar.top >= info.textBottom - 0.5, tag + " メッセージウィンドウの下（重ならない）");
      for (var i = 1; i < info.btns.length; i++) ok(info.btns[i].left >= info.btns[i - 1].right - 0.5, tag + " ボタン同士が重ならない");
      notes.push("クイックバー " + tag + "：ボタン " + Math.round(info.btns[0].w) + "×" + Math.round(info.btns[0].h) + "px");
    }
    await page.setViewportSize(PORTRAIT);

    // クイックバーを押しても読み進めない
    var before = (await view(page)).count;
    await page.evaluate(function () {
      document.getElementById("quickbar").click(); // バーそのもの（ボタンの外。PC 幅では左右に余白がある）
      document.querySelector("#skip-btn").click(); // 押せない状態のボタン
    });
    same((await view(page)).count, before, "クイックバーをタップしても読み進めない");
    same(await page.locator("dialog[open]").count(), 0);

    // 上部 HUD：状態表示＋音量ボタン。ログ・メニューは HUD に無い
    var hud = await page.evaluate(function () {
      var h = document.querySelector(".hud");
      return {
        buttons: Array.prototype.map.call(h.querySelectorAll("button"), function (b) { return b.id; }),
        labels: Array.prototype.map.call(h.querySelectorAll(".hud-label"), function (n) {
          return n.textContent.trim() + ":" + (getComputedStyle(n).display !== "none");
        }),
        shards: h.querySelectorAll("#status-shards svg").length,
        text: h.textContent
      };
    });
    same(hud.buttons, ["mute-btn"], "HUD のボタンは音量だけ（BGM の操作は残す）");
    same(hud.labels, ["欠片:true", "心:true"], "縦画面でも HUD にラベルが出る");
    same(hud.shards, STORY.maxShards, "欠片は SVG で描く");
    await page.click("#hud-shards");
    await page.waitForSelector(".toast");
    same(await page.textContent(".toast"), "時の欠片　0 / 3", "HUD をタップすると説明が出る");
    same((await view(page)).count, before, "HUD をタップしても読み進めない");

    // 音量ボタン（HUD）と設定の音量・ミュートが連動して動く
    same(await page.getAttribute("#mute-btn", "aria-pressed"), "true");
    await page.click("#mute-btn");
    same([await page.getAttribute("#mute-btn", "aria-pressed"), (await store(page, SETTINGS)).muted, await page.getAttribute("#mute-icon", "href")], ["false", false, "#i-sound"], "HUD の音量ボタンで切り替わる");
    await page.keyboard.press("m");
    same([(await store(page, SETTINGS)).muted, await page.getAttribute("#mute-icon", "href")], [true, "#i-mute"], "M キー");
    await page.click("#menu-btn");
    await page.click("#menu-settings");
    ok((await page.isVisible("#set-volume")) && (await page.isVisible("#set-mute")), "設定に BGM 音量・ミュートが残っている");
    same(await page.isChecked("#set-mute"), true);
    await page.uncheck("#set-mute");
    same(await page.getAttribute("#mute-btn", "aria-pressed"), "false", "設定のミュートが HUD に反映");
    await page.fill("#set-volume", "35");
    same((await store(page, SETTINGS)).volume, 0.35, "設定の音量");
    await closeDialog(page, "settings-dialog");

    // 絵文字を操作の表示に使わない（ボタン・メニュー・通知・セーブ一覧）
    await page.click("#save-btn");
    await page.waitForSelector("#saves-dialog[open]");
    await page.locator("#saves-list .save-row", { hasText: "スロット 1" }).locator("button.btn-primary").click();
    var texts = await page.evaluate(function () {
      return Array.prototype.map
        .call(document.querySelectorAll("button, .toast, .save-desc, .modal-title"), function (n) { return n.textContent; })
        .concat(Array.prototype.map.call(document.querySelectorAll("button"), function (n) { return n.getAttribute("aria-label") || ""; }));
    });
    ok(texts.length > 30, "操作の文言を集めた（" + texts.length + " 件）");
    same(texts.filter(function (t) { return EMOJI.test(t); }), [], "ボタン・通知・セーブ一覧に絵文字が無い");
    var noIcon = await page.evaluate(function () {
      return Array.prototype.filter
        .call(document.querySelectorAll("#menu-dialog .menu-list .btn, #ending-box .btn, .qbtn, #mute-btn, #reset-data"), function (b) { return !b.querySelector("svg use"); })
        .map(function (b) { return b.id; });
    });
    same(noIcon, [], "操作ボタンは SVG アイコンつき");
    ok(await page.locator("#saves-list button[aria-label='スロット 1 を削除'] svg").count(), "削除ボタンも SVG");
    same(page.errors, []);
    await page.context().close();
  });

  await section("B-2. オート（3 段階・選択肢／ダイアログ／タブ非表示で止まる）", async function () {
    var page = await open(browser, url, { settings: { autoSpeed: 2 } });
    await page.click("#start-btn");
    same((await view(page)).auto, false, "既定はオフ");
    var t0 = Date.now();
    await page.click("#auto-btn");
    same((await view(page)).auto, true, "オン表示（aria-pressed）");
    // 何も押さずに最後のページまで進み、選択肢で止まる
    await page.waitForFunction(function () { return document.getElementById("page-count").textContent === "2 / 4"; }, null, { timeout: 15000 });
    var first = Date.now() - t0;
    var chars = Array.from(pagesOf("awakening", {})[0]).length;
    ok(first >= 700 + 45 * chars - 150, "待ち時間は文字数に応じる（1 ページ目 " + chars + " 字：" + first + "ms ≥ " + (700 + 45 * chars) + "ms 前後）");
    await page.waitForSelector("#choice-overlay:not([hidden])", { timeout: 30000 });
    await page.waitForTimeout(3500);
    var v = await view(page);
    same([v.title, v.choosing, v.count], ["止まった草原", true, "4 / 4"], "選択肢では止まる（自動では選ばない）");
    same(v.auto, true, "オートの状態は保つ");
    // 選ぶと次のシーンで再開する
    await choose(page, 1);
    await page.waitForFunction(function () { return document.getElementById("page-count").textContent === "2 / 5"; }, null, { timeout: 15000 });
    ok(true, "選んだあと、次のシーンでオートが再開する");

    // ダイアログを開くと止まる（閉じても勝手に再開しない）
    await page.click("#log-btn");
    await page.waitForSelector("#log-dialog[open]");
    same((await view(page)).auto, false, "バックログを開くとオフ");
    await closeDialog(page, "log-dialog");
    var count = (await view(page)).count;
    await page.waitForTimeout(6000);
    same((await view(page)).count, count, "閉じたあとも進まない");
    await page.keyboard.press("a");
    same((await view(page)).auto, true, "A キーでオン");
    await page.click("#menu-btn");
    same((await view(page)).auto, false, "メニューを開くとオフ");
    await closeDialog(page, "menu-dialog");

    // タブが隠れると止まる
    await page.click("#auto-btn");
    same((await view(page)).auto, true);
    await page.evaluate(function () {
      Object.defineProperty(document, "hidden", { configurable: true, get: function () { return true; } });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    same((await view(page)).auto, false, "タブ非表示でオフ");
    await page.evaluate(function () {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    same((await view(page)).auto, false, "タブへ戻っても勝手に再開しない");

    // オート中も手で読み進められる。タイトルへ戻るとオフ
    await page.click("#auto-btn");
    count = (await view(page)).count;
    await nextPage(page);
    same((await view(page)).auto, true, "手で進めてもオートは続く");
    await page.click("#menu-btn");
    await page.click("#menu-title");
    await page.waitForSelector("#title-screen:not([hidden])");
    await page.click("#continue-btn");
    same((await view(page)).auto, false, "タイトルへ戻るとオフ");

    // 速度 3 段階は設定に保存する（既存キーの中）
    await page.click("#menu-btn");
    await page.click("#menu-settings");
    same([await page.inputValue("#set-auto"), await page.textContent("#set-auto-label")], ["2", "はやい"]);
    same(await page.getAttribute("#set-auto", "max"), "2", "3 段階");
    for (var pair of [["0", "ゆっくり"], ["1", "ふつう"], ["2", "はやい"]]) {
      await page.fill("#set-auto", pair[0]);
      same([await page.textContent("#set-auto-label"), (await store(page, SETTINGS)).autoSpeed], [pair[1], Number(pair[0])], "オートの速度 " + pair[1]);
    }
    await closeDialog(page, "settings-dialog");
    same(page.errors, []);
    await page.context().close();

    // 結末画面が出たらオフになり、押せなくなる
    page = await resume(browser, url, { scene: "boss", affection: 0, shards: 3, steps: 12 }, { settings: { autoSpeed: 2 } });
    await readScene(page);
    await choose(page, "剣を抜き");
    await page.click("#auto-btn");
    await page.waitForSelector("#ending-overlay:not([hidden])", { timeout: 60000 });
    same([(await view(page)).auto, await page.isDisabled("#auto-btn"), await page.isDisabled("#save-btn"), await page.isDisabled("#skip-btn")], [false, true, true, true], "結末ではオート・セーブ・スキップは押せない");
    ok((await page.isEnabled("#log-btn")) && (await page.isEnabled("#menu-btn")), "ログとメニューは使える");
    same(page.errors, []);
    await page.context().close();
  });

  await section("B-3. 確認ダイアログ（confirm の 5 か所を自前のモーダルに）", async function () {
    var page = await open(browser, url);
    await page.click("#start-btn");
    await readScene(page);
    await choose(page, 1);

    // (1) セーブの上書き
    await page.click("#save-btn");
    await page.waitForSelector("#saves-dialog[open]");
    var slot1 = page.locator("#saves-list .save-row", { hasText: "スロット 1" });
    await slot1.locator("button.btn-primary").click();
    same(await page.locator("#confirm-dialog[open]").count(), 0, "空きスロットへの保存は確認なし");
    var saved = (await store(page, SLOTS))[1];
    same(saved.state.scene, "meet");
    await page.waitForTimeout(20);
    await slot1.locator("button.btn-primary").click();
    same(await confirmOpen(page), "スロット 1 に上書きしますか？", "(1) 上書きの確認");
    same(await page.evaluate(function () { return document.activeElement.id; }), "confirm-cancel", "既定のフォーカスは「やめる」");
    var size = await page.evaluate(function () {
      return ["confirm-ok", "confirm-cancel"].map(function (id) { return Math.round(document.getElementById(id).getBoundingClientRect().height); });
    });
    ok(size[0] >= 44 && size[1] >= 44, "確認のボタンは 44px 以上");
    await shot(page, "B-confirm-390x844");
    await confirmCancel(page);
    same((await store(page, SLOTS))[1], saved, "やめると上書きしない");
    ok(await page.locator("#saves-dialog[open]").count(), "元のダイアログは開いたまま");
    await slot1.locator("button.btn-primary").click();
    await confirmOpen(page);
    await page.keyboard.press("Escape");
    await page.waitForSelector("#confirm-dialog:not([open])", { state: "attached" });
    same((await store(page, SLOTS))[1], saved, "Esc でも上書きしない");
    await slot1.locator("button.btn-primary").click();
    await confirmOpen(page);
    await confirmOk(page);
    ok((await store(page, SLOTS))[1].savedAt > saved.savedAt, "「上書きする」で保存");
    await closeDialog(page, "saves-dialog");

    // (2) プレイ中のロード
    await readScene(page);
    await choose(page, 1);
    same((await view(page)).title, "時の女神リーネ");
    await page.click("#menu-btn");
    await page.click("#menu-load");
    await page.locator("#saves-list .save-row", { hasText: "スロット 1" }).locator("button", { hasText: "ロード" }).click();
    ok((await confirmOpen(page)).indexOf("ロードしますか？") === 0, "(2) ロードの確認");
    await confirmCancel(page);
    same((await view(page)).title, "時の女神リーネ", "やめるとロードしない");
    await page.locator("#saves-list .save-row", { hasText: "スロット 1" }).locator("button", { hasText: "ロード" }).click();
    await confirmOpen(page);
    await confirmOk(page);
    await page.waitForFunction(function () { return document.getElementById("scene-title").textContent === "時計塔の少女"; });
    same(await page.evaluate(function () { return document.querySelectorAll("dialog[open]").length; }), 0);

    // (3) 最初から
    await page.click("#menu-btn");
    await page.click("#menu-restart");
    ok((await confirmOpen(page)).indexOf("最初からやり直しますか？") === 0, "(3) 最初からの確認");
    await confirmCancel(page);
    same((await view(page)).title, "時計塔の少女", "やめるとやり直さない");
    await page.click("#menu-restart");
    await confirmOpen(page);
    await confirmOk(page);
    await page.waitForFunction(function () { return document.getElementById("scene-title").textContent === "止まった草原"; });

    // (4) スロットの削除
    await page.click("#menu-btn");
    await page.click("#menu-load");
    await page.click("#saves-list button[aria-label='スロット 1 を削除']");
    same(await confirmOpen(page), "スロット 1 のデータを削除しますか？", "(4) 削除の確認");
    await confirmCancel(page);
    ok(!!(await store(page, SLOTS))[1], "やめると消さない");
    await page.click("#saves-list button[aria-label='スロット 1 を削除']");
    await confirmOpen(page);
    await confirmOk(page);
    same((await store(page, SLOTS))[1], undefined, "「削除する」で消える");
    await closeDialog(page, "saves-dialog");

    // (5) 記録の消去
    await page.click("#menu-btn");
    await page.click("#menu-settings");
    await page.click("#reset-data");
    ok((await confirmOpen(page)).indexOf("セーブデータ・見つけたエンディング・既読の記録をすべて消去します。") === 0, "(5) 消去の確認");
    await confirmCancel(page);
    ok((await store(page, READ)).length > 0, "やめると消さない");
    await page.click("#reset-data");
    await confirmOpen(page);
    await confirmOk(page);
    await page.waitForSelector("#title-screen:not([hidden])");
    same([await store(page, SAVE), await store(page, SLOTS), await store(page, READ), await store(page, ENDINGS)], [null, null, null, null], "「消去する」で 4 つの記録が消える");
    ok(!!(await store(page, SETTINGS)), "設定は残る（従来どおり）");
    same(await page.textContent("#scene-rate"), "0 / 20");

    same(page.nativeDialogs, [], "ブラウザ標準の confirm は 1 度も出ない");
    same(page.errors, []);
    await page.context().close();
  });

  // ============================================================
  await section("C-1. ページ単位の既読とスキップ（未読ページの手前で止まる）", async function () {
    // 1 周目：花びらに触れずに meet を読む（4 ページ）
    var page = await open(browser, url);
    await page.click("#start-btn");
    var a = await readScene(page);
    ok(a.every(function (v) { return !v.skip; }), "初めて読むシーンではスキップを押せない");
    await choose(page, 2);
    var m = await readScene(page);
    same(m.length, 4);
    ok(m.every(function (v) { return !v.skip; }));
    var plain = pagesOf("meet", {});
    var petal = pagesOf("meet", { petal: true });
    var read = await store(page, READ);
    same(read.filter(function (k) { return !!STORY.scenes[k]; }), ["awakening", "meet"], "シーン ID は従来どおり入る");
    plain.forEach(function (text) {
      ok(read.indexOf(pageKey("meet", text)) !== -1, "meet のページの記録がある");
    });
    ok(read.every(function (k) { return typeof k === "string" && /^[a-z_]+([#>][0-9a-z]+)?$/.test(k); }), "既読データは文字列の配列（シーン ID／ID#指紋／ID>指紋）");
    ok(read.join("").indexOf("草原") === -1, "本文そのものは保存しない");
    same(read.length, 2 + 4 + 4 + 1, "要素数＝シーン 2＋ページ 8＋選んだ選択肢 1");

    // 2 周目：花びらに触れる。meet の 1 ページ目だけが未読になる
    await page.click("#menu-btn");
    await page.click("#menu-restart");
    await confirmOpen(page);
    await confirmOk(page);
    await page.waitForFunction(function () { return document.getElementById("scene-title").textContent === "止まった草原"; });
    var v = await view(page);
    same([v.count, v.skip], ["1 / 4", true], "読んだシーンではスキップを押せる");
    await page.click("#skip-btn");
    await page.waitForSelector("#choice-overlay:not([hidden])");
    same((await view(page)).count, "4 / 4", "全ページ既読なら最後まで飛んで選択肢が出る");
    await choose(page, 1);
    var expected = petal.map(function (text) { return plain.indexOf(text) !== -1; });
    same(expected, [false, true, true, true, true], "meet（花びらあり）は 1 ページ目だけが新しい段落");
    v = await view(page);
    same([v.count, v.skip, v.text], ["1 / 5", false, petal[0]], "未読のページの上ではスキップを押せない（飛ばさない）");
    await page.evaluate(function () { document.getElementById("skip-btn").click(); });
    same((await view(page)).count, "1 / 5", "無理に押しても動かない");
    await nextPage(page);
    v = await view(page);
    same([v.count, v.skip], ["2 / 5", true], "既読のページに来るとスキップを押せる");
    await page.click("#skip-btn");
    await page.waitForSelector("#choice-overlay:not([hidden])");
    same((await view(page)).count, "5 / 5");
    same(page.errors, []);
    await page.context().close();

    // 途中に未読が挟まる場合：未読の手前（最後の既読ページ）で止まる
    var found = null;
    Object.keys(BASELINE.texts).forEach(function (id) {
      if (found || STORY.scenes[id].ending) return;
      var t = BASELINE.texts[id];
      t.lists.forEach(function (A, ai) {
        t.lists.forEach(function (B, bi) {
          if (found || ai === bi) return;
          var k = B.findIndex(function (p) { return A.indexOf(p) === -1; });
          var allBefore = B.slice(0, k).every(function (p) { return A.indexOf(p) !== -1; });
          if (k >= 2 && k < B.length - 1 && allBefore) found = { id: id, A: A, B: B, k: k, an: t.index.indexOf(ai), bn: t.index.indexOf(bi) };
        });
      });
    });
    ok(!!found, "途中のページだけが変わる組み合わせがシナリオにある");
    function flagsOf(n) {
      var flags = {};
      BASELINE.flags.forEach(function (name, i) {
        if (n & (1 << i)) flags[name] = true;
      });
      return flags;
    }
    same(pagesOf(found.id, flagsOf(found.an)), found.A);
    same(pagesOf(found.id, flagsOf(found.bn)), found.B);
    page = await resume(browser, url, { scene: found.id, flags: flagsOf(found.an), steps: 5 });
    same((await readScene(page)).length, found.A.length);
    var kept = await store(page, READ);
    await page.context().close();
    var storage = {};
    storage[READ] = JSON.stringify(kept);
    page = await resume(browser, url, { scene: found.id, flags: flagsOf(found.bn), steps: 5 }, { storage: storage });
    v = await view(page);
    same([v.count, v.skip], ["1 / " + found.B.length, true]);
    await page.click("#skip-btn");
    await page.waitForFunction(function (c) { return document.getElementById("page-count").textContent === c; }, found.k + " / " + found.B.length);
    v = await view(page);
    same([v.text, v.skip, v.choosing], [found.B[found.k - 1], true, false], "未読ページ（" + (found.k + 1) + " ページ目）の手前で止まる");
    await page.waitForTimeout(400);
    same((await view(page)).count, found.k + " / " + found.B.length, "止まったまま進まない");
    await nextPage(page);
    v = await view(page);
    same([v.text, v.skip], [found.B[found.k], false], "次のタップで未読ページを読める（スキップは押せない）");
    notes.push("未読の手前で止まる確認：" + found.id + "（" + found.B.length + " ページ中 " + (found.k + 1) + " ページ目が未読）");

    // 「一度読んだページは一瞬で表示する」も、ページ単位で効く（未読ページは文字送りする）
    await page.context().close();
    page = await resume(browser, url, { scene: found.id, flags: flagsOf(found.bn), steps: 5 }, { storage: storage, settings: { textSpeed: 0, skipRead: true } });
    await page.waitForTimeout(250);
    same(await page.isVisible("#skip-hint"), false, "既読ページは一瞬で表示（文字送りしない）");
    for (var i = 1; i < found.k; i++) await nextPage(page);
    await nextPage(page);
    await page.waitForTimeout(250);
    same(await page.isVisible("#skip-hint"), true, "未読ページは文字送りする");
    same(page.errors, []);
    await page.context().close();
  });

  await section("C-2. 選んだことのある選択肢の印（NEW は付けない）", async function () {
    var page = await open(browser, url);
    await page.click("#start-btn");
    await readScene(page);
    await page.waitForSelector("#choice-overlay:not([hidden]):not(.is-locked)");
    function marks() {
      return page.evaluate(function () {
        return Array.prototype.map.call(document.querySelectorAll("#choices .choice"), function (b) {
          var m = b.querySelector(".choice-seen");
          return m ? m.textContent : "";
        });
      });
    }
    same(await marks(), ["", ""], "初回は印なし");
    await choose(page, 2);
    var read = await store(page, READ);
    var second = STORY.scenes.awakening.choices[1].text;
    ok(read.indexOf(choiceKey("awakening", second)) !== -1, "選んだ選択肢を既読データに記録");
    await page.click("#menu-btn");
    await page.click("#menu-restart");
    await confirmOpen(page);
    await confirmOk(page);
    await page.waitForFunction(function () { return document.getElementById("scene-title").textContent === "止まった草原"; });
    await page.click("#skip-btn");
    await page.waitForSelector("#choice-overlay:not([hidden]):not(.is-locked)");
    same(await marks(), ["", "選択済"], "選んだことのある側にだけ印");
    ok(await page.locator("#choices .choice").nth(1).locator(".choice-seen svg").count(), "印は SVG のチェック");
    same(await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll("#choices .choice-text"), function (n) { return n.textContent; });
    }), STORY.scenes.awakening.choices.map(function (c) { return c.text; }), "選択肢の文面は変えない");
    await shot(page, "C-choice-mark-390x844");
    await page.context().close();

    // 条件で出現する選択肢：出たときに「NEW」などの印を付けない
    var gated = null;
    Object.keys(STORY.scenes).forEach(function (id) {
      (STORY.scenes[id].choices || []).forEach(function (c) {
        if (!gated && typeof c.requires === "function") {
          var names = String(c.requires).match(/\.flags\.(\w+)/g) || [];
          var flags = {};
          names.forEach(function (n) { flags[n.replace(".flags.", "")] = true; });
          if (c.requires({ flags: flags, affection: 0, shards: 0 }) && !c.requires({ flags: {}, affection: 0, shards: 0 })) gated = { id: id, text: c.text, flags: flags };
        }
      });
    });
    ok(!!gated, "条件つきの選択肢がシナリオにある");
    page = await resume(browser, url, { scene: gated.id, flags: gated.flags, steps: 5 });
    await readScene(page);
    await page.waitForSelector("#choice-overlay:not([hidden]):not(.is-locked)");
    var shown = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll("#choices .choice"), function (b) {
        return { text: b.querySelector(".choice-text").textContent, all: b.textContent, extra: b.children.length };
      });
    });
    var target = shown.filter(function (c) { return c.text === gated.text; })[0];
    ok(!!target, "条件を満たすと選択肢が出る（" + gated.id + "）");
    ok(shown.every(function (c) { return c.extra === 2 && !/NEW|new|新/.test(c.all.replace(c.text, "")); }), "「NEW」などの印は付けない");
    same(page.errors, []);
    await page.context().close();
  });

  await section("C-3. 既読データの互換（旧データの引き継ぎ・「読んだシーン n / 20」）", async function () {
    // v2.1 の実データ：シーン ID が 7 件。タイトルの表示は変わらない
    var storage = Object.assign({}, FIXTURE);
    delete storage[SETTINGS];
    var oldRead = JSON.parse(FIXTURE[READ]);
    same(oldRead.length, 7);
    var page = await open(browser, url, { storage: storage });
    same(await page.textContent("#scene-rate"), "7 / 20", "旧データの読んだシーン数");
    same(await store(page, READ), oldRead, "タイトルを開いただけでは既読データを書き換えない");
    // 旧版で読んだシーン（スロット 1＝meet）は、入ったときの段落構成を既読として引き継ぐ
    await page.click("#title-load-btn");
    await page.locator("#saves-list .save-row", { hasText: "スロット 1" }).locator("button", { hasText: "ロード" }).click();
    await page.waitForSelector("#game-screen:not([hidden])");
    var v = await view(page);
    same([v.title, v.count, v.skip], ["時計塔の少女", "1 / 5", true], "旧版で読んだシーンはスキップできる（従来と同じ）");
    await page.click("#skip-btn");
    await page.waitForSelector("#choice-overlay:not([hidden])");
    var read = await store(page, READ);
    same(read.slice(0, 7), oldRead, "旧データの要素はそのまま先頭に残る");
    same(countScenes(read), 7, "シーン ID の数は変わらない");
    await page.click("#menu-btn");
    await page.click("#menu-title");
    await page.waitForSelector("#title-screen:not([hidden])");
    same(await page.textContent("#scene-rate"), "7 / 20", "ページの記録が増えても「読んだシーン」は 7 / 20 のまま");
    same(page.errors, []);
    await page.context().close();

    // 壊れた要素が混ざっていても落ちない
    storage = {};
    storage[READ] = JSON.stringify(["awakening", 3, null, { a: 1 }, "meet#zzz", "nope", "awakening>abc"]);
    page = await open(browser, url, { storage: storage });
    same(await page.textContent("#scene-rate"), "1 / 20");
    await page.click("#start-btn");
    await readScene(page);
    await choose(page, 1);
    same(page.errors, [], "想定外の要素があってもエラーにならない");
    await page.context().close();
  });

  // ============================================================
  await section("D. 文字の大きさ・ウィンドウの濃さ・見本", async function () {
    var page = await open(browser, url, { viewport: SMALL });
    await page.click("#start-btn");
    function look() {
      return page.evaluate(function () {
        var text = document.getElementById("scene-text");
        var box = document.getElementById("textbox");
        var prev = document.getElementById("preview-text");
        var win = document.querySelector(".settings-preview-window");
        return {
          font: parseFloat(getComputedStyle(text).fontSize),
          family: getComputedStyle(text).fontFamily,
          bg: getComputedStyle(box).backgroundImage,
          prevFont: parseFloat(getComputedStyle(prev).fontSize),
          prevFamily: getComputedStyle(prev).fontFamily,
          prevBg: getComputedStyle(win).backgroundImage,
          choiceVar: getComputedStyle(document.body).getPropertyValue("--story-scale").trim()
        };
      });
    }
    function lastAlpha(bg) {
      var all = bg.match(/rgba?\([^)]*\)/g) || [];
      var parts = all[all.length - 1].replace(/[^\d.,]/g, "").split(",");
      return parts.length > 3 ? Number(parts[3]) : 1;
    }
    var base = await look();
    same(base.font, 16, "標準は従来と同じ大きさ（360px 幅で 16px）");
    same(lastAlpha(base.bg), 0.9, "ウィンドウの濃さ「ふつう」は従来と同じ（下端 0.9）");
    await page.click("#menu-btn");
    await page.click("#menu-settings");
    ok(await page.isVisible("#settings-preview"), "設定に見本がある");
    var pv = await page.evaluate(function () {
      var box = document.getElementById("settings-preview").getBoundingClientRect();
      var text = document.getElementById("preview-text").getBoundingClientRect();
      return { textH: text.height, inside: text.top >= box.top && text.bottom <= box.bottom + 0.5, chars: document.getElementById("preview-text").textContent.length };
    });
    ok(pv.inside && pv.textH >= 28 && pv.chars > 10, "見本の例文が欠けずに見える（高さ " + Math.round(pv.textH) + "px）");
    same([await page.inputValue("#set-font"), await page.textContent("#set-font-label"), await page.inputValue("#set-window"), await page.textContent("#set-window-label")], ["0", "標準", "1", "ふつう"], "既定値");
    same([await page.getAttribute("#set-font", "max"), await page.getAttribute("#set-window", "max")], ["2", "2"], "どちらも 3 段階");
    ok((await page.evaluate(function () { return document.getElementById("settings-preview").style.backgroundImage; })).indexOf("awakening") !== -1, "見本の背景は、いまの場面の背景画像");
    same(base.prevFamily, base.family, "見本は本文と同じ書体");
    var fonts = [];
    for (var f of [["1", "大"], ["2", "特大"]]) {
      await page.fill("#set-font", f[0]);
      var l = await look();
      fonts.push(l.font);
      same(await page.textContent("#set-font-label"), f[1]);
      ok(Math.abs(l.prevFont / base.prevFont - l.font / base.font) < 0.01, "見本も同じ倍率で変わる（" + f[1] + "：" + l.font + "px）");
      same((await store(page, SETTINGS)).fontSize, Number(f[0]), "既存の設定キーに保存");
    }
    ok(base.font < fonts[0] && fonts[0] < fonts[1], "標準 < 大 < 特大（" + [base.font].concat(fonts).join(" / ") + "px）");
    await shot(page, "D-settings-preview-360x640");
    var alphas = [];
    for (var w of [["0", "うすい"], ["1", "ふつう"], ["2", "こい"]]) {
      await page.fill("#set-window", w[0]);
      l = await look();
      alphas.push(lastAlpha(l.bg));
      same(await page.textContent("#set-window-label"), w[1]);
      same(lastAlpha(l.prevBg), lastAlpha(l.bg), "見本のウィンドウも同じ濃さ（" + w[1] + "）");
      same((await store(page, SETTINGS)).windowLevel, Number(w[0]));
    }
    ok(alphas[0] < alphas[1] && alphas[1] < alphas[2], "うすい < ふつう < こい（" + alphas.join(" / ") + "）");
    await closeDialog(page, "settings-dialog");
    // 再読み込みしても設定が残る。既存の項目は壊さない
    await page.reload();
    await page.waitForSelector("#title-screen:not([hidden])");
    same(await page.evaluate(function () { return [document.body.getAttribute("data-font"), document.body.getAttribute("data-window")]; }), ["2", "2"], "再読み込み後も反映");
    var s = await store(page, SETTINGS);
    same([s.textSpeed, s.skipRead, s.muted, s.images, s.volume], [3, false, true, true, 0.6], "既存の設定項目はそのまま");
    same(page.errors, []);
    await page.context().close();

    // 全ページがウィンドウに収まる（文字の大きさ 3 段階 × 画面サイズ）。スクロールしないと読めないページを作らない
    var paras = uniqueParas();
    var sizes = [[320, 568], SMALL, [375, 667], PORTRAIT, [430, 932], [600, 960], [768, 1024], LANDSCAPE, [1920, 1080], [844, 390]].map(function (s) {
      return Array.isArray(s) ? { width: s[0], height: s[1] } : s;
    });
    page = await open(browser, url);
    await page.addStyleTag({ content: "*{transition:none!important;animation:none!important}" });
    await page.click("#start-btn");
    var smallest = null;
    for (var size of sizes) {
      await page.setViewportSize(size);
      for (var level = 0; level < 3; level++) {
        // 横向きスマホの標準サイズは従来から 2 行（今回の対象外）。大・特大は 3 行にしてある
        var r = await page.evaluate(function (a) {
          document.body.setAttribute("data-font", String(a.level));
          var box = document.getElementById("scene-text");
          var over = [];
          a.paras.forEach(function (t) {
            box.textContent = "";
            var p = document.createElement("p");
            p.className = "para";
            p.textContent = t;
            box.appendChild(p);
            if (box.scrollHeight > box.clientHeight + 1) over.push(t.length);
          });
          return { over: over, stage: Math.round(document.getElementById("stage").getBoundingClientRect().height) };
        }, { level: level, paras: paras });
        same(r.over, [], size.width + "×" + size.height + " 文字 " + ["標準", "大", "特大"][level] + "：全 " + paras.length + " 段落がウィンドウに収まる");
        if (size.width === 360) notes.push("360×640 文字 " + ["標準", "大", "特大"][level] + "：ステージ（背景・立ち絵の見える高さ）" + r.stage + "px");
        if (!smallest || r.stage < smallest.stage) smallest = { stage: r.stage, at: size.width + "×" + size.height + " " + ["標準", "大", "特大"][level] };
      }
    }
    notes.push("収まりを確かめた段落 " + paras.length + " 種 × 画面 " + sizes.length + " 種 × 文字 3 段階。ステージが最も狭いのは " + smallest.at + "（" + smallest.stage + "px）");
    await page.context().close();
  });

  // ============================================================
  await section("F-1. 縦画面のタイトル：ロゴが顔の帯に重ならない", async function () {
    // キービジュアル（1344×768）は縦画面では高さいっぱいに表示される。顔（額〜あご）は画像の高さの 17〜35% にある
    var FACE = [0.17, 0.35];
    for (var size of [SMALL, { width: 375, height: 667 }, PORTRAIT, { width: 430, height: 932 }, { width: 768, height: 1024 }]) {
      for (var withSave of [false, true]) {
        var storage = {};
        if (withSave) storage[SAVE] = JSON.stringify({ scene: "campfire", affection: 3, shards: 1, flags: { petal: true }, steps: 6, log: [] });
        var page = await open(browser, url, { viewport: size, storage: storage });
        await page.waitForTimeout(1500);
        var r = await page.evaluate(function () {
          function box(sel) {
            var n = document.querySelector(sel);
            if (!n || getComputedStyle(n).display === "none") return null;
            var b = n.getBoundingClientRect();
            return { top: b.top / innerHeight, bottom: b.bottom / innerHeight };
          }
          var layer = document.querySelector("#bg-layer .bg-img.is-active");
          var scr = document.getElementById("title-screen");
          return {
            emblem: box(".title-emblem"),
            sub: box(".title-sub"),
            main: box(".title-main"),
            lead: box(".title-lead"),
            menu: box(".title-menu"),
            bg: layer ? layer.style.backgroundImage : "",
            scroll: scr.scrollHeight - scr.clientHeight,
            version: box("#app-version")
          };
        });
        var tag = size.width + "×" + size.height + (withSave ? "（つづきからあり）" : "");
        ok(r.bg.indexOf("title.jpg") !== -1, tag + " キービジュアルが出ている");
        ok(r.emblem.bottom <= FACE[0], tag + " 紋章は顔より上（下端 " + Math.round(r.emblem.bottom * 100) + "%）");
        [["sub", r.sub], ["main", r.main], ["lead", r.lead], ["menu", r.menu]].forEach(function (pair) {
          if (pair[1]) ok(pair[1].top >= FACE[1], tag + " " + pair[0] + " は顔より下（上端 " + Math.round(pair[1].top * 100) + "%）");
        });
        ok(r.scroll <= 1, tag + " 1 画面に収まる（はみ出し " + r.scroll + "px）");
        ok(r.version.bottom <= 1.001, tag + " 版表記が画面内");
        if (size === SMALL || size === PORTRAIT) await shot(page, "F-title-" + size.width + "x" + size.height + (withSave ? "-continue" : ""));
        await page.context().close();
      }
    }
    // 横長（PC）は従来の配置のまま：ロゴ左・メニュー右
    var pc = await open(browser, url, { viewport: LANDSCAPE });
    var logo = await rect(pc, ".title-logo");
    var menu = await rect(pc, ".title-menu");
    ok(logo.right <= menu.left, "PC：ロゴは左、メニューは右");
    await shot(pc, "F-title-1366x768");
    await pc.context().close();
  });

  await section("F-2. 「つづきから」に再開位置を出す", async function () {
    var page = await open(browser, url);
    same(await page.isVisible("#continue-btn"), false, "オートセーブが無ければ出ない");
    await page.click("#start-btn");
    await readScene(page);
    await choose(page, 1);
    await readScene(page);
    await choose(page, 1);
    await page.click("#menu-btn");
    await page.click("#menu-title");
    await page.waitForSelector("#title-screen:not([hidden])");
    ok(await page.isVisible("#continue-btn"));
    same((await page.textContent("#continue-btn")).replace(/\s+/g, " ").trim(), "つづきから 第3幕「時の女神リーネ」");
    same(await page.textContent("#continue-where"), "第3幕「時の女神リーネ」", "再開位置（幕とシーン名）");
    ok(await page.isVisible("#continue-where"));
    var w = await page.evaluate(function () {
      var b = document.getElementById("continue-btn").getBoundingClientRect();
      var s = document.getElementById("continue-where").getBoundingClientRect();
      return s.left >= b.left && s.right <= b.right && s.top >= b.top && s.bottom <= b.bottom;
    });
    ok(w, "ボタンの中に収まる");
    await page.click("#continue-btn");
    same((await view(page)).title, "時の女神リーネ", "表示どおりの場所から再開");
    await page.context().close();
    // 旧セーブ（steps が無い v1 形式）でも落ちない
    var storage = {};
    storage[SAVE] = JSON.stringify({ scene: "village", affection: 1, shards: 0, flags: {} });
    page = await open(browser, url, { storage: storage });
    same(await page.textContent("#continue-where"), "第1幕「涙の止まった村」");
    same(page.errors, []);
    await page.context().close();
  });

  await section("F-4. タイトル演出：4 つの結末をすべて見たあとだけ変わる", async function () {
    async function title(endings, opts) {
      var storage = {};
      if (endings) storage[ENDINGS] = JSON.stringify(endings);
      var page = await open(browser, url, Object.assign({ storage: storage }, opts || {}));
      await page.waitForTimeout(400);
      var r = await page.evaluate(function () {
        var min = document.querySelector(".title-hands .hand-min");
        var hour = document.querySelector(".title-hands .hand-hour");
        return {
          flow: document.body.classList.contains("is-timeflow"),
          fx: document.getElementById("fx-layer").getAttribute("data-fx"),
          petals: document.querySelectorAll("#fx-layer .fx-petals").length,
          falling: document.querySelectorAll("#fx-layer .fx-petals-fall").length,
          fallAnim: (function () {
            var p = document.querySelector("#fx-layer .fx");
            return p ? getComputedStyle(p).animationName : "";
          })(),
          min: getComputedStyle(min).animationName,
          hour: getComputedStyle(hour).animationName,
          hands: !!min && !!hour && min.getBoundingClientRect().height > 4,
          count: document.getElementById("ending-count").textContent,
          imgs: Array.prototype.map.call(document.querySelectorAll("#bg-layer .bg-img"), function (n) { return n.style.backgroundImage; }).filter(Boolean)
        };
      });
      r.page = page;
      return r;
    }
    var STOPPED = [false, "petals", "none", "none"];
    var r = await title(null);
    same([r.flow, r.fx, r.min, r.hour], STOPPED, "初回：花びらは宙に留まり、針は止まっている");
    ok(r.hands && r.petals > 0 && r.falling === 0, "文字盤の針（SVG）がある");
    same(r.fallAnim, "hover");
    await r.page.context().close();
    // TRUE END だけでは変わらない
    r = await title(["true"]);
    same([r.flow, r.fx, r.min, r.hour, r.count], STOPPED.concat("1 / 4"), "TRUE END を見ただけでは変わらない");
    await r.page.context().close();
    // 3 つ（TRUE を含む／含まない）でも変わらない
    for (var three of [["true", "normal", "bad"], ["normal", "bad", "another"]]) {
      r = await title(three);
      same([r.flow, r.fx, r.min, r.hour, r.count], STOPPED.concat("3 / 4"), "3 つ（" + three.join("・") + "）では変わらない");
      await r.page.context().close();
    }
    // 実在しない ID で水増ししても変わらない
    r = await title(["true", "normal", "bad", "bogus", "true"]);
    same([r.flow, r.fx], [false, "petals"], "実在しない結末 ID・重複では変わらない");
    await r.page.context().close();
    // 4 つすべて
    r = await title(["another", "bad", "normal", "true"]);
    same([r.flow, r.fx, r.min, r.hour, r.count], [true, "petals-fall", "handMin", "handHour", "4 / 4"], "4 つすべて：花びらが落ち、針が動く");
    ok(r.falling > 0 && r.petals === 0, "花びらは既存の petals-fall");
    same(r.fallAnim, "fall");
    ok(r.imgs.length === 1 && r.imgs[0].indexOf("images/title.jpg") !== -1, "画像は既存のキービジュアルのまま（新しい素材なし）");
    // 針が実際に進む
    var a1 = await r.page.evaluate(function () { return getComputedStyle(document.querySelector(".hand-min")).transform; });
    await r.page.waitForTimeout(1200);
    var a2 = await r.page.evaluate(function () { return getComputedStyle(document.querySelector(".hand-min")).transform; });
    ok(a1 !== a2, "分針の角度が変わっていく");
    await shot(r.page, "F-title-allclear-390x844");
    // ゲームに入って戻っても保たれる。記録を消すと元に戻る
    await r.page.click("#start-btn");
    await r.page.click("#menu-btn");
    await r.page.click("#menu-title");
    await r.page.waitForSelector("#title-screen:not([hidden])");
    same(await r.page.evaluate(function () { return document.getElementById("fx-layer").getAttribute("data-fx"); }), "petals-fall");
    await r.page.click("#title-settings-btn");
    await r.page.click("#reset-data");
    await confirmOpen(r.page);
    await confirmOk(r.page);
    same(await r.page.evaluate(function () { return [document.body.classList.contains("is-timeflow"), document.getElementById("fx-layer").getAttribute("data-fx")]; }), [false, "petals"], "記録を消すと止まった状態に戻る");
    same(r.page.errors, []);
    await r.page.context().close();
    // 動きを減らす設定：花びらは留まったまま（落ちる花びらは見えなくなるため）。エラーにならない
    r = await title(["another", "bad", "normal", "true"], { reducedMotion: true });
    same([r.flow, r.fx], [true, "petals"], "reduced-motion では宙に留まる花びらのまま");
    same(r.page.errors, []);
    await r.page.context().close();

    // 実際に 4 つ目の結末を見てタイトルへ戻ると変わる（記録は既存の結末データ）
    var storage = {};
    storage[ENDINGS] = JSON.stringify(["true", "normal", "another"]);
    var page = await resume(browser, url, { scene: "boss", affection: 0, shards: 3, steps: 12 }, { storage: storage });
    await readScene(page);
    await choose(page, "剣を抜き");
    await readScene(page);
    await page.waitForSelector("#ending-overlay:not([hidden]):not(.is-locked)");
    ok((await page.textContent("#ending-progress")).indexOf("4 / 4") !== -1);
    await page.click("#ending-title");
    await page.waitForSelector("#title-screen:not([hidden])");
    same(await page.evaluate(function () { return [document.body.classList.contains("is-timeflow"), document.getElementById("fx-layer").getAttribute("data-fx")]; }), [true, "petals-fall"], "4 つ目の結末を見てタイトルへ戻ると演出が変わる");
    same(page.errors, []);
    await page.context().close();
  });

  // ============================================================
  await section("小さい端末（360×640）：クイックバー・立ち絵・選択肢の見え方", async function () {
    var page = await open(browser, artUrl, { viewport: SMALL });
    await page.click("#start-btn");
    await readScene(page);
    await choose(page, 1);
    await nextPage(page); // meet 2 ページ目：座った立ち絵
    await page.waitForFunction(function () { return !!document.querySelector("#char-layer .chara.is-active"); });
    await page.waitForTimeout(900);
    var r = await page.evaluate(function () {
      var c = document.querySelector("#char-layer .chara.is-active").getBoundingClientRect();
      var halo = document.querySelector("#char-layer .chara.is-active .chara-halo").getBoundingClientRect();
      var text = document.getElementById("textbox").getBoundingClientRect();
      var hud = document.querySelector(".hud").getBoundingClientRect();
      var bar = document.getElementById("quickbar").getBoundingClientRect();
      var inner = document.querySelector(".textbox-inner").getBoundingClientRect();
      return { chara: { top: c.top, left: c.left, right: c.right }, haloY: halo.top + halo.height / 2, textTop: text.top, lineTop: inner.top, hudBottom: hud.bottom, barTop: bar.top, barBottom: bar.bottom };
    });
    ok(r.chara.left >= 0 && r.chara.right <= 360, "立ち絵が横にはみ出さない");
    ok(r.barBottom <= 640.5 && r.barTop >= r.lineTop, "クイックバーは最下部");
    ok(r.haloY > r.hudBottom && r.haloY < r.lineTop, "座りポーズでも、頭（光輪の中心 y=" + Math.round(r.haloY) + "）は HUD（" + Math.round(r.hudBottom) + "）とウィンドウ上辺（" + Math.round(r.lineTop) + "）の間に見える");
    await shot(page, "S-meet-sit-360x640");
    await readScene(page);
    await choose(page, 1);
    await page.waitForTimeout(900);
    r = await page.evaluate(function () {
      var halo = document.querySelector("#char-layer .chara.is-active .chara-halo").getBoundingClientRect();
      return { haloY: halo.top + halo.height / 2, lineTop: document.querySelector(".textbox-inner").getBoundingClientRect().top, hudBottom: document.querySelector(".hud").getBoundingClientRect().bottom };
    });
    ok(r.haloY > r.hudBottom && r.haloY < r.lineTop, "立ちポーズの頭も見える（y=" + Math.round(r.haloY) + "）");
    await shot(page, "S-explain-stand-360x640");
    await page.context().close();

    // 選択肢：シナリオで最も選択肢が多い場面でも、全部がステージ内に見えて、ウィンドウやクイックバーと重ならない
    var most = Object.keys(STORY.scenes).reduce(function (best, id) {
      var n = (STORY.scenes[id].choices || []).length;
      return n > best.n ? { id: id, n: n } : best;
    }, { id: null, n: 0 });
    var flags = {};
    (STORY.scenes[most.id].choices || []).forEach(function (c) {
      (String(c.requires || "").match(/\.flags\.(\w+)/g) || []).forEach(function (n) { flags[n.replace(".flags.", "")] = true; });
    });
    for (var level of [0, 2]) {
      page = await resume(browser, url, { scene: most.id, flags: flags, affection: 13, shards: 3, steps: 8 }, { viewport: SMALL, settings: { fontSize: level } });
      await readScene(page);
      await page.waitForSelector("#choice-overlay:not([hidden]):not(.is-locked)");
      await page.waitForTimeout(900);
      var c = await page.evaluate(function () {
        var stage = document.getElementById("stage").getBoundingClientRect();
        var text = document.querySelector(".textbox-inner").getBoundingClientRect();
        var bar = document.getElementById("quickbar").getBoundingClientRect();
        var ov = document.getElementById("choice-overlay");
        return {
          stage: { top: stage.top, bottom: stage.bottom },
          textTop: text.top,
          barTop: bar.top,
          scroll: ov.scrollHeight - ov.clientHeight,
          list: Array.prototype.map.call(document.querySelectorAll("#choices .choice"), function (b) {
            var q = b.getBoundingClientRect();
            return { top: q.top, bottom: q.bottom, h: q.height, left: q.left, right: q.right };
          })
        };
      });
      var tag = "360×640 文字" + ["標準", "", "特大"][level] + "（" + most.id + "・選択肢 " + c.list.length + " 個）";
      ok(c.list.length >= 4, tag + " 選択肢が 4 個以上の場面で確認");
      ok(c.list.every(function (b) { return b.h >= 44; }), tag + " 選択肢のタップ領域 44px 以上");
      ok(c.list.every(function (b) { return b.left >= 0 && b.right <= 360; }), tag + " 横にはみ出さない");
      if (level === 0) {
        ok(c.list.every(function (b) { return b.top >= c.stage.top - 0.5 && b.bottom <= c.stage.bottom + 0.5; }), tag + " 全部がステージ内に見える（スクロール不要）");
        ok(c.scroll <= 1, tag + " スクロールなし");
      } else {
        // 特大では入りきらないことがある。その場合も枠の中でスクロールでき、ウィンドウやクイックバーには重ならない
        notes.push(tag + "：はみ出し " + c.scroll + "px（選択肢の枠の中でスクロール）");
      }
      ok(c.stage.bottom <= c.barTop + 0.5, tag + " 選択肢の枠はクイックバーに重ならない");
      await shot(page, "S-choices-" + (level ? "xl-" : "") + "360x640");
      await page.context().close();
    }
  });

  await section("localStorage のキーは既存 5 件のまま（全機能を使ったあと）", async function () {
    var page = await open(browser, url);
    await page.click("#start-btn");
    await page.click("#auto-btn");
    await readScene(page);
    await choose(page, 1);
    await page.click("#save-btn");
    await page.locator("#saves-list .save-row", { hasText: "スロット 2" }).locator("button.btn-primary").click();
    await closeDialog(page, "saves-dialog");
    await page.click("#menu-btn");
    await page.click("#menu-settings");
    await page.fill("#set-font", "1");
    await page.fill("#set-window", "0");
    await page.fill("#set-auto", "0");
    await closeDialog(page, "settings-dialog");
    await setStore(page, ENDINGS, ["bad"]);
    await openLog(page);
    await page.locator("#log-list .log-jump").first().click();
    await confirmOpen(page);
    await confirmOk(page);
    await choose(page, 2);
    var data = await dump(page);
    same(Object.keys(data).filter(function (k) { return KEYS.indexOf(k) === -1; }), [], "既存 5 件以外のキーを作らない");
    same(Object.keys(data).sort(), KEYS.slice().sort(), "5 件すべて従来の名前");
    same(await page.evaluate(function () { return Object.keys(window.sessionStorage); }), [], "sessionStorage も増やさない");
    var st = JSON.parse(data[SAVE]);
    same(Object.keys(st).sort(), ["affection", "flags", "log", "scene", "shards", "steps"], "オートセーブの形");
    ok(st.log.every(function (e) { return e.k === "c" ? typeof e.text === "string" : Array.isArray(e.paras) && e.paras.every(function (p) { return typeof p === "string"; }); }), "バックログの形（paras は文字列の配列、選択肢は text）");
    same(Object.keys(JSON.parse(data[SLOTS])[2]).sort(), ["savedAt", "state"], "スロットの形");
    same(Object.keys(JSON.parse(data[SETTINGS])).sort(), ["autoSpeed", "effects", "fontSize", "images", "muted", "skipRead", "textSpeed", "volume", "windowLevel"], "設定は既存キーの中に項目を足しただけ");
    same(page.errors, []);
    var p3Storage = data;
    var p3Rate = countScenes(JSON.parse(data[READ]));
    await page.context().close();

    // ---- 旧版で開く（--old を指定したとき）----
    for (var dir of oldDirs) {
      var oldServer = createServer({ root: dir });
      var oldUrl = await listen(oldServer);
      var old = await open(browser, oldUrl, { storage: p3Storage, viewport: LANDSCAPE });
      var ver = await old.evaluate(function () { return document.documentElement.getAttribute("data-app-version"); });
      ok(ver !== VERSION, "旧版（ver " + ver + "）で開いた");
      var before = JSON.parse(p3Storage[READ]);
      ok(before.some(function (k) { return k.indexOf("#") !== -1; }) && before.some(function (k) { return k.indexOf(">") !== -1; }), "p3 の既読データに新しい形式の要素がある");
      same(await old.textContent("#scene-rate"), p3Rate + " / 20", "ver " + ver + "：「読んだシーン」は p3 と同じ（未知の要素を数えない）");
      // つづきから → バックログ → 1 シーン読んで選ぶ
      await old.click("#continue-btn");
      await old.waitForSelector("#game-screen:not([hidden])");
      await old.keyboard.press("l");
      await old.waitForSelector("#log-dialog[open]");
      var text = await old.textContent("#log-list");
      ok(text.indexOf("[object") === -1 && text.indexOf("undefined") === -1, "ver " + ver + "：バックログが崩れない（控え s を無視する）");
      await old.keyboard.press("Escape");
      for (;;) {
        var cnt = await old.textContent("#page-count");
        var m = /^(\d+) \/ (\d+)$/.exec(cnt);
        if (!m || m[1] === m[2]) break;
        await old.keyboard.press("Enter");
        await old.waitForFunction(function (b) { return document.getElementById("page-count").textContent !== b; }, cnt);
      }
      await old.waitForSelector("#choice-overlay:not([hidden]):not(.is-locked)");
      await old.locator("#choices .choice").first().click();
      await old.waitForTimeout(500);
      var after = await store(old, READ);
      same(after.filter(function (k) { return before.indexOf(k) !== -1; }), before, "ver " + ver + "：旧版で遊んでも p3 の要素は消えず、順序も変わらない");
      ok(after.slice(before.length).every(function (k) { return !!STORY.scenes[k]; }), "ver " + ver + "：旧版が足すのはシーン ID だけ");
      var oldRate = countScenes(after);
      same(old.errors, [], "ver " + ver + "：スクリプトエラーなし");
      var mixed = await dump(old);
      await old.context().close();
      oldServer.close();
      // 旧版で遊んだデータを p3 へ戻す
      var back = await open(browser, url, { storage: mixed });
      same(await back.textContent("#scene-rate"), oldRate + " / 20", "ver " + ver + " → p3：読んだシーン数を引き継ぐ");
      await back.click("#continue-btn");
      await back.waitForSelector("#game-screen:not([hidden])");
      await readScene(back);
      same(back.errors, [], "ver " + ver + " → p3：エラーなし");
      await back.context().close();
      notes.push("旧版 ver " + ver + "：読んだシーン " + p3Rate + " / 20 のまま、p3 の要素 " + before.length + " 件を保持");
    }
  });

  server.close();
  artServer.close();
}

(async function () {
  var browser = await playwright.chromium.launch();
  try {
    await run(browser);
    console.log("\nOK: " + checks + " 件の確認に合格");
    notes.forEach(function (n) {
      console.log("  " + n);
    });
    if (!oldDirs.length) console.log("  （旧版での確認は --old <フォルダ> を付けたときだけ行う）");
  } catch (e) {
    console.error("\nNG: " + (e && e.stack ? e.stack : e));
    process.exitCode = 1;
  } finally {
    await browser.close();
    process.exit();
  }
})();
