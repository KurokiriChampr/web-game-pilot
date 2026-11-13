#!/usr/bin/env node
/*
 * 舞台状態（js/stage.js）の単体テスト
 *   node tools/test-stage.js
 * - 正規化：文字列とオブジェクトの混在、本文は不変
 * - 再現性：1 ページずつ進めた結果／スキップで最終ページへ飛んだ結果／ロード直後（0 ページ目）が
 *   どれも「0 ページ目からの畳み込み」と一致する（meet / explain の全フラグ組合せ）
 * - バックログ：保存される paras は文字列の配列のまま
 */
"use strict";

var assert = require("assert");
var path = require("path");
var Stage = require(path.join(__dirname, "..", "js", "stage.js"));
var STORY = require(path.join(__dirname, "..", "js", "story.js"));

var checks = 0;
function ok(cond, msg) {
  checks += 1;
  assert.ok(cond, msg);
}
function eq(a, b, msg) {
  checks += 1;
  assert.deepStrictEqual(a, b, msg);
}

// ---- 正規化 ----
eq(Stage.normalizePage("あ"), { text: "あ" });
eq(Stage.normalizePage({ text: "い", speaker: "rine" }), { text: "い", speaker: "rine" });
eq(Stage.normalizePage({ text: "う", portraits: [{ chara: "rine" }] }).show, [{ chara: "rine" }]);
eq(Stage.pageTexts(["a", { text: "b", expr: "x" }, "c"]), ["a", "b", "c"]);
var src = { text: "え", expr: "wry" };
Stage.normalizePage(src).expr = "changed";
eq(src.expr, "wry", "正規化は元データを書き換えない");

// ---- 畳み込みの意味 ----
var cast = { rine: { name: "リーネ", chara: "rine" }, girl: { name: "少女", chara: "rine" }, shadow: { name: "影" } };
var pages = [
  "地の文",
  { text: "登場", chara: "rine", pose: "sit", expr: "down", pos: "left" },
  "持ち越し",
  { text: "台詞", speaker: "girl", expr: "surprised", fx: "hop" },
  { text: "二人目", show: [{ chara: "shadow", pos: "right" }], halo: "flicker" },
  { text: "影の台詞", speaker: "shadow" },
  { text: "退場", hide: ["rine"] },
  { text: "全員退場", hide: "*" }
];
var o = { cast: cast, stage: { bg: "tower_foot" } };
eq(Stage.stageAt(pages, -1, o).charas, [], "シーン開始位置は stage だけ");
eq(Stage.stageAt(pages, -1, o).bg, "tower_foot");
eq(Stage.stageAt(pages, 0, o).charas, []);
eq(Stage.stageAt(pages, 1, o).charas, [{ id: "rine", pose: "sit", expr: "down", pos: "left" }]);
eq(Stage.stageAt(pages, 2, o).charas, [{ id: "rine", pose: "sit", expr: "down", pos: "left" }], "指定が無ければ持ち越す");
var s3 = Stage.stageAt(pages, 3, o);
eq(s3.charas, [{ id: "rine", pose: "sit", expr: "surprised", pos: "left" }], "speaker の立ち絵に表情を適用");
eq([s3.speaker, s3.speakerChara, s3.fx], ["girl", "rine", ["hop"]]);
var s4 = Stage.stageAt(pages, 4, o);
eq(s4.charas.length, 2);
eq([s4.halo, s4.speaker, s4.fx], ["flicker", null, []], "話者と fx はそのページだけ、光輪は持ち越す");
eq(Stage.stageAt(pages, 5, o).speakerChara, "shadow");
eq(Stage.stageAt(pages, 5, o).halo, "flicker");
eq(Stage.stageAt(pages, 6, o).charas, [{ id: "shadow", pose: "stand", expr: "normal", pos: "right" }]);
eq(Stage.stageAt(pages, 7, o).charas, []);
eq(Stage.stageAt(pages, 99, o), Stage.stageAt(pages, 7, o), "範囲外は最終ページ扱い");
eq(Stage.stageAt(["a", "b"], 1, {}).charas, [], "文字列だけのシーンは空の舞台");
ok(!Stage.usesStage({ text: ["a"] }, ["a", "b"]), "従来形式の判定");
ok(Stage.usesStage({ stage: { bg: "x" } }, ["a"]));
ok(Stage.usesStage({}, ["a", { text: "b" }]));

