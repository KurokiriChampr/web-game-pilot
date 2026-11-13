#!/usr/bin/env node
/*
 * ブラウザでの自動確認（Playwright / Chromium）
 * ------------------------------------------------------------
 *   node tools/e2e.js                       全項目を確認する
 *   node tools/e2e.js --shots <dir>         あわせてスクリーンショットを <dir> に保存する
 *   node tools/e2e.js --make-fixture <v2.1 を展開したフォルダ>
 *                                           v2.1 の実コードを動かして旧セーブ（localStorage 一式）を作り直す
 *                                           例: git archive c9abfcd | tar -x -C /tmp/v21 && node tools/e2e.js --make-fixture /tmp/v21
 *   node tools/e2e.js --old <v2.1 のフォルダ>  切り戻し確認（v3 で作ったデータを v2.1 で読む）も行う
 *
 * 旧セーブの固定サンプル: tools/fixtures/v2.1-localstorage.json（v2.1 の実コードが書き出したもの）
 */
"use strict";

var fs = require("fs");
var path = require("path");
var assert = require("assert");
var playwright = require("playwright");
var createServer = require("./preview-server.js").createServer;

var FIXTURE = path.join(__dirname, "fixtures", "v2.1-localstorage.json");
var KEYS = ["chrono-tale-save-v1", "chrono-tale-endings-v1", "chrono-tale-slots-v1", "chrono-tale-settings-v1", "chrono-tale-read-v1"];
var PORTRAIT = { width: 390, height: 844 };
var LANDSCAPE = { width: 1366, height: 768 };

var args = process.argv.slice(2);
function argOf(name) {
  var i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}
var shotsDir = argOf("--shots");
var results = [];
var checks = 0;

function check(cond, msg) {
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
async function open(browser, url, viewport, storage) {
  var context = await browser.newContext({ viewport: viewport || LANDSCAPE, reducedMotion: "reduce" });
  var page = await context.newPage();
  page.errors = [];
  page.on("pageerror", function (e) {
    page.errors.push(String(e));
  });
  page.on("dialog", function (d) {
    d.accept();
  });
  await page.goto(url);
  if (storage) {
    await page.evaluate(function (data) {
      window.localStorage.clear();
      Object.keys(data).forEach(function (k) {
        window.localStorage.setItem(k, data[k]);
      });
    }, storage);
    await page.reload();
  }
  await page.waitForSelector("#title-screen:not([hidden])");
  return page;
}

function dumpStorage(page) {
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
    function vis(node) {
      if (!node || node.hidden) return false;
      var cs = getComputedStyle(node);
      var r = node.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.01 && r.width > 2 && r.height > 2;
    }
    var plate = document.getElementById("nameplate");
    var layer = document.querySelector("#bg-layer .bg-img.is-active");
    return {
      title: document.getElementById("scene-title").textContent,
      titleVisible: vis(document.getElementById("scene-title")) && (!plate || vis(plate)),
      speaker: document.getElementById("speaker-name") && vis(document.getElementById("speaker-name")) && vis(plate)
        ? document.getElementById("speaker-name").textContent
        : "",
      plateVisible: plate ? vis(plate) : null,
      step: document.getElementById("scene-step").textContent,
      text: document.getElementById("scene-text").textContent,
      count: document.getElementById("page-count").textContent,
      choices: Array.prototype.map.call(document.querySelectorAll("#choices .choice-text"), function (n) {
        return n.textContent;
      }),
      bg: layer ? layer.style.backgroundImage.replace(/^url\("?|"?\)$/g, "") : null,
      bgPos: layer ? getComputedStyle(layer).backgroundPosition : null,
      hasChar: document.body.classList.contains("has-char"),
      charas: Array.prototype.map.call(document.querySelectorAll("#char-layer .chara.is-active"), function (n) {
        var img = n.querySelector("img");
        var halo = n.querySelector(".chara-halo");
        var box = n.getBoundingClientRect();
        var hb = halo ? halo.getBoundingClientRect() : null;
        return {
          id: n.getAttribute("data-id"),
          pos: n.getAttribute("data-pos"),
          file: (img.getAttribute("src") || "").split("/").pop(),
          dim: n.classList.contains("is-dim"),
          halo: halo ? halo.getAttribute("data-state") : null,
          // 光輪の中心が、立ち絵の枠に対して何 % の位置にあるか（追随の確認用）
          haloX: hb ? Math.round(((hb.left + hb.width / 2 - box.left) / box.width) * 100) : null,
          haloY: hb ? Math.round(((hb.top + hb.height / 2 - box.top) / box.height) * 100) : null,
          haloSize: hb ? Math.round((hb.width / box.width) * 100) : null,
          haloBehind: halo ? !!(halo.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
          left: Math.round(box.left),
          right: Math.round(box.right),
          width: Math.round(box.width),
          height: Math.round(box.height)
        };
      })
    };
  });
}

