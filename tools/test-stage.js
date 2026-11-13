#!/usr/bin/env node
/*
 * 舞台状態（js/stage.js）の単体テスト
 *   node tools/test-stage.js
 * - 正規化：文字列とオブジェクトの混在、本文は不変
 * - 再現性：1 ページずつ進めた結果／スキップで最終ページへ飛んだ結果／ロード直後（0 ページ目）が
 *   どれも「0 ページ目からの畳み込み」と一致する（全 20 シーンの全フラグ組合せ）
 * - Phase 2：光輪 strong / off と継続、段落の bg、fx shake / flash、18 シーンの舞台割り当て、
 *   使っている論理名（背景・ポーズ・表情）が assets/manifest.json にあること
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

// ---- Phase 2：光輪・段落 bg・画面演出 ----
var p2 = [
  "まだ誰もいない",
  { text: "登場（光輪は既定）", chara: "rine" },
  { text: "強く光る", halo: "strong", fx: "flash" },
  "持ち越し",
  { text: "背景が変わる", bg: "tower_foot", fx: ["shake", "hop"] },
  { text: "光輪が消える", halo: "off" },
  { text: "未知の値は無視", halo: "rainbow" }
];
var p2o = { cast: cast, stage: { bg: "meadow" } };
eq(Stage.stageAt(p2, 1, p2o).halo, "weak", "立ち絵が初めて出るときの既定は weak");
eq([Stage.stageAt(p2, 2, p2o).halo, Stage.stageAt(p2, 2, p2o).fx], ["strong", ["flash"]]);
eq([Stage.stageAt(p2, 3, p2o).halo, Stage.stageAt(p2, 3, p2o).fx, Stage.stageAt(p2, 3, p2o).bg], ["strong", [], "meadow"], "halo は継続、fx はそのページだけ");
eq([Stage.stageAt(p2, 4, p2o).bg, Stage.stageAt(p2, 4, p2o).fx], ["tower_foot", ["shake", "hop"]], "段落の bg で背景が切り替わる");
eq([Stage.stageAt(p2, 5, p2o).halo, Stage.stageAt(p2, 5, p2o).bg], ["off", "tower_foot"], "bg も継続");
eq(Stage.stageAt(p2, 6, p2o).halo, "off", "未知の halo は無視して継続");
eq(Stage.bgsUsed(p2, p2o), ["meadow", "tower_foot"]);
["weak", "flicker", "strong", "off"].forEach(function (h) {
  ok(Stage.HALO_STATES.indexOf(h) !== -1, "halo " + h);
});

// ---- 再現性（全シーン、全フラグ組合せ）----
var FLAGS = ["petal", "selfish", "kindness", "brave", "clever", "shared", "asked", "lore", "reached", "song", "bakeryPromise", "together"];
var V3 = Object.keys(STORY.scenes); // Phase 2 で全シーンが新形式
var MANIFEST = JSON.parse(require("fs").readFileSync(path.join(__dirname, "..", "assets", "manifest.json"), "utf8"));
var FX_NAMES = ["hop", "shake", "flash"];
var usedBg = {};
var usedChara = {};
var replays = 0;
var statesSeen = {};
// 立ち絵を出さず名前札だけを出すリーネの台詞（ベル判断・確定）。シーン ID と段落テキストの完全一致で特定する。
// ここに無い段落で speaker と立ち絵が食い違えば、従来どおり NG。
var SPEAKER_ONLY = [
  ["village", "「時が戻れば、あなたもこの世界で生きていける。……それじゃ、だめ？」そう答えたきり、道中のリーネはほとんど口をきかなかった。"],
  ["end_true", "「うそ……力が、半分ずつ……？」異世界から来たあなたの魂が、女神の力を分け合い、受け止めていた。"],
  ["end_true", "「約束、覚えてる？」リーネがあなたの袖を引いた。「パン、買いに行こう。今度はちゃんと、焼きたてのを」"],
  ["end_bad", "「……どうして、もっと」遠くでリーネの声がした気がした。けれど、その続きはもう聞こえない。"]
];
var speakerOnlySeen = {};
function isSpeakerOnly(sceneId, text) {
  for (var i = 0; i < SPEAKER_ONLY.length; i++) {
    if (SPEAKER_ONLY[i][0] === sceneId && SPEAKER_ONLY[i][1] === text) return i;
  }
  return -1;
}
// 話者のいるページの検査。例外の段落は「話者はリーネ、立ち絵は舞台にいない」ことを求める
function checkSpeaker(sceneId, page, st) {
  if (!st.speaker) return;
  ok(STORY.cast[st.speaker] && STORY.cast[st.speaker].name, sceneId + " 話者が cast にある");
  var ex = isSpeakerOnly(sceneId, page.text);
  if (ex !== -1) {
    speakerOnlySeen[ex] = true;
    ok(st.speaker === "rine" && st.speakerChara === null, sceneId + " 名前札だけの段落（立ち絵なし）");
  } else {
    ok(st.speakerChara === "rine", sceneId + " 話者の立ち絵が舞台にいる");
  }
}
// 例外は無制限ではない：同じ文でも別シーンなら、別の文なら同じシーンでも従来どおり NG
assert.throws(function () { checkSpeaker("end_true", { text: SPEAKER_ONLY[3][1] }, { speaker: "rine", speakerChara: null }); });
assert.throws(function () { checkSpeaker("end_true", { text: "「ねえ。これからは、同じ時間を生きられるね」" }, { speaker: "rine", speakerChara: null }); });
assert.throws(function () { checkSpeaker("end_bad", { text: SPEAKER_ONLY[3][1] + "。" }, { speaker: "rine", speakerChara: null }); });
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
      // 使っている論理名がマニフェストにある（ファイルの有無は別。無ければ実行時にフォールバックする）
      if (!usedBg[st.bg]) {
        usedBg[st.bg] = true;
        ok(MANIFEST.backgrounds[st.bg] && typeof MANIFEST.backgrounds[st.bg].image === "string", id + " 背景 " + st.bg + " が manifest にある");
      }
      st.charas.forEach(function (c) {
        var key = c.id + "/" + c.pose + "/" + c.expr;
        if (usedChara[key]) return;
        usedChara[key] = true;
        var pose = MANIFEST.characters[c.id] && MANIFEST.characters[c.id].poses[c.pose];
        ok(pose && typeof pose.exprs[c.expr] === "string", id + " 立ち絵 " + key + " が manifest にある");
        ok(c.pos === "center", id + " 位置は center");
      });
      if (st.fx.length || st.halo !== "weak") {
        ok(Stage.HALO_STATES.indexOf(st.halo) !== -1 && st.fx.every(function (x) { return FX_NAMES.indexOf(x) !== -1; }), id + " halo / fx の値");
      }
      checkSpeaker(id, p, st);
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

// 例外の 4 段落はどれも実際に現れて検査された（使われない例外を残さない）
eq(Object.keys(speakerOnlySeen).length, SPEAKER_ONLY.length, "名前札だけの段落 4 つがすべて検査された");

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

// ---- Phase 2：18 シーンの舞台割り当て（指示書どおりか）----
/** フラグを与えて、各ページの「pose/expr/halo[/bg][+fx]」を並べる。立ち絵なしは "-" */
function trace(id, flags) {
  var scene = STORY.scenes[id];
  var raw = typeof scene.text === "function" ? scene.text({ flags: flags || {}, affection: 0, shards: 0 }) : scene.text;
  var opt = { stage: scene.stage, cast: STORY.cast };
  return raw.map(function (_, i) {
    var st = Stage.stageAt(raw, i, opt);
    var c = st.charas[0];
    return (c ? c.pose + "/" + c.expr + "/" + st.halo : "-") + (st.fx.length ? "+" + st.fx.join("+") : "");
  });
}
function bgs(id, flags) {
  var scene = STORY.scenes[id];
  var raw = typeof scene.text === "function" ? scene.text({ flags: flags || {}, affection: 0, shards: 0 }) : scene.text;
  return raw.map(function (_, i) {
    return Stage.stageAt(raw, i, { stage: scene.stage, cast: STORY.cast }).bg;
  });
}
var SN = "stand/normal/weak";
var SD = "sit/down/weak";
eq(trace("awakening"), ["-", "-", "-", "-"]);
eq(trace("village", { selfish: true }), ["-", "-", SN, "stand/sad/weak"]);
eq(trace("village"), ["-", SN, "stand/sad/weak"]);
eq(trace("bakery"), ["-", "-", "stand/smile/weak", "stand/smile/weak"]);
eq(trace("forest", { kindness: true }), ["stand/smile/weak", SN, "stand/surprised/flicker", "stand/surprised/flicker"]);
eq(trace("forest"), [SN, "stand/surprised/flicker", "stand/surprised/flicker"]);
eq(trace("campfire", { brave: true }), ["stand/sad/weak", SD, SD]);
eq(trace("campfire", { clever: true }), ["stand/surprised/weak", SD, SD]);
eq(trace("campfire", { relied: true }), ["stand/eyes_closed/weak", SD, SD]);
eq(trace("river", { shared: true }), ["stand/smile/weak", SN, SN, SN]);
eq(trace("river"), [SN, SN, SN]);
eq(trace("boat"), ["-", "-", SN, SN]);
eq(trace("mirror"), ["-", "-", "-", "stand/sad/weak"]);
eq(trace("library"), ["-", "-", "stand/surprised/weak"]);
eq(trace("ruins", { asked: true, lore: true }), ["stand/sad/weak", SN, SN, SN]);
eq(trace("ruins", { lore: true }), [SN, SN, SN, SN]);
eq(trace("ruins"), [SN, SN, SN]);
eq(trace("night"), [SD, SD, "sit/down/flicker"]);
eq(trace("night", { petal: true }), [SD, SD, "sit/down/flicker", "sit/down/flicker"]);
eq(trace("melody"), [SD, SD, "sit/surprised/weak", "sit/eyes_closed/weak"]);
eq(trace("melody", { petal: true }), [SD, SD, "sit/surprised/weak", "sit/eyes_closed/weak"]);
eq(trace("boss"), ["-", "-", "-", "-"]);
eq(trace("sacrifice", { reached: true }), ["stand/serious/weak", "stand/serious/weak+flash", "stand/serious/strong", "stand/serious/strong"]);
eq(trace("sacrifice"), ["stand/serious/weak", "stand/serious/weak", "stand/serious/strong", "stand/serious/strong"]);
eq(trace("end_true"), ["-", "-", "-", "-", "stand/normal/off", "stand/smile/off", "stand/smile/off"]);
eq(bgs("end_true"), ["hand_holding", "hand_holding", "hand_holding", "tower_foot", "tower_foot", "tower_foot", "tower_foot"]);
var etAll = trace("end_true", { kindness: true, petal: true, song: true, bakeryPromise: true });
eq(etAll.slice(0, 8), ["-", "-", "-", "-", "-", "-", "-", "-"], "end_true の分岐段落では立ち絵なし");
eq(etAll.slice(8), ["stand/normal/off", "stand/smile/off", "stand/smile/off"]);
eq(trace("end_normal", { together: true, song: true }), ["-", "-", "-", "-", "-", "-", "-"]);
eq(trace("end_bad"), ["-", "-", "-", "-", "-"]);
eq(trace("end_still"), ["-", "stand/wry/weak", "stand/wry/weak", "stand/wry/weak", "stand/sad/weak", "stand/sad/weak"]);
var STAGE_BG = {
  awakening: "meadow", meet: "tower_foot", explain: "tower_foot", village: "village_plaza", bakery: "bakery", forest: "forest",
  campfire: "campfire", river: "riverbank", boat: "boat", mirror: "mirror", library: "library", ruins: "temple_ruins",
  night: "dune_night", melody: "dune_night", boss: "tower_top", sacrifice: "gear_chamber", end_true: "hand_holding",
  end_normal: "night_sky", end_bad: "frozen_world", end_still: "tower_still"
};
eq(Object.keys(STORY.scenes).reduce(function (o, id) { o[id] = STORY.scenes[id].stage.bg; return o; }, {}), STAGE_BG, "シーン開始時の背景");
eq([STORY.scenes.boss.enter, STORY.scenes.sacrifice.enter, STORY.scenes.end_true.enter], ["shake", "flash", "flash"], "シーンの enter");
// 指示書で追加した論理名（未使用の smile_open / angry を含む）
["smile", "smile_open", "angry", "sad", "eyes_closed"].forEach(function (e) {
  eq(MANIFEST.characters.rine.poses.stand.exprs[e], "stand_" + e + ".webp");
});
eq(MANIFEST.characters.rine.poses.sit.exprs.eyes_closed, "sit_eyes_closed.webp");

console.log("OK: " + checks + " 件の検査に合格（全 " + V3.length + " シーン × 4096 通り = " + replays + " 回の再生、固有の舞台状態 " + Object.keys(statesSeen).length + " 種）");
