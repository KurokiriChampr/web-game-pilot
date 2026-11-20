#!/usr/bin/env node
/*
 * ver 3.0-p4（汎用化：3 人同時表示・長編規模・エンジンと作品の分離）のブラウザ自動確認（Playwright）
 * ------------------------------------------------------------
 *   node tools/e2e-p4.js [--old <3.0-p3 を展開したフォルダ>] [--shots <dir>]
 *     --old を付けると、本作の画面を旧版（3.0-p3）と 1 画素ずつ比べ、見た目が変わっていないことを確かめる。
 *     例: git archive 5f199dd | tar -x -C /tmp/p3 && node tools/e2e-p4.js --old /tmp/p3
 *
 * 確認する内容
 *   0. 境界：エンジンのファイルに作品固有の語が無い／作品設定が無いと始めない（保存キーを作らない）
 *   1. 本作：見た目と文言が 3.0-p3 と同じ（--old のとき）。保存キーは 5 件のまま
 *   2. 3 人同時表示（検証用の別作品 tools/fixtures/trio）：位置・話者の強調・減光・押し出し・5 つの画面サイズ
 *   3. 別作品としての差し替え：題名・用語・HUD・スロット数・保存キーの接頭辞
 *   4. 長編規模（生成した 40 章 802 シーン）：読み込み時間・既読 6 千件・章の呼び名・バックログとセーブの上限
 */
"use strict";

var fs = require("fs");
var path = require("path");
var assert = require("assert");
var playwright = require("playwright");
var createServer = require("./preview-server.js").createServer;
var loadWork = require("./lib/load-work.js").loadWork;
var buildLong = require("./fixtures/long/gen.js").build;

var ROOT = path.resolve(__dirname, "..");
var TRIO = path.join(__dirname, "fixtures", "trio");
var KEYS5 = ["chrono-tale-endings-v1", "chrono-tale-read-v1", "chrono-tale-save-v1", "chrono-tale-settings-v1", "chrono-tale-slots-v1"];
var VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 844, height: 390 }
];

var args = process.argv.slice(2);
var argOf = function (name) {
  return args.indexOf(name) !== -1 ? args[args.indexOf(name) + 1] : null;
};
var oldDir = argOf("--old");
var shotsDir = argOf("--shots");

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
async function open(browser, url, opts) {
  opts = opts || {};
  var context = await browser.newContext({
    viewport: opts.viewport || VIEWPORTS[1],
    deviceScaleFactor: 1,
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference"
  });
  var page = await context.newPage();
  page.errors = [];
  page.on("pageerror", function (e) {
    page.errors.push(e.message);
  });
  page.on("console", function (m) {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.errors.push(m.text());
  });
  if (opts.storage) {
    await page.addInitScript(function (data) {
      if (window.sessionStorage.getItem("__seeded")) return;
      window.sessionStorage.setItem("__seeded", "1");
      Object.keys(data).forEach(function (k) {
        window.localStorage.setItem(k, typeof data[k] === "string" ? data[k] : JSON.stringify(data[k]));
      });
    }, opts.storage);
  }
  if (opts.freeze) {
    // 画面の比較用：動き・粒子・版表記を止める／隠す（旧版と新版に同じものを入れる）
    await page.addInitScript(function () {
      document.addEventListener("DOMContentLoaded", function () {
        var style = document.createElement("style");
        style.textContent =
          "*,*::before,*::after{animation:none!important;transition:none!important}" +
          "#fx-layer,#scene-banner,#app-version,#settings-version,.toasts{visibility:hidden!important}";
        document.head.appendChild(style);
      });
    });
  }
  await page.goto(url);
  return page;
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
function pageNo(page) {
  return page.evaluate(function () {
    return parseInt(document.getElementById("page-count").textContent, 10) || 1;
  });
}
async function toPage(page, n) {
  for (var guard = 0; guard < 60 && (await pageNo(page)) < n; guard++) await page.keyboard.press("Enter");
  same(await pageNo(page), n, n + " ページ目へ進んだ");
}
/** そのシーンを最後まで読み、選択肢が押せるようになるまで待つ */
async function toChoices(page) {
  for (var guard = 0; guard < 80; guard++) {
    if (await page.evaluate(function () { return !document.getElementById("choice-overlay").hidden || !document.getElementById("ending-overlay").hidden; })) break;
    await page.keyboard.press("Enter");
  }
  await page.waitForFunction(function () {
    var c = document.getElementById("choice-overlay");
    var e = document.getElementById("ending-overlay");
    return (!c.hidden && !c.classList.contains("is-locked")) || (!e.hidden && !e.classList.contains("is-locked"));
  });
}
async function choose(page, n) {
  await toChoices(page);
  var before = await page.textContent("#scene-title");
  await page.keyboard.press(String(n));
  await page.waitForFunction(function (t) {
    return document.getElementById("choice-overlay").hidden && document.getElementById("scene-title").textContent !== t;
  }, before);
}
/** 表示中の立ち絵（退場のフェード中のものは除く） */
function charas(page) {
  return page.evaluate(function () {
    return Array.prototype.map.call(document.querySelectorAll("#char-layer .chara.is-active"), function (n) {
      var r = n.getBoundingClientRect();
      var cs = getComputedStyle(n);
      return {
        id: n.getAttribute("data-id"),
        pos: n.getAttribute("data-pos"),
        speaker: n.classList.contains("is-speaker"),
        dim: n.classList.contains("is-dim"),
        z: cs.zIndex,
        filter: cs.filter,
        scale: cs.scale,
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height)
      };
    }).sort(function (a, b) {
      return a.left + a.right - (b.left + b.right);
    });
  });
}
async function settle(page, ms) {
  await page.waitForFunction(function () {
    return Array.prototype.every.call(document.querySelectorAll("#char-layer .chara"), function (n) {
      return n.classList.contains("is-active") || !n.querySelector("img").getAttribute("src");
    });
  });
  await page.waitForTimeout(ms || 900);
}