async function settle(page) {
  // 画像の読み込みと立ち絵の差し替えが落ち着くまで待つ
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(150);
}

async function nextPage(page) {
  var before = (await view(page)).count;
  await page.keyboard.press("Enter");
  await page.waitForFunction(function (b) {
    return document.getElementById("page-count").textContent !== b;
  }, before);
}

/** 選択肢が出るまで読み進め、通ったページの画面状態を返す */
async function readScene(page, onPage) {
  var seen = [];
  for (;;) {
    await settle(page);
    var v = await view(page);
    seen.push(v);
    if (onPage) await onPage(v, seen.length - 1);
    var m = /^(\d+) \/ (\d+)$/.exec(v.count);
    if (!m || m[1] === m[2]) break;
    await nextPage(page);
  }
  return seen;
}

async function choose(page, n) {
  await page.waitForSelector("#choice-overlay:not([hidden]):not(.is-locked)");
  var before = await page.evaluate(function () {
    return document.getElementById("scene-title").textContent;
  });
  await page.locator("#choices .choice").nth(n - 1).click();
  await page.waitForFunction(function (b) {
    return document.getElementById("scene-title").textContent !== b && document.getElementById("choice-overlay").hidden;
  }, before);
}

async function loadSlot(page, label) {
  var fromTitle = await page.evaluate(function () {
    return !document.getElementById("title-screen").hidden;
  });
  if (fromTitle) await page.click("#title-load-btn");
  else {
    await page.click("#menu-btn");
    await page.click("#menu-load");
  }
  await page.locator("#saves-list .save-row", { hasText: label }).locator("button", { hasText: "ロード" }).click();
  await page.waitForSelector("#game-screen:not([hidden])");
}

async function backlog(page) {
  await page.keyboard.press("l");
  await page.waitForSelector("#log-dialog[open]");
  var out = await page.evaluate(function () {
    return {
      text: document.getElementById("log-list").textContent,
      who: Array.prototype.map.call(document.querySelectorAll("#log-list .log-who"), function (n) {
        return n.textContent;
      }),
      paras: document.querySelectorAll("#log-list .log-para").length
    };
  });
  await page.keyboard.press("Escape");
  await page.waitForSelector("#log-dialog:not([open])", { state: "attached" });
  return out;
}

function logOf(storage, key) {
  var s = JSON.parse(storage[key || KEYS[0]]);
  return s;
}

function allParasAreStrings(state) {
  return state.log.every(function (e) {
    return (
      e.k === "c" ||
      (Array.isArray(e.paras) &&
        e.paras.every(function (p) {
          return typeof p === "string";
        }))
    );
  });
}

async function shot(page, name) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.waitForTimeout(1300); // 入場バナーとフェードが終わるのを待つ
  await page.screenshot({ path: path.join(shotsDir, name + ".jpg"), type: "jpeg", quality: 72 });
}