// ---- 再現性（meet / explain、全フラグ組合せ）----
var FLAGS = ["petal", "selfish", "kindness", "brave", "clever", "shared", "asked", "lore", "reached", "song", "bakeryPromise", "together"];
var V3 = ["meet", "explain"];
var replays = 0;
var statesSeen = {};
Object.keys(STORY.scenes).forEach(function (id) {
  var scene = STORY.scenes[id];
  for (var n = 0; n < 1 << FLAGS.length; n++) {
    var flags = {};
    FLAGS.forEach(function (f, i) {
      if (n & (1 << i)) flags[f] = true;
    });
    var raw = typeof scene.text === "function" ? scene.text({ flags: flags, affection: 0, shards: 0 }) : scene.text;
    var staged = Stage.usesStage(scene, raw);
    if (V3.indexOf(id) === -1) {
      if (staged) assert.fail(id + " は従来形式のはず");
      if (!raw.every(function (p) { return typeof p === "string"; })) assert.fail(id + " に文字列以外の段落");
      continue;
    }
    ok(staged, id + " は新形式");
    var norm = Stage.normalizePages(raw);
    var opt = { stage: scene.stage, cast: STORY.cast };

    // (a) 1 ページずつ進める：エンジンと同じく毎ページ stageAt を呼ぶ
    var stepwise = [];
    for (var i = 0; i < norm.length; i++) stepwise.push(Stage.stageAt(norm, i, opt));
    // (b) スキップ：いきなり最終ページ
    eq(Stage.stageAt(norm, norm.length - 1, opt), stepwise[norm.length - 1], id + " スキップ後の状態");
    // (c) ロード直後：先頭ページ。JSON を往復した別インスタンス（=セーブを読み直した状態）から計算
    var reloaded = typeof scene.text === "function" ? scene.text(JSON.parse(JSON.stringify({ flags: flags, affection: 0, shards: 0 }))) : scene.text;
    eq(Stage.stageAt(reloaded, 0, opt), stepwise[0], id + " ロード直後の状態");
    // (d) 正規化前の生データから計算しても同じ（入力の形に依存しない）、何度呼んでも同じ（純関数）
    for (var j = 0; j < norm.length; j++) {
      eq(Stage.stageAt(raw, j, opt), stepwise[j]);
      eq(Stage.stageAt(norm, j, opt), stepwise[j]);
      statesSeen[id + ":" + JSON.stringify(stepwise[j].charas) + stepwise[j].halo + stepwise[j].speaker] = true;
    }
    // (e) 新形式シーンの全ページに立ち絵の状態が決まっている（登場前の地の文を除く）
    norm.forEach(function (p, k) {
      var st = stepwise[k];
      if (st.speaker) {
        ok(STORY.cast[st.speaker] && STORY.cast[st.speaker].name, id + " 話者が cast にある");
        ok(st.speakerChara === "rine", id + " 話者の立ち絵が舞台にいる");
      }
      st.charas.forEach(function (c) {
        ok(Stage.POSITIONS.indexOf(c.pos) !== -1 && c.pose && c.expr);
      });
    });
    // (f) バックログに入る値は文字列だけ
    Stage.pageTexts(raw).forEach(function (t) {
      ok(typeof t === "string" && t.length > 0);
    });
    replays += 1;
  }
});

// ---- meet / explain の具体的な状態 ----
var meet = STORY.scenes.meet;
var mp = meet.text({ flags: { petal: true } });
var mo = { stage: meet.stage, cast: STORY.cast };
eq(Stage.stageAt(mp, 0, mo).charas, [], "花びらの段落ではまだ誰もいない");
eq(Stage.stageAt(mp, 1, mo).charas, [{ id: "rine", pose: "sit", expr: "down", pos: "center" }]);
eq(Stage.stageAt(mp, 4, mo).charas, [{ id: "rine", pose: "sit", expr: "surprised", pos: "center" }]);
eq(Stage.stageAt(mp, 4, mo).speaker, "girl");
eq(Stage.stageAt(mp, 4, mo).bg, "tower_foot");
var ex = STORY.scenes.explain;
var eo = { stage: ex.stage, cast: STORY.cast };
eq(
  ex.text.map(function (_, i) {
    var st = Stage.stageAt(ex.text, i, eo);
    return [st.speaker, st.charas[0].pose, st.charas[0].expr, st.halo].join("/");
  }),
  ["rine/stand/normal/weak", "rine/stand/wry/weak", "/stand/serious/weak", "rine/stand/serious/weak", "/stand/normal/flicker"]
);
eq(Stage.charasUsed(ex.text, eo).length, 3, "explain で使う立ち絵は 3 種");

console.log("OK: " + checks + " 件の検査に合格（meet/explain × 4096 通り = " + replays + " 回の再生、固有の舞台状態 " + Object.keys(statesSeen).length + " 種）");