// ---------- 0. 境界 ----------
async function boundaryChecks(browser) {
  ["game.js", "assets.js", "stage.js", "state.js"].forEach(function (name) {
    var src = fs.readFileSync(path.join(ROOT, "js", name), "utf8");
    var hits = src.match(/chrono-tale|刻の女神|リーネ|rine|時の欠片|女神の心/g) || [];
    same(hits, [], "js/" + name + " に作品固有の語が無い");
  });
  var work = require(path.join(ROOT, "js", "work.js"));
  same(work.id, "chrono-tale", "本作の作品 ID（保存キーの接頭辞）");
  var engineCss = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  same((engineCss.match(/theme-[a-z-]+/g) || []).filter(function (t) { return t !== "theme-title"; }), [], "シーンのテーマ（配色）は css/work.css にあり、css/style.css には無い");

  // 作品設定を読めないとき：ゲームを始めず、保存キーも作らない
  var server = createServer({ hide: /^js\/work\.js$/ });
  var url = await listen(server);
  var page = await open(browser, url);
  await page.waitForSelector('[role="alert"]');
  ok(/再読み込み/.test(await page.textContent('[role="alert"]')), "作品設定が無いと、案内を出して止まる");
  same(Object.keys(await dump(page)), [], "保存キーを 1 つも作らない");
  await page.context().close();
  server.close();
}