// ---------- v2.1 の実コードで旧セーブを作る ----------
async function makeFixture(browser, dir) {
  var server = createServer({ root: dir });
  var url = await listen(server);
  var page = await open(browser, url, LANDSCAPE, {
    "chrono-tale-settings-v1": JSON.stringify({ textSpeed: 3, skipRead: false, volume: 0.6, muted: true, images: true })
  });
  var version = await page.evaluate(function () {
    return document.documentElement.getAttribute("data-app-version");
  });
  assert.strictEqual(version, "2.1", "v2.1 のフォルダを指定してください");
  async function saveTo(n) {
    await page.keyboard.press("s");
    await page.locator("#saves-list .save-row", { hasText: "スロット " + n }).locator("button.btn-primary").click();
    await page.keyboard.press("Escape");
  }
  await page.click("#start-btn");
  await readScene(page);
  await choose(page, 1); // 花びらに触れる → meet
  await saveTo(1);
  await readScene(page);
  await choose(page, 1); // → explain
  await saveTo(2);
  await readScene(page);
  await choose(page, 1); // → village
  await readScene(page);
  await choose(page, 3); // → bakery
  await readScene(page);
  await choose(page, 1); // 丸パン → forest
  await readScene(page);
  await choose(page, 1); // → campfire（オートセーブはここ）
  await saveTo(3);
  await readScene(page);
  var data = await dumpStorage(page);
  delete data["chrono-tale-reloaded"];
  // エンディング記録の形式（ID の配列）も旧データとして入れておく
  data["chrono-tale-endings-v1"] = JSON.stringify(["normal"]);
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, JSON.stringify(data, null, 1) + "\n");
  console.log("旧セーブの固定サンプルを書き出しました: " + path.relative(process.cwd(), FIXTURE));
  console.log("  キー: " + Object.keys(data).sort().join(", "));
  await page.context().close();
  server.close();
}

// ---------- 確認項目 ----------
async function section(name, fn) {
  var before = checks;
  var at = results.length;
  await fn();
  results.splice(at, 0, name + "：" + (checks - before) + " 件");
  console.log("  ✓ " + name + "（" + (checks - before) + " 件）");
}