// ---------- 1. 本作は 3.0-p3 と同じ見た目 ----------
async function sameAsOld(browser, newUrl, oldUrl) {
  var STORY = require(path.join(ROOT, "js", "story.js"));
  var sceneIds = Object.keys(STORY.scenes).filter(function (id) {
    return !STORY.scenes[id].ending;
  });
  var settings = { textSpeed: 3, skipRead: false, volume: 0.6, muted: true, images: true };
  var shots = 0;
  var texts = 0;

  async function capture(url, viewport, storage, steps) {
    var page = await open(browser, url, { viewport: viewport, storage: storage, reducedMotion: true, freeze: true });
    var out = [];
    for (var i = 0; i < steps.length; i++) {
      await steps[i](page);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(250);
      out.push({
        png: await page.screenshot(),
        text: await page.evaluate(function () {
          var v = /ver [\w.-]+/g;
          return document.body.innerText.replace(v, "ver X") + "\n" + document.title + "\n" +
            Array.prototype.map.call(document.querySelectorAll("[aria-label],[title]"), function (n) {
              return (n.getAttribute("aria-label") || "") + "|" + (n.getAttribute("title") || "");
            }).join("\n");
        })
      });
    }
    var keys = Object.keys(await dump(page)).sort();
    same(page.errors, [], "スクリプトエラーなし（" + url + "）");
    await page.context().close();
    return { shots: out, keys: keys };
  }
  async function compare(label, viewport, storage, steps) {
    var a = await capture(oldUrl, viewport, storage, steps);
    var b = await capture(newUrl, viewport, storage, steps);
    for (var i = 0; i < steps.length; i++) {
      same(b.shots[i].text, a.shots[i].text, label + " 手順 " + (i + 1) + "：文言と読み上げ用のラベルが旧版と同じ");
      texts += 1;
      var equal = a.shots[i].png.equals(b.shots[i].png);
      if (!equal && shotsDir) {
        fs.writeFileSync(path.join(shotsDir, "diff-" + label + "-" + i + "-old.png"), a.shots[i].png);
        fs.writeFileSync(path.join(shotsDir, "diff-" + label + "-" + i + "-new.png"), b.shots[i].png);
      }
      ok(equal, label + " 手順 " + (i + 1) + "（" + viewport.width + "×" + viewport.height + "）：画面が旧版と 1 画素も違わない");
      shots += 1;
    }
    same(b.keys, a.keys, label + "：作られる保存キーが旧版と同じ");
  }

  var titleSteps = [
    async function () {},
    async function (page) { await page.click("#title-settings-btn"); },
    async function (page) { await page.keyboard.press("Escape"); await page.click("#title-load-btn"); }
  ];
  var endings = ["true", "normal"];
  for (var v = 0; v < 2; v++) {
    var viewport = VIEWPORTS[v === 0 ? 1 : 3];
    await compare("タイトル", viewport, { "chrono-tale-settings-v1": settings, "chrono-tale-endings-v1": endings }, titleSteps);
    var list = v === 0 ? sceneIds : sceneIds.filter(function (_, i) { return i % 4 === 1; });
    for (var i = 0; i < list.length; i++) {
      var id = list[i];
      var save = { scene: id, affection: 6, shards: 2, flags: { petal: true, bread: true, promise: true }, steps: 3 + i, log: [] };
      await compare("シーン " + id, viewport, { "chrono-tale-settings-v1": settings, "chrono-tale-save-v1": save, "chrono-tale-endings-v1": endings }, [
        async function (page) { await page.click("#continue-btn"); },
        async function (page) { await page.keyboard.press("Enter"); },
        async function (page) { await toChoices(page); },
        async function (page) { await page.keyboard.press("l"); },
        async function (page) { await page.keyboard.press("Escape"); await page.click("#menu-btn"); },
        async function (page) { await page.click("#menu-load"); }
      ]);
    }
  }
  // 画像を表示しない設定（テーマ色のグラデーションと星空だけになる＝配色を css/work.css へ移した影響が出る画面）
  var noImages = { textSpeed: 3, skipRead: false, volume: 0.6, muted: true, images: false };
  for (var n = 0; n < sceneIds.length; n++) {
    await compare("画像なし " + sceneIds[n], VIEWPORTS[1], { "chrono-tale-settings-v1": noImages, "chrono-tale-save-v1": { scene: sceneIds[n], affection: 2, shards: 1, flags: {}, steps: n, log: [] } }, [
      async function (page) { await page.click("#continue-btn"); },
      async function (page) { await toChoices(page); }
    ]);
  }
  await compare("画像なし 結末", VIEWPORTS[3], { "chrono-tale-settings-v1": noImages, "chrono-tale-save-v1": { scene: "sacrifice", affection: 9, shards: 3, flags: { petal: true, bread: true, promise: true, melody: true }, steps: 11, log: [] } }, [
    async function (page) { await page.click("#continue-btn"); },
    async function (page) { await choose(page, 1); },
    async function (page) { await toChoices(page); }
  ]);
  // 結末まで（sacrifice から 1 つ目の選択肢）と、小さい端末
  var toEnd = { scene: "sacrifice", affection: 9, shards: 3, flags: { petal: true, bread: true, promise: true, melody: true }, steps: 11, log: [] };
  await compare("結末", VIEWPORTS[0], { "chrono-tale-settings-v1": settings, "chrono-tale-save-v1": toEnd }, [
    async function (page) { await page.click("#continue-btn"); },
    async function (page) { await choose(page, 1); },
    async function (page) { await toChoices(page); }
  ]);
  notes.push("旧版（3.0-p3）との比較：画面 " + shots + " 枚が完全一致、文言 " + texts + " 件が一致");
}