async function run(browser) {
  var fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  var plain = createServer({});
  var withArt = createServer({ placeholders: true });
  var url = await listen(plain);
  var artUrl = await listen(withArt);
  var instant = { "chrono-tale-settings-v1": JSON.stringify({ textSpeed: 3, skipRead: false, volume: 0.6, muted: true, images: true }) };
  var v3Storage = null;

  await section("旧セーブ（v2.1 の実データ）のロード", async function () {
    same(Object.keys(fixture).sort(), KEYS.slice().sort(), "固定サンプルは localStorage キー 5 件");
    var page = await open(browser, url, LANDSCAPE, fixture);
    check(await page.isVisible("#continue-btn"), "「つづきから」が出る");
    same(await page.textContent("#ending-count"), "1 / 4", "エンディング記録を読める");
    same(await page.textContent("#scene-rate"), "7 / 20", "既読記録を読める");

    // オートセーブ（campfire＝従来形式のシーン）
    await page.click("#continue-btn");
    await settle(page);
    var v = await view(page);
    same([v.title, v.step, v.titleVisible], ["揺れる焚き火", "第7幕", true], "オートセーブの続きから再開");
    check(v.text.indexOf("獣の爪はあなたの腕を裂いた") === 0, "フラグ（brave）どおりの本文");
    var old = logOf(fixture);
    var log = await backlog(page);
    check(log.text.indexOf("[object") === -1 && log.who.length === 0, "旧バックログをそのまま表示");
    same(log.paras, old.log.reduce(function (n, e) { return n + (e.paras ? e.paras.length : 0); }, 0), "旧バックログの段落数");

    // スロット 1〜3（meet / explain は新形式に移行したシーン）
    var expected = { 1: ["時計塔の少女", "第2幕　時計塔の少女"], 2: ["時の女神リーネ", "第3幕　時の女神リーネ"], 3: ["揺れる焚き火", "第7幕"] };
    for (var n = 1; n <= 3; n++) {
      await loadSlot(page, "スロット " + n);
      await settle(page);
      v = await view(page);
      same([v.title, v.step], expected[n], "スロット " + n + " をロード");
      var slotState = JSON.parse(fixture[KEYS[2]])[n].state;
      var auto = logOf(await dumpStorage(page));
      same(auto, slotState, "ロード直後のオートセーブは旧データと同じ形・同じ値（スロット " + n + "）");
    }

    // スロット 1（meet・petal あり）から読み進める
    await loadSlot(page, "スロット 1");
    var pages = await readScene(page);
    same(pages.length, 5, "meet は petal ありで 5 ページ");
    check(pages[0].text.indexOf("指先が触れた瞬間") === 0);
    same(pages[4].speaker, "少女", "最終ページの名前札は話者");
    await choose(page, 1);
    await readScene(page);
    await choose(page, 1);
    await settle(page);
    same((await view(page)).title, "涙の止まった村");
    var after = await dumpStorage(page);
    same(Object.keys(after).sort(), KEYS.slice().sort(), "localStorage のキーは 5 件のまま");
    var st = logOf(after);
    same(Object.keys(st).sort(), ["affection", "flags", "log", "scene", "shards", "steps"], "セーブの形は v2.1 と同じ");
    check(allParasAreStrings(st), "バックログの paras は文字列の配列のまま");
    same([st.scene, st.affection, st.steps, st.flags.petal], ["village", 3, 3, true]);
    same(JSON.parse(after[KEYS[3]]), JSON.parse(fixture[KEYS[3]]), "設定は変わらない");
    same(JSON.parse(after[KEYS[2]]), JSON.parse(fixture[KEYS[2]]), "スロットは変わらない");
    log = await backlog(page);
    check(log.text.indexOf("[object") === -1, "新旧まじりのバックログに [object Object] が出ない");
    // meet のログは旧セーブに入っていたもの（話者名なし）。v3 で読んだ explain から話者名が付く
    same(log.who, ["リーネ", "リーネ", "リーネ"], "バックログの話者名");
    same(page.errors, [], "スクリプトエラーなし");
    v3Storage = after;
    await page.context().close();
  });

  await section("素材なしのフォールバック（立ち絵ファイル 0 個の現状）", async function () {
    var page = await open(browser, url, PORTRAIT, instant);
    var failed = [];
    page.on("requestfailed", function (r) { failed.push(r.url()); });
    var notFound = [];
    page.on("response", function (r) { if (r.status() === 404) notFound.push(r.url().replace(url, "")); });
    await page.click("#start-btn");
    var a = await readScene(page);
    same([a[0].title, a[0].step, a[0].titleVisible, a[0].speaker], ["止まった草原", "第1幕", true, ""], "従来形式のシーンは v2.1 と同じ名前札");
    same(a[0].charas, []);
    await choose(page, 2);
    var m = await readScene(page, async function (v, i) { if (i === 3) await shot(page, "fallback-meet-390x844"); });
    same(m.length, 4);
    m.forEach(function (v) {
      same([v.charas.length, v.hasChar], [0, false], "立ち絵が無ければ枠を出さない");
      same(v.bg, "assets/images/meet.jpg", "背景は従来の 1 枚絵へ戻る");
    });
    same(m.map(function (v) { return v.speaker; }), ["", "", "", "少女"]);
    same(m.map(function (v) { return v.plateVisible; }), [false, false, false, true], "地の文では名前札を隠す");
    same(m[0].step, "第2幕　時計塔の少女");
    await choose(page, 1);
    var e = await readScene(page);
    same(e.map(function (v) { return v.speaker; }), ["リーネ", "リーネ", "", "リーネ", ""]);
    same(e[0].bg, "assets/images/explain.jpg");
    await choose(page, 1);
    await settle(page);
    var v = await view(page);
    same([v.title, v.step, v.titleVisible], ["涙の止まった村", "第4幕", true], "次の従来シーンで名前札が元に戻る");
    check(notFound.some(function (u) { return u.indexOf("images/chara/rine/sit_down.webp") !== -1; }), "立ち絵は論理名どおりのパスを取りに行く");
    check(notFound.some(function (u) { return u.indexOf("images/bg/tower_foot.webp") !== -1; }));
    same(page.errors, [], "スクリプトエラーなし");
    await page.context().close();
  });

  await section("スマホ縦の背景焦点（manifest の position / positionPortrait）", async function () {
    var slots = JSON.parse(fixture[KEYS[2]]);
    var want = {
      meet: { slot: "スロット 1", land: "50% 35%", port: "50% 50%" },
      explain: { slot: "スロット 2", land: "50% 40%", port: "56% 50%" },
      campfire: { slot: "スロット 3", land: "50% 50%", port: "50% 50%" } // 指定なし＝中央（v2.1 と同じ）
    };
    check(slots[1].state.scene === "meet" && slots[2].state.scene === "explain");
    var page = await open(browser, url, LANDSCAPE, fixture);
    for (var id of Object.keys(want)) {
      await page.setViewportSize(LANDSCAPE);
      await loadSlot(page, want[id].slot);
      await settle(page);
      same((await view(page)).bgPos, want[id].land, id + " 横長");
      for (var size of [PORTRAIT, { width: 360, height: 800 }, { width: 430, height: 932 }]) {
        await page.setViewportSize(size);
        same((await view(page)).bgPos, want[id].port, id + " 縦 " + size.width + "×" + size.height);
      }
    }
    // 焦点の値が実際に見える範囲を動かすこと：explain の縦で、画像の左端が 50% 指定より左へずれる
    await page.setViewportSize(PORTRAIT);
    await loadSlot(page, "スロット 2");
    await settle(page);
    var offset = await page.evaluate(function () {
      var layer = document.querySelector("#bg-layer .bg-img.is-active");
      var w = (innerHeight * 1344) / 768; // cover：縦いっぱいに合わせたときの画像の幅
      var p = parseFloat(getComputedStyle(layer).backgroundPosition) / 100;
      return { imageWidth: Math.round(w), left: Math.round((innerWidth - w) * p), centered: Math.round((innerWidth - w) * 0.5) };
    });
    check(offset.left < offset.centered, "56% 指定で見える範囲が右へ寄る（" + offset.left + " < " + offset.centered + "）");
    results.push("  explain 縦 390×844：画像幅 " + offset.imageWidth + "px、左端 " + offset.left + "px（中央指定なら " + offset.centered + "px）");
    same(page.errors, []);
    await page.context().close();
  });

  await section("立ち絵・名前札・光輪（仮の絵を返すサーバで確認）", async function () {
    var page = await open(browser, artUrl, LANDSCAPE, instant);
    await page.click("#start-btn");
    await readScene(page);
    await choose(page, 1); // petal あり
    var m = await readScene(page, async function (v, i) {
      if (i === 1) await shot(page, "meet-p2-1366x768");
      if (i === 4) await shot(page, "meet-p5-1366x768");
    });
    same(m.map(function (v) { return v.charas.map(function (c) { return c.file; }).join(","); }),
      ["", "sit_down.webp", "sit_down.webp", "sit_down.webp", "sit_surprised.webp"], "meet：ページごとの立ち絵");
    same(m[0].bg, "assets/images/bg/tower_foot.webp", "論理名の背景を使う");
    same(m[1].bgPos, "50% 40%");
    var c = m[1].charas[0];
    same([c.id, c.pos, c.halo, c.haloBehind, c.dim], ["rine", "center", "weak", true, false], "座りポーズ・中央・光輪は背面");
    same([c.haloX, c.haloY, c.haloSize], [52, 30, 40], "光輪は manifest の halo（枠に対する %）の位置");
    var stepwiseEnd = m[4];

    await choose(page, 1);
    var e = await readScene(page, async function (v, i) {
      if (i === 1) await shot(page, "explain-p2-1366x768");
    });
    same(e.map(function (v) { return v.charas[0].file + "/" + v.charas[0].halo + "/" + v.speaker; }),
      ["stand_normal.webp/weak/リーネ", "stand_wry.webp/weak/リーネ", "stand_serious.webp/weak/", "stand_serious.webp/weak/リーネ", "stand_normal.webp/flicker/"],
      "explain：表情・光輪・話者");
    same([e[0].charas[0].haloX, e[0].charas[0].haloY, e[0].charas[0].haloSize], [50, 22, 46], "ポーズが変わると光輪の位置も変わる");
    same(e[0].bg, "assets/images/bg/tower_foot.webp", "meet と同じ背景を共用");

    // 光輪の追随：画面サイズを変えても、立ち絵の枠に対する位置は同じ
    for (var size of [PORTRAIT, { width: 360, height: 800 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(700);
      var v = await view(page);
      var h = v.charas[0];
      same([h.haloX, h.haloY, h.haloSize], [50, 22, 46], "光輪が追随 " + size.width + "×" + size.height);
      check(h.left >= 0 && h.right <= size.width, "立ち絵が画面内 " + size.width + "×" + size.height + "（" + h.left + "〜" + h.right + "）");
      results.push("  " + size.width + "×" + size.height + "：立ち絵 " + h.width + "×" + h.height + "px、左右 " + h.left + "〜" + h.right + "px");
    }
    await page.setViewportSize(PORTRAIT);
    await shot(page, "explain-p5-390x844");
    await page.setViewportSize({ width: 844, height: 390 });
    await shot(page, "explain-p5-844x390");
    await page.setViewportSize(LANDSCAPE);

    // セーブ → タイトル → ロード：先頭ページの状態に戻る
    await page.keyboard.press("Escape");
    await page.click("#menu-btn");
    await page.click("#menu-save");
    await page.locator("#saves-list .save-row", { hasText: "スロット 1" }).locator("button.btn-primary").click();
    await page.keyboard.press("Escape");
    await page.click("#menu-btn");
    await page.click("#menu-title");
    await page.waitForSelector("#title-screen:not([hidden])");
    await page.waitForTimeout(800);
    same((await view(page)).charas, [], "タイトルでは立ち絵を出さない");
    await loadSlot(page, "スロット 1");
    await settle(page);
    var loaded = await view(page);
    same([loaded.title, loaded.count, loaded.speaker], ["時の女神リーネ", "1 / 5", "リーネ"], "ロードはシーン先頭から");
    same(loaded.charas.map(function (x) { return [x.file, x.halo, x.pos]; }), e.slice(0, 1).map(function (x) { return [x.charas[0].file, x.charas[0].halo, x.charas[0].pos]; }), "ロード直後の立ち絵＝1 ページずつ進めたときの先頭");

    // 既読スキップ：最終ページへ飛んでも、1 ページずつ進めたときと同じ状態
    check(await page.isVisible("#skip-btn"), "既読シーンにスキップが出る");
    await page.click("#skip-btn");
    await settle(page);
    var skipped = await view(page);
    same([skipped.count, skipped.speaker, skipped.charas[0].file, skipped.charas[0].halo],
      ["5 / 5", "", "stand_normal.webp", "flicker"], "スキップ後の立ち絵と光輪");
    same(skipped.charas.map(function (x) { return [x.file, x.halo, x.pos]; }), [[e[4].charas[0].file, e[4].charas[0].halo, e[4].charas[0].pos]]);

    // バックログを開閉しても状態が変わらない
    var log = await backlog(page);
    same(log.who, ["少女", "リーネ", "リーネ", "リーネ"]);
    await settle(page);
    var afterLog = await view(page);
    same(afterLog.charas.map(function (x) { return [x.file, x.halo]; }), skipped.charas.map(function (x) { return [x.file, x.halo]; }), "バックログ後も同じ");

    // meet をスキップで飛ばす（「一度読んだシーンは一瞬で表示」＋スキップ）
    await page.click("#menu-btn");
    await page.click("#menu-restart");
    await page.waitForFunction(function () { return document.getElementById("scene-title").textContent === "止まった草原"; });
    await page.click("#skip-btn");
    await choose(page, 1);
    await page.click("#skip-btn");
    await settle(page);
    var meetSkipped = await view(page);
    same([meetSkipped.count, meetSkipped.speaker], ["5 / 5", "少女"]);
    same(meetSkipped.charas.map(function (x) { return [x.file, x.halo, x.pos]; }), stepwiseEnd.charas.map(function (x) { return [x.file, x.halo, x.pos]; }), "meet：スキップ後＝1 ページずつ進めた結果");
    await page.setViewportSize(PORTRAIT);
    await shot(page, "meet-p5-390x844");

    // 「画像を表示する」をオフにすると立ち絵も消える。オンに戻すと同じ状態に戻る
    await page.evaluate(function () { window.GameAssets.setImagesEnabled(false); });
    await page.waitForTimeout(800);
    same((await view(page)).charas, [], "画像オフで立ち絵なし");
    await page.evaluate(function () { window.GameAssets.setImagesEnabled(true); });
    await settle(page);
    same((await view(page)).charas.map(function (x) { return x.file; }), ["sit_surprised.webp"]);
    same(page.errors, [], "スクリプトエラーなし");
    await page.context().close();
  });

  await section("全シーン通し（4 エンディングに到達、スクリプトエラーなし）", async function () {
    var routes = {
      // 寄り道 3 つ（bakery / boat / melody）と library を通る
      "TRUE END「ふたりで刻む時間」": [1, 1, 1, 3, 1, 1, 4, 3, 2, 2, 2, 4, 1, 2, 1],
      "NORMAL END「星になった女神」": [2, 3, 2, 2, 3, 3, 1, 1, 1, 1, 2, 2],
      "BAD END「止まった世界の旅人」": [2, 3, 2, 2, 3, 3, 1, 2, 1, 3, 1],
      "ANOTHER END「永遠の一秒」": [2, 3, 2, 2, 3, 3, 1, 2, 2, 3, 3]
    };
    var visited = {};
    for (var name of Object.keys(routes)) {
      var page = await open(browser, url, PORTRAIT, instant);
      await page.click("#start-btn");
      for (var n of routes[name]) {
        var seen = await readScene(page);
        visited[seen[0].title] = true;
        await choose(page, n);
      }
      var last = await readScene(page);
      visited[last[0].title] = true;
      await page.waitForSelector("#ending-overlay:not([hidden])");
      same(await page.textContent("#ending-name"), name);
      same(page.errors, [], name + " の経路でスクリプトエラーなし");
      await page.context().close();
    }
    same(Object.keys(visited).length, 20, "4 経路で全 20 シーンを通る");
    results.push("  通ったシーン " + Object.keys(visited).length + " / 20");
  });

  var oldDir = argOf("--old");
  if (oldDir) {
    await section("切り戻し（v3 で作ったデータを v2.1 で読む）", async function () {
      var server = createServer({ root: oldDir });
      var oldUrl = await listen(server);
      var page = await open(browser, oldUrl, LANDSCAPE, v3Storage);
      same(await page.evaluate(function () { return document.documentElement.getAttribute("data-app-version"); }), "2.1");
      await page.click("#continue-btn");
      await settle(page);
      same((await view(page)).title, "涙の止まった村");
      var log = await backlog(page);
      check(log.text.indexOf("[object") === -1, "v2.1 のバックログに [object Object] が出ない");
      check(log.text.indexOf("「私はリーネ。") !== -1, "v3 で読んだ段落が v2.1 のバックログに文字列で出る");
      same(page.errors, []);
      await page.context().close();
      server.close();
    });
  }

  plain.close();
  withArt.close();
}

(async function () {
  var browser = await playwright.chromium.launch();
  try {
    var dir = argOf("--make-fixture");
    if (dir) await makeFixture(browser, dir);
    else {
      await run(browser);
      console.log("\nOK: " + checks + " 件の確認に合格");
      results.forEach(function (r) { console.log(r); });
    }
  } finally {
    await browser.close();
  }
})().catch(function (e) {
  console.error("\nNG: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