// ---------- 2・3. 3 人同時表示（検証用の別作品） ----------
async function trioChecks(browser, url) {
  var storage = { "fixture-trio-settings-v1": { textSpeed: 3, muted: true } };
  var dimmed = function (c) { return /brightness\(0\.6\)/.test(c.filter); };

  for (var v = 0; v < VIEWPORTS.length; v++) {
    var vp = VIEWPORTS[v];
    var label = vp.width + "×" + vp.height;
    var page = await open(browser, url, { viewport: vp, storage: storage });
    if (v === 0) {
      // 別作品としての差し替え（題名・用語）
      same(await page.title(), "三人の検証", "題名（タブ）");
      same(await page.evaluate(function () { return document.getElementById("title-main").innerHTML; }), "三人の<br>検証", "ロゴ");
      same(await page.textContent("#title-sub"), "エンジン検証用データ");
      same(await page.textContent("#ending-count"), "0 / 1");
      same(await page.textContent("#scene-rate"), "0 / 3");
    }
    await page.click("#start-btn");
    await toPage(page, 2);
    await settle(page);
    var one = await charas(page);
    same(one.map(function (c) { return c.id + "@" + c.pos; }), ["aoi@center"], label + "：位置の指定なしの 1 人目は中央");
    ok(Math.abs((one[0].left + one[0].right) / 2 - vp.width / 2) <= 2, label + "：1 人のときは画面の中央");
    same([one[0].z, one[0].scale], ["auto", "none"], label + "：1 人のときは重なり順も大きさも従来どおり");
    var soloHeight = one[0].height;

    await toPage(page, 3);
    await settle(page);
    var two = await charas(page);
    same(two.map(function (c) { return c.id + "@" + c.pos; }), ["beni@left", "aoi@center"], label + "：2 人目は空いている左へ");
    same(two.map(function (c) { return [c.speaker, c.dim]; }), [[true, false], [false, true]], label + "：話者ベニを強調、アオイを減光");

    await toPage(page, 4);
    await settle(page);
    var three = await charas(page);
    same(three.map(function (c) { return c.id + "@" + c.pos; }), ["beni@left", "aoi@center", "sui@right"], label + "：3 人が左・中央・右に並ぶ");
    same(await page.getAttribute("#char-layer", "data-count"), "3");
    same(three.filter(function (c) { return c.dim || c.speaker || dimmed(c); }).length, 0, label + "：地の文では 3 人とも同じ明るさ・強調なし");
    // 並びが破綻していないこと
    var stage = await page.evaluate(function () {
      return { hud: document.querySelector(".hud").getBoundingClientRect().bottom, box: document.getElementById("textbox").getBoundingClientRect().top };
    });
    three.forEach(function (c, i) {
      var center = (c.left + c.right) / 2;
      var visible = Math.min(c.right, vp.width) - Math.max(c.left, 0);
      ok(center > 0 && center < vp.width, label + "：" + c.id + " の中心が画面内");
      ok(visible >= c.width * 0.6, label + "：" + c.id + " は横幅の 6 割以上が画面内（" + Math.round((visible / c.width) * 100) + "%）");
      // 顔のあたり（立ち絵の上から 2 割の位置）が、メッセージウィンドウより上に見えている
      ok(c.top + c.height * 0.2 < stage.box - 8, label + "：" + c.id + " の顔がメッセージウィンドウより上にある");
      if (i > 0) {
        var gap = center - (three[i - 1].left + three[i - 1].right) / 2;
        ok(gap >= c.width * 0.4, label + "：隣どうしの中心が、立ち絵の幅の 4 割以上離れている（" + Math.round(gap) + "px／幅 " + c.width + "px）");
      }
    });
    if (v === 0) {
      // いちばん厳しい条件（360×640 で文字「特大」＝ウィンドウが最も高い）でも、3 人の顔がウィンドウの上に出ている
      await page.evaluate(function () { document.body.setAttribute("data-font", "2"); });
      var bigBox = await page.evaluate(function () { return document.getElementById("textbox").getBoundingClientRect().top; });
      three.forEach(function (c) {
        ok(c.top + c.height * 0.2 < bigBox, label + " 文字特大：" + c.id + " の顔がウィンドウより上（顔の下端 " + Math.round(c.top + c.height * 0.2) + " ／ウィンドウ上端 " + Math.round(bigBox) + "）");
      });
      await page.evaluate(function () { document.body.setAttribute("data-font", "0"); });
    }
    ok(three[1].height <= soloHeight, label + "：3 人のときは 1 人のときより大きくならない");
    ok(Math.abs(three[2].height / three[1].height - 0.9) < 0.02, label + "：manifest の scale 0.9 が背丈に効く（スイ）");
    notes.push(label + "：3 人の立ち絵 高さ " + three[1].height + "px（1 人のとき " + soloHeight + "px）、中心 x＝" +
      three.map(function (c) { return Math.round((c.left + c.right) / 2); }).join(" / ") + "、顔の位置 y≒" + Math.round(three[1].top + three[1].height * 0.12) + "（ウィンドウ上端 " + Math.round(stage.box) + "）");

    await toPage(page, 5);
    await settle(page, 500);
    var s5 = await charas(page);
    same(s5.map(function (c) { return [c.id, c.speaker, c.dim, c.z]; }), [["beni", false, true, "auto"], ["aoi", true, false, "2"], ["sui", false, true, "auto"]], label + "：話者アオイが手前、ほかの 2 人は減光");
    ok(dimmed(s5[0]) && dimmed(s5[2]) && !dimmed(s5[1]), label + "：減光は明るさ 0.6");
    same(s5[1].scale, "1.04", label + "：話者を少し大きく");
    same(await page.textContent("#speaker-name"), "アオイ");
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, "trio-" + label + "-speaker.png") });

    await toPage(page, 6);
    await settle(page, 300);
    same((await charas(page)).map(function (c) { return [c.id, c.speaker, c.dim]; }), [["beni", true, false], ["aoi", true, false], ["sui", false, true]], label + "：2 人同時の話者（cast の charas）");
    await toPage(page, 7);
    await settle(page, 300);
    same((await charas(page)).filter(function (c) { return c.speaker || c.dim; }).length, 0, label + "：舞台にいない人の台詞では誰も強調・減光しない");
    same(await page.textContent("#speaker-name"), "遠くの声");
    await toPage(page, 8);
    await settle(page, 300);
    same((await charas(page)).map(function (c) { return [c.id, c.speaker]; }), [["beni", false], ["aoi", false], ["sui", true]], label + "：右の人が話者");
    await toPage(page, 9);
    await settle(page);
    same((await charas(page)).map(function (c) { return c.id + "@" + c.pos; }), ["dan@left", "aoi@center", "sui@right"], label + "：4 人目が左に来ると、左にいた人が退場（3 人を超えない）");
    await toPage(page, 10);
    await settle(page);
    same((await charas(page)).map(function (c) { return c.id + "@" + c.pos; }), ["dan@left", "aoi@right"], label + "：位置を移ると、そこにいた人が退場");
    await toPage(page, 11);
    await settle(page);
    same(await charas(page), [], label + "：全員退場");
    await toPage(page, 12);
    await settle(page);
    var back = await charas(page);
    same([back.length, back[0].pos, back[0].height], [1, "center", soloHeight], label + "：1 人に戻ると、従来と同じ大きさ・位置");

    if (v === 1) {
      // シーンの最初から 3 人（stage の show）。ロード直後・スキップでも同じ並びになる
      await choose(page, 1);
      await settle(page);
      same((await charas(page)).map(function (c) { return c.id + "@" + c.pos; }), ["beni@left", "aoi@center", "sui@right"], "シーン開始時から 3 人");
      await page.reload();
      await page.click("#continue-btn");
      await settle(page);
      same((await charas(page)).map(function (c) { return c.id + "@" + c.pos; }), ["beni@left", "aoi@center", "sui@right"], "つづきから：同じ並び");
      // HUD・用語・スロット数・保存キー
      ok(await page.evaluate(function () { return document.getElementById("hud-shards").hidden && !document.getElementById("hud-heart").hidden; }), "欠片の表示を隠し、もう一方は出す");
      same(await page.textContent("#hud-heart-label"), "信頼");
      await page.click("#hud-heart");
      same(await page.textContent("#toasts .toast"), "三人の信頼");
      await page.keyboard.press("s");
      same(await page.locator("#saves-list .save-row").count(), 5, "スロット数は作品設定のとおり（5）");
      ok(!/欠片/.test(await page.textContent("#saves-list")), "セーブの説明に、使っていない欠片を出さない");
      await page.keyboard.press("Escape");
      await choose(page, 1);
      await toChoices(page);
      same(await page.textContent("#ending-progress"), "見つけたエンディング：1 / 1　――すべての結末を見届けた！");
      var keys = Object.keys(await dump(page)).sort();
      same(keys, ["fixture-trio-endings-v1", "fixture-trio-read-v1", "fixture-trio-save-v1", "fixture-trio-settings-v1"].filter(function (k) { return k !== "fixture-trio-save-v1"; }), "保存キーは作品 ID で始まる（結末ではオートセーブを消す）");
    }
    same(page.errors, [], label + "：スクリプトエラーなし");
    await page.context().close();
  }
}

// ---------- 4. 長編規模 ----------
async function longChecks(browser) {
  var built = buildLong({});
  var small = buildLong({ limits: { logEntries: 24, logPages: 30, rewindPoints: 3 } });
  var data = loadWork({ files: built.files });
  var STORY = data.STORY;
  var Stage = data.Stage;
  var sceneIds = Object.keys(STORY.scenes);
  same([sceneIds.length, STORY.chapters.length], [802, 40], "生成データ：802 シーン・40 章（本作の 40 倍）");
  notes.push("長編データ：" + built.stats.scenes + " シーン／最大 " + built.stats.pagesMax + " ページ／本文 " + built.stats.chars + " 字／物語のファイル合計 " + Math.round(built.stats.bytes / 1024) + " KB（章ごとに " + built.chapterScripts.length + " ファイル）");

  // すべて読み、すべて選んだ状態の既読データ（フラグの有無の両方）
  var read = [];
  sceneIds.forEach(function (id) {
    var scene = STORY.scenes[id];
    read.push(id);
    var seen = {};
    [{}, null].forEach(function (flags) {
      var st = { flags: flags || new Proxy({}, { get: function () { return true; } }), affection: 0, shards: 0 };
      Stage.pageTexts(typeof scene.text === "function" ? scene.text(st) : scene.text).forEach(function (t) {
        var k = id + "#" + Stage.hashText(t);
        if (!seen[k]) {
          seen[k] = true;
          read.push(k);
        }
      });
    });
    (scene.choices || []).forEach(function (c) {
      read.push(id + ">" + Stage.hashText(c.text));
    });
  });
  var readJson = JSON.stringify(read);
  notes.push("既読データ（全部読んだ状態）：" + read.length + " 要素、" + Math.round(readJson.length / 1024) + " KB（localStorage の上限の目安 5 MB の " + ((readJson.length * 2) / (5 * 1024 * 1024) * 100).toFixed(1) + "%）");
  ok(readJson.length < 200 * 1024, "全部読んだ既読データが 200 KB 未満");

  var server = createServer({ files: built.files });
  var url = await listen(server);
  var settings = { textSpeed: 3, muted: true };

  // --- 読み込み時間（CPU を 4 分の 1 に絞って、非力な端末を模す） ---
  var page = await open(browser, url, { storage: { "fixture-long-settings-v1": settings, "fixture-long-read-v1": readJson } });
  var cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  var t0 = Date.now();
  await page.reload();
  await page.waitForSelector("#start-btn:focus");
  var loadMs = Date.now() - t0;
  var timing = await page.evaluate(function () {
    var nav = performance.getEntriesByType("navigation")[0];
    var scripts = performance.getEntriesByType("resource").filter(function (r) { return /\/js\//.test(r.name); });
    return { dcl: Math.round(nav.domContentLoadedEventEnd), scripts: scripts.length };
  });
  notes.push("読み込み（CPU 4 倍遅く、章 40 ファイルを一括）：タイトル表示まで " + loadMs + " ms、DOMContentLoaded " + timing.dcl + " ms、スクリプト " + timing.scripts + " 本");
  ok(loadMs < 6000, "CPU を絞っても 6 秒以内にタイトルが出る（" + loadMs + " ms）");
  same(await page.textContent("#scene-rate"), "802 / 802", "読んだシーン数（既読 6 千件から数える）");
  same(await page.textContent("#ending-count"), "0 / 2");

  // --- 既読 6 千件のもとでのページ送り ---
  await page.evaluate(function () {
    window.__sets = 0;
    var orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k) {
      if (/-read-v1$/.test(k)) window.__sets += 1;
      return orig.apply(this, arguments);
    };
  });
  await page.click("#start-btn");
  same(await page.textContent("#scene-step"), "第1章　潮騒　場面 1-1", "幕の呼び名は章の題名");
  ok(await page.evaluate(function () { return !document.getElementById("skip-btn").disabled; }), "全部既読なのでスキップできる");
  var turn = await page.evaluate(async function () {
    var box = document.getElementById("scene-text");
    var t = performance.now();
    var n = 0;
    var spent = 0;
    for (var i = 0; i < 400; i++) {
      var choice = document.querySelector("#choices .choice");
      if (choice && !document.getElementById("choice-overlay").classList.contains("is-locked")) choice.click();
      else if (choice) await new Promise(function (r) { setTimeout(r, 30); });
      else {
        var t1 = performance.now();
        box.click(); // ページ送り 1 回（既読の判定・記録・舞台の計算・描画の指示まで）
        spent += performance.now() - t1;
        n += 1;
      }
    }
    return { ms: performance.now() - t, spent: spent, pages: n, sets: window.__sets, title: document.getElementById("scene-title").textContent };
  });
  same(turn.sets, 0, "既読のページを読み直しても、既読データを書き直さない");
  notes.push("ページ送り（既読 " + read.length + " 件、CPU 4 倍遅く）：1 回あたり平均 " + (turn.spent / turn.pages).toFixed(2) + " ms（" + turn.pages + " 回、到達 " + turn.title + "）");
  ok(turn.spent / turn.pages < 16, "ページ送り 1 回が 1 コマ（16 ms）に収まる");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  same(Object.keys(JSON.parse((await dump(page))["fixture-long-read-v1"])).length, read.length, "既読データに重複が増えていない");
  same(page.errors, [], "スクリプトエラーなし");
  await page.context().close();

  // --- 新しく読むとき：既読は重複なく増え、セーブは上限の中に収まる ---
  page = await open(browser, url, { storage: { "fixture-long-settings-v1": settings } });
  await page.click("#start-btn");
  for (var i = 0; i < 45; i++) await choose(page, 2);
  var store = await dump(page);
  var list = JSON.parse(store["fixture-long-read-v1"]);
  same(list.length, new Set(list).size, "既読データに重複が無い");
  ok(list.indexOf("c01s01") !== -1 && list.some(function (k) { return /^c01s01#/.test(k); }) && list.some(function (k) { return /^c01s01>/.test(k); }), "既読の形式は従来と同じ（シーン／#ページ／>選択肢）");
  var save = JSON.parse(store["fixture-long-save-v1"]);
  same([save.scene, save.steps], ["c03s06", 45], "45 回選んで第 3 章へ");
  ok(Object.keys(save.flags).length >= 9, "フラグが積み上がっている（" + Object.keys(save.flags).length + " 個）");
  var withSnap = save.log.filter(function (e) { return e.k === "c" && e.s; }).length;
  ok(save.log.length <= 150 && withSnap <= 40, "バックログ " + save.log.length + " 行、巻き戻しの控え " + withSnap + " 個（上限 150 行・40 個）");
  notes.push("既定の上限で 45 シーン進めたセーブ：" + Math.round(store["fixture-long-save-v1"].length / 1024) + " KB（バックログ " + save.log.length + " 行、控え " + withSnap + " 個）");
  ok(store["fixture-long-save-v1"].length < 120 * 1024, "セーブ 1 件が 120 KB 未満");
  same(await page.textContent("#scene-step"), "第3章　灯火　場面 3-6");
  await page.keyboard.press("s");
  same(await page.locator("#saves-list .save-row").count(), 8, "スロット数は作品設定のとおり（8）");
  await page.locator("#saves-list .save-row").nth(7).locator("button").first().click();
  ok(/第3章　灯火「場面 3-6」/.test(await page.locator("#saves-list .save-row").nth(7).textContent()), "セーブの説明に章の題名");
  await page.keyboard.press("Escape");
  await page.click("#menu-btn");
  await page.click("#menu-title");
  same(await page.textContent("#continue-where"), "第3章　灯火「場面 3-6」", "「つづきから」に章の題名");
  same(Object.keys(await dump(page)).sort(), ["fixture-long-read-v1", "fixture-long-save-v1", "fixture-long-settings-v1", "fixture-long-slots-v1"], "保存キーは作品 ID で始まる");
  same(page.errors, [], "スクリプトエラーなし");
  await page.context().close();
  server.close();

  // --- 上限を小さくした作品設定：古い行から落ち、巻き戻しは新しい方だけ ---
  server = createServer({ files: small.files });
  url = await listen(server);
  page = await open(browser, url, { storage: { "fixture-long-settings-v1": settings, "fixture-long-endings-v1": ["b"] } });
  await page.click("#start-btn");
  for (i = 0; i < 20; i++) await choose(page, 1);
  save = JSON.parse((await dump(page))["fixture-long-save-v1"]);
  var pages = save.log.reduce(function (n, e) { return n + (e.paras ? e.paras.length : 0); }, 0);
  var last = save.log[save.log.length - 1];
  ok(save.log.length <= 24 && pages - last.paras.length <= 30, "行数とページ数の上限に収まる（" + save.log.length + " 行・" + pages + " ページ）");
  same(save.log.filter(function (e) { return e.k === "c" && e.s; }).length, 3, "巻き戻しの控えは新しい方から 3 個だけ");
  ok(save.log.filter(function (e) { return e.k === "c"; }).length > 3, "古い選択肢の行は文面だけ残る");
  same(last.title, "場面 2-1", "いちばん新しいシーンは必ず残る");
  await page.keyboard.press("l");
  same(await page.locator("#log-list .log-jump").count(), 3, "「この選択肢に戻る」は控えのある 3 行にだけ出る");
  await page.locator("#log-list .log-jump").first().click();
  await page.click("#confirm-ok");
  await page.waitForFunction(function () { return !document.getElementById("choice-overlay").hidden; });
  same(await page.textContent("#scene-title"), "場面 1-18", "いちばん古い控え（3 つ前の選択）へ戻れる");
  save = JSON.parse((await dump(page))["fixture-long-save-v1"]);
  same([save.scene, save.steps], ["c01s18", 17], "戻した状態");
  // 章をまたぐ遠い場面へ（検証用の選択肢）→ 結末まで
  await page.reload();
  await page.click("#start-btn");
  await choose(page, 1);
  await choose(page, 1);
  await choose(page, 3);
  same(await page.textContent("#scene-step"), "第40章　出立　場面 40-19", "最終章のシーンへ直接飛べる（全章を読み込み済み）");
  await choose(page, 1);
  await choose(page, 1);
  await toChoices(page);
  same(await page.textContent("#ending-name"), "END A「旅の終わり」");
  same(await page.textContent("#scene-step"), "FIN　旅の終わり", "結末の呼び名は FIN のまま");
  same(page.errors, [], "スクリプトエラーなし");
  await page.context().close();
  server.close();
}

async function run() {
  console.log("ver 3.0-p4 の確認");
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
  var browser = await playwright.chromium.launch();
  try {
    await section("0. 境界（エンジンに作品固有の語が無い／作品設定が無いと始めない）", function () {
      return boundaryChecks(browser);
    });
    var server = createServer({});
    var url = await listen(server);
    if (oldDir) {
      var oldServer = createServer({ root: oldDir });
      var oldUrl = await listen(oldServer);
      await section("1. 本作の画面と文言は 3.0-p3 と同じ", function () {
        return sameAsOld(browser, url, oldUrl);
      });
      oldServer.close();
    } else {
      notes.push("（旧版との画面比較は --old <3.0-p3 のフォルダ> を付けたときだけ行う）");
    }
    var page = await open(browser, url, { storage: { "chrono-tale-settings-v1": { textSpeed: 3, muted: true } } });
    await section("1'. 本作の保存キーは 5 件のまま", async function () {
      await page.click("#start-btn");
      await choose(page, 1);
      await page.keyboard.press("s");
      await page.locator("#saves-list .save-row").first().locator("button").first().click();
      await page.evaluate(function () { window.localStorage.setItem("chrono-tale-endings-v1", '["true"]'); });
      same(Object.keys(await dump(page)).sort(), KEYS5, "キー名");
      same(await page.locator("#saves-list .save-row").count(), 3, "スロットは 3 つ");
      same(page.errors, []);
    });
    await page.context().close();
    server.close();

    var trio = createServer({ roots: [TRIO, ROOT], placeholders: true });
    var trioUrl = await listen(trio);
    await section("2・3. 3 人同時表示と、別作品としての差し替え（5 つの画面サイズ）", function () {
      return trioChecks(browser, trioUrl);
    });
    trio.close();

    await section("4. 長編規模（40 章 802 シーン）", function () {
      return longChecks(browser);
    });
  } finally {
    await browser.close();
  }
  console.log("\nOK: " + checks + " 件の確認に合格");
  notes.forEach(function (n) {
    console.log("  " + n);
  });
}

run().catch(function (e) {
  console.error("NG: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
