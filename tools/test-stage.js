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
 * - 状態変数（js/state.js の STORY.vars / state.vars）：宣言・加算・代入・範囲・人物ごと・未宣言の無視・復元時の補完・
 *   控えの写し、本作の状態に vars が現れないこと、ver 2.1／3.0-p4 の旧セーブの互換、変数の増減による分岐、変数の点検
 * - 周回をまたぐ解放（STORY.unlocks）：到達済みエンディング → 新規開始の初期フラグ（4 つのバッドエンディングの全 16 通り）、
 *   進行中のセーブに触れないこと、本作の newState が到達記録に依らず従来どおりなこと、宣言の点検
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

// ---- 既読の指紋（ver 3.0-p3）：ページ単位の既読・選んだ選択肢の記録に使う ----
eq(Stage.hashText(""), (0x811c9dc5).toString(36), "空文字列は FNV-1a 32bit の初期値（2166136261）");
eq(Stage.hashText("a"), (0xe40c292c).toString(36), "既知の値（FNV-1a 32bit の \"a\"）");
eq(Stage.hashText("あ"), Stage.hashText("あ"), "同じ文字列は同じ値");
ok(/^[0-9a-z]{1,7}$/.test(Stage.hashText("時の欠片")), "36 進の短い文字列");
var BASE = require(path.join(__dirname, "baseline", "v2.1-text.json"));
var hashedParas = 0;
Object.keys(BASE.texts).forEach(function (id) {
  // 同じシーンの中で、違う段落が同じ指紋にならない（なると未読を既読と取り違える）
  var byHash = {};
  BASE.texts[id].lists.forEach(function (list) {
    list.forEach(function (p) {
      var h = Stage.hashText(p);
      ok(byHash[h] == null || byHash[h] === p, id + "：段落の指紋が衝突しない");
      if (byHash[h] == null) hashedParas += 1;
      byHash[h] = p;
    });
  });
  var byChoice = {};
  (STORY.scenes[id].choices || []).forEach(function (c) {
    var h = Stage.hashText(c.text);
    ok(byChoice[h] == null, id + "：選択肢の指紋が衝突しない");
    byChoice[h] = c.text;
  });
  ok(!/[#>]/.test(id), "シーン ID に # と > を使わない（既読データの区切りと衝突しない）");
});
eq(hashedParas >= 98, true, "全シーンの固有の段落を確認した");

// ---- ver 3.0-p4：同時に最大 3 人（1 か所に 1 人）・複数人の話者・章 ----
(function () {
  var c3 = { a: { name: "A", chara: "a" }, b: { name: "B", chara: "b" }, c: { name: "C", chara: "c" }, ab: { name: "A と B", charas: ["a", "b"] }, far: { name: "声" } };
  var at = function (pg, i) {
    return Stage.stageAt(pg, i, { cast: c3 });
  };
  var where = function (st) {
    return st.charas.map(function (c) {
      return c.id + "@" + c.pos;
    });
  };
  var pg = [
    { text: "1", chara: "a" },
    { text: "2", chara: "b" },
    { text: "3", chara: "c" },
    { text: "4", chara: "d" },
    { text: "5", chara: "a", pos: "left" },
    { text: "6", show: [{ chara: "x", pos: "left" }, { chara: "y", pos: "left" }] },
    { text: "7", speaker: "ab" },
    { text: "8", speaker: "far" },
    { text: "9", speaker: "b", expr: "smile" }
  ];
  eq(where(at(pg, 0)), ["a@center"], "pos 省略の 1 人目は中央（従来どおり）");
  eq(where(at(pg, 1)), ["a@center", "b@left"], "2 人目は空いている左");
  eq(where(at(pg, 2)), ["a@center", "b@left", "c@right"], "3 人目は右");
  eq(where(at(pg, 3)), ["b@left", "c@right", "d@center"], "4 人目は中央に立ち、中央にいた人が退場（3 人を超えない）");
  eq(where(at(pg, 4)), ["c@right", "d@center", "a@left"], "出直した人が左を指定すると、左にいた人が退場");
  eq(where(at(pg, 5)), ["c@right", "d@center", "y@left"], "同じページで同じ位置を 2 人が指定したら、後の人が残る");
  eq(Stage.MAX_CHARAS, 3);

  var duo = [{ text: "1", show: [{ chara: "a", pos: "left" }, { chara: "b", pos: "right" }, { chara: "c" }] }, { text: "2", speaker: "ab" }, { text: "3", speaker: "far" }, { text: "4", speaker: "b", expr: "smile" }];
  eq(where(at(duo, 0)), ["a@left", "b@right", "c@center"]);
  eq([at(duo, 1).speakerCharas, at(duo, 1).speakerChara], [["a", "b"], "a"], "cast の charas＝複数人が同時に話者");
  eq([at(duo, 2).speakerCharas, at(duo, 2).speakerChara], [[], null], "舞台にいない人の台詞では話者の立ち絵なし");
  eq(at(duo, 3).speakerCharas, ["b"]);
  eq(at(duo, 3).charas[1], { id: "b", pose: "stand", expr: "smile", pos: "right" }, "話者の省略記法は、その人の表情だけを変える（位置は動かない）");
  eq(at(duo, 1).charas, at(duo, 0).charas, "複数人の話者の省略記法は、誰の立ち絵も変えない");

  // どんな順に出し入れしても：3 人以下・位置は重ならない・1 ページずつ進めた結果と飛んだ結果が同じ
  var ids = ["a", "b", "c", "d", "e"];
  var poss = [undefined, "left", "center", "right"];
  var seed = 12345;
  var rnd = function (n) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  for (var round = 0; round < 300; round++) {
    var list = [];
    for (var k = 0; k < 12; k++) {
      var page = { text: "p" + k };
      var kind = rnd(5);
      if (kind === 0) page.hide = rnd(4) === 0 ? "*" : [ids[rnd(5)]];
      else if (kind === 1) page.show = [{ chara: ids[rnd(5)], pos: poss[rnd(4)] }, { chara: ids[rnd(5)], pos: poss[rnd(4)] }];
      else if (kind === 2) page.speaker = ids[rnd(5)];
      else {
        page.chara = ids[rnd(5)];
        if (rnd(2)) page.pos = poss[rnd(4)];
      }
      list.push(page);
    }
    for (var n = 0; n < list.length; n++) {
      var st = Stage.stageAt(list, n, { cast: {} });
      ok(st.charas.length <= 3, "3 人以下");
      var used = {};
      st.charas.forEach(function (c) {
        ok(!used[c.pos], "位置が重ならない");
        used[c.pos] = true;
      });
    }
  }

  // 本作のシーンは 1 人だけ：新しい規則でも舞台状態は 59 種のまま（上の全数検査が同じ結果になることで確認済み）
  Object.keys(STORY.scenes).forEach(function (id) {
    var scene = STORY.scenes[id];
    var raw = typeof scene.text === "function" ? scene.text({ flags: new Proxy({}, { get: function () { return true; } }), affection: 99, shards: 3 }) : scene.text;
    for (var n2 = -1; n2 < raw.length; n2++) {
      ok(Stage.stageAt(raw, n2, { stage: scene.stage, cast: STORY.cast }).charas.length <= 1, id + " は 1 人まで");
    }
  });

  // 章
  var story = { scenes: { intro: { title: "序" } } };
  Stage.addChapter(story, { id: "ch1", title: "第一章", scenes: { a1: { title: "A" }, a2: { title: "B", chapter: "ch1" } } });
  Stage.addChapter(story, { id: "ch2", title: "第二章", scenes: { b1: { title: "C" } } });
  Stage.addChapter(story, { id: "ch1", scenes: { a3: { title: "D" } } });
  eq(story.chapters, [{ id: "ch1", title: "第一章" }, { id: "ch2", title: "第二章" }], "同じ章を 2 回足しても登録は 1 つ");
  eq(Object.keys(story.scenes), ["intro", "a1", "a2", "b1", "a3"]);
  eq(Stage.chapterOf(story, "a3"), { id: "ch1", title: "第一章", index: 0 });
  eq(Stage.chapterOf(story, "b1"), { id: "ch2", title: "第二章", index: 1 });
  eq(Stage.chapterOf(story, "intro"), null, "章の無いシーン");
  eq(Stage.chapterOf(STORY, "meet"), null, "本作は章を使っていない（幕の呼び名は従来どおり）");
})();

// ---- 物語データの点検（tools/validate-story.js）：本作は誤り・注意とも 0 件、検証用の別作品は誤り 0 件 ----
(function () {
  var loadWork = require(path.join(__dirname, "lib", "load-work.js")).loadWork;
  var validate = require(path.join(__dirname, "validate-story.js")).validate;
  var root = path.join(__dirname, "..");
  var own = validate(loadWork({ roots: [root] }));
  eq([own.errors, own.warnings], [[], []], "本作の物語データ");
  eq([own.stats.scenes, own.stats.reachable, own.stats.endings, own.stats.maxOnStage], [20, 20, 4, 1]);
  var trio = validate(loadWork({ roots: [path.join(__dirname, "fixtures", "trio"), root] }));
  eq(trio.errors, [], "検証用の別作品（3 人）");
  eq([trio.stats.maxOnStage, trio.warnings.length], [3, 2], "押し出しの 2 か所（わざと入れてある）を注意として拾う");
  // 壊したデータを誤りとして拾えること
  var bad = loadWork({ roots: [path.join(__dirname, "fixtures", "trio"), root] });
  bad.STORY.scenes.gather.choices[0].next = "nowhere";
  bad.STORY.scenes.walk.stage.show[0].chara = "ghost";
  bad.STORY.scenes["a#b"] = { title: "x", text: [{ text: "t", speaker: "nobody2", pos: "middle" }], choices: [{ text: "c", next: "fin" }] };
  var found = validate(bad).errors.join("\n");
  ["nowhere", "ghost", "シーン ID に #", "nobody2", "middle"].forEach(function (word) {
    ok(found.indexOf(word) !== -1, "誤りを拾う：" + word);
  });
})();

// ---- 選択肢なしのシーン遷移（scene.next）の点検：併用の規則・輪・到達できるシーン ----
(function () {
  var loadWork = require(path.join(__dirname, "lib", "load-work.js")).loadWork;
  var validate = require(path.join(__dirname, "validate-story.js")).validate;
  var roots = [path.join(__dirname, "fixtures", "linear"), path.join(__dirname, "..")];
  var fresh = function () {
    return loadWork({ roots: roots });
  };
  var has = function (list, scene, word) {
    return list.some(function (m) {
      return m.indexOf("シーン " + scene) === 0 && m.indexOf(word) !== -1;
    });
  };

  // 検証用の一本道の作品：誤り・注意とも 0。next の行き先（s2・end_straight は next でしか行けない）も到達に数える
  var base = validate(fresh());
  eq([base.errors, base.warnings], [[], []], "検証用の一本道の作品");
  eq([base.stats.scenes, base.stats.reachable, base.stats.endings], [13, 13, 3], "next の行き先も到達できるシーンに数える");
  var cut = fresh();
  cut.STORY.scenes.s1.next = "end_straight"; // s2 へ行く道は s1 の next だけ
  var cutR = validate(cut);
  ok(has(cutR.warnings, "s2", "たどり着けません"), "next でしか行けないシーンは、その next が無くなると到達できない");
  eq(cutR.stats.reachable, 12);
  var fnCut = fresh();
  fnCut.STORY.scenes.gate.next = function () {
    return "fork";
  };
  ok(has(validate(fnCut).warnings, "door", "たどり着けません"), "関数の next は試した状態で返った行き先だけを数える");

  // 併用の規則（設計書 §2-1 (c) の表の各行）
  var w = fresh();
  w.STORY.scenes.end_a.next = "opening"; // 1. 結末に next → 注意
  w.STORY.scenes.lastroad.choices.forEach(function (c) {
    c.requires = function (s) {
      return !!s.flags.key;
    };
  }); // 2. choices だけで、全部に requires → 注意
  var wr = validate(w);
  eq(wr.errors, [], "注意だけで誤りは無い");
  ok(has(wr.warnings, "end_a", "結末のシーンに next"), "結末の next は注意");
  ok(has(wr.warnings, "lastroad", "すべての選択肢に requires"), "全部の選択肢に requires は注意");
  eq(wr.warnings.length, 2);
  ok(!has(base.warnings, "fork", "requires") && !has(base.warnings, "door", "requires"), "requires だけの選択肢でも next があれば注意しない");
  ok(!has(base.errors, "fork", "") && !has(base.errors, "door", ""), "choices と next の両方は誤りにしない");

  var e = fresh();
  e.STORY.scenes.l1.next = "nowhere"; // 3. next だけで行き先が無い → 誤り
  e.STORY.scenes.gate.next = function (s) {
    return s.flags.key ? "door" : "nowhere2"; // 関数の行き先も試す
  };
  e.STORY.scenes.fork.next = "nowhere3"; // 両方ある場合も行き先は点検する
  delete e.STORY.scenes.s1.next; // 5. どちらも無い → 誤り
  e.STORY.scenes.r1.next = 42; // 型の誤り
  var er = validate(e);
  ok(has(er.errors, "l1", "nowhere"), "next の行き先が無い（文字列）");
  ok(has(er.errors, "gate", "nowhere2"), "next の行き先が無い（関数）");
  ok(has(er.errors, "fork", "nowhere3"), "選択肢と併用した next の行き先が無い");
  ok(has(er.errors, "s1", "選択肢も next もありません"), "どちらも無いシーンの文言");
  ok(has(er.errors, "r1", "next はシーン ID"), "next の型");
  ok(!er.errors.concat(er.warnings).some(function (m) {
    return m.indexOf("結末でないのに選択肢がありません") !== -1;
  }), "旧い文言は出ない");
  var unknown = fresh();
  unknown.STORY.scenes.l1.nxt = "l2";
  ok(has(validate(unknown).errors, "l1", "知らない項目 nxt"), "next 以外の知らない項目は今までどおり誤り");

  // 輪：next だけで抜けられない A → B → A は誤り。関数で状態しだいで抜けられるなら注意
  var loop = fresh();
  loop.STORY.scenes.l2.next = "l1";
  var lr = validate(loop);
  ok(has(lr.errors, "l1", "抜けられません") && lr.errors.join().indexOf("l1・l2") !== -1, "A → B → A を誤りにする");
  var self = fresh();
  self.STORY.scenes.s2.next = "s2";
  ok(has(validate(self).errors, "s2", "抜けられません"), "自分自身へ戻る next も輪");
  var esc = fresh();
  esc.STORY.scenes.l2.next = function (s) {
    return s.flags.left ? "l1" : "gate";
  };
  var escR = validate(esc);
  eq(escR.errors, [], "関数で抜けられる輪は誤りにしない");
  ok(has(escR.warnings, "l2", "関数しだいで抜けられます"), "関数で抜けられる輪は注意");
  var viaChoice = fresh();
  viaChoice.STORY.scenes.lastroad.choices[1].next = "l1";
  viaChoice.STORY.scenes.l2.next = "lastroad";
  eq([validate(viaChoice).errors, validate(viaChoice).warnings], [[], []], "選択肢を挟む輪は、選んで抜けられるので点検しない");

  // 長編の生成データ：既定の出力は変えない／--linear（一本道を混ぜる）でも誤り・注意 0、全シーンに到達できる
  var gen = require(path.join(__dirname, "fixtures", "long", "gen.js"));
  var plain = gen.build({ chapters: 3, scenesPerChapter: 20 });
  ok(Object.keys(plain.files).every(function (k) {
    return plain.files[k].indexOf("        next:") === -1; // シーンの next（選択肢の next は同じ行の中に書かれる）
  }), "既定の生成データは next を使わない");
  var mixed = gen.build({ chapters: 3, scenesPerChapter: 20, linear: true });
  var lw = loadWork({ roots: [path.join(__dirname, "..")], files: mixed.files });
  var lv = validate(lw);
  eq([lv.errors, lv.warnings], [[], []], "一本道を混ぜた生成データ");
  eq(lv.stats.reachable, lv.stats.scenes, "一本道を混ぜても全シーンに到達できる");
  ok(mixed.stats.linear > 0, "一本道のシーンがある（" + mixed.stats.linear + "）");
})();

// ---- 状態変数（STORY.vars / state.vars。js/state.js）：宣言・更新・範囲・補完・控え、旧セーブの互換、変数による分岐 ----
(function () {
  var fs = require("fs");
  var GameState = require(path.join(__dirname, "..", "js", "state.js"));
  var VSTORY = require(path.join(__dirname, "fixtures", "vars", "js", "story.js"));
  var clone = function (v) {
    return JSON.parse(JSON.stringify(v));
  };
  // console.warn を一時的に受け取る（未宣言の変数への更新は警告して無視する）
  var warned = [];
  var quiet = function (fn) {
    var orig = console.warn;
    console.warn = function (m) {
      warned.push(String(m));
    };
    try {
      return fn();
    } finally {
      console.warn = orig;
    }
  };
  var SIX = ["affection", "flags", "log", "scene", "shards", "steps"];

  // (1) 変数を宣言しない作品（本作）：状態・セーブ・控えの形は従来と同じ
  var own = GameState.create(STORY);
  ok(!own.hasVars, "本作は変数を宣言していない");
  ok(STORY.vars === undefined, "本作の STORY に vars は無い");
  eq(Object.keys(own.newState()).sort(), SIX, "本作の新しい状態は従来の 6 項目");
  var o1 = own.newState();
  warned = [];
  quiet(function () {
    own.applyEffects(o1, { affection: 2, vars: { gold: 5 } });
  });
  eq([o1.affection, "vars" in o1, warned.length], [2, false, 1], "宣言の無い作品で effects.vars は無視して警告（vars は作らない）");
  eq(Object.keys(GameState.snapshotOf(o1)).sort(), ["affection", "flags", "scene", "shards", "steps"], "本作の控えは従来の 5 項目");
  var stray = own.restoreState({ scene: "meet", affection: 0, shards: 0, flags: {}, steps: 1, log: [], vars: { x: 1 } });
  ok(!("vars" in stray), "宣言の無い作品では、セーブにある vars を落とす（書き戻さない）");

  // (2) 旧セーブ：ver 2.1 と 3.0-p4（第2弾B 時点の実コードが書き出したもの）。どちらも vars を含まない
  [["v2.1-localstorage.json", "ver 2.1"], ["3.0-p4-localstorage.json", "3.0-p4（第2弾B）"]].forEach(function (f) {
    var dump = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", f[0]), "utf8"));
    var auto = JSON.parse(dump["chrono-tale-save-v1"]);
    ok(!("vars" in auto), f[1] + " のセーブに vars は無い");
    ok(own.isValidSave(auto), f[1] + " のオートセーブは再開できる");
    var r = own.restoreState(auto);
    var expect = clone(auto);
    if (typeof expect.steps !== "number") expect.steps = 0;
    eq(r, expect, f[1] + " のオートセーブは、復元しても中身が変わらない（vars を足さない）");
    eq(JSON.stringify(own.restoreState(r)), JSON.stringify(r), f[1] + "：復元を繰り返しても同じ");
    var slots = dump["chrono-tale-slots-v1"] ? JSON.parse(dump["chrono-tale-slots-v1"]) : {};
    Object.keys(slots).forEach(function (n) {
      ok(own.isValidSave(slots[n].state), f[1] + " のスロット " + n + " は再開できる");
      eq(own.restoreState(slots[n].state), slots[n].state, f[1] + " のスロット " + n + " は復元しても中身が変わらない");
    });
    auto.log.forEach(function (e) {
      if (e.k === "c" && e.s) ok(own.canRewindFrom(e.s), f[1] + "：控えのある選択肢の行からは戻れる（本作は vars を求めない）");
      if (e.k === "c" && !e.s) ok(!own.canRewindFrom(e.s), f[1] + "：控えの無い行からは戻れない（従来どおり）");
    });
  });

  // (3) 変数を宣言した作品（tools/fixtures/vars）
  var V = GameState.create(VSTORY);
  ok(V.hasVars, "検証用の作品は変数を宣言している");
  var n0 = V.newState();
  eq(n0.vars, { gold: 100, trust: { aoi: 0, beni: 0, sui: 0 } }, "新しい状態の vars は宣言の初期値");
  eq(Object.keys(n0).sort(), SIX.concat(["vars"]).sort(), "最上位に vars が 1 つ増える");
  var initDefault = GameState.create({ start: "x", scenes: {}, vars: { a: {}, b: { initial: -5, min: 0 } } }).newState().vars;
  eq(initDefault, { a: 0, b: 0 }, "initial の省略は 0、範囲の外の初期値は範囲へ収める");

  var e1 = V.newState();
  V.applyEffects(e1, { vars: { gold: -30, trust: { aoi: 2, beni: -1 } } });
  eq(e1.vars, { gold: 70, trust: { aoi: 2, beni: 0, sui: 0 } }, "数値は加算、下限で止まる（beni 0 − 1 → 0）");
  V.applyEffects(e1, { vars: { gold: -500, trust: { sui: 12 } } });
  eq(e1.vars, { gold: 0, trust: { aoi: 2, beni: 0, sui: 10 } }, "下限 0・上限 10 へ収める");
  V.applyEffects(e1, { vars: { gold: { set: 42 }, trust: { aoi: { set: 7 }, beni: { set: 99 } } } });
  eq(e1.vars, { gold: 42, trust: { aoi: 7, beni: 10, sui: 10 } }, "{ set } は代入、代入も範囲へ収める");
  V.applyEffects(e1, { vars: { gold: 1000 } });
  eq(e1.vars.gold, 1042, "上限の無い変数は上に制限なし");
  V.applyEffects(e1, { affection: 1, flags: { met: true }, vars: { gold: 0 } });
  eq([e1.affection, e1.flags.met, e1.vars.gold], [1, true, 1042], "既存の affection・flags と併用できる");
  var before = clone(e1);
  warned = [];
  quiet(function () {
    V.applyEffects(e1, { vars: { silver: 3 } }); // 宣言に無い変数
    V.applyEffects(e1, { vars: { trust: { kuro: 1 } } }); // per に無い人物
    V.applyEffects(e1, { vars: { trust: 3 } }); // 人物ごとの変数に数値だけ
    V.applyEffects(e1, { vars: { trust: { set: 3 } } }); // 人物ごとの変数は per で判断する（set は人物 ID 扱い）
    V.applyEffects(e1, { vars: { gold: "10" } }); // 形の誤り
    V.applyEffects(e1, { vars: { gold: { add: 1 } } });
  });
  eq(e1, before, "当てられない更新は無視する（進行は止めない）");
  eq(warned.length, 6, "当てられない更新ごとにコンソールへ警告");
  ok(warned.every(function (m) {
    return m.indexOf("[GameState]") === 0;
  }), "警告の出所が分かる");

  // 復元時の補完（設計 §1-1 (e) の表。宣言から外れた変数はマスターの決定で落とす）
  var base = { scene: "market", affection: 0, shards: 0, flags: {}, steps: 1, log: [] };
  var withV = function (vars) {
    var x = clone(base);
    if (vars !== undefined) x.vars = vars;
    return x;
  };
  eq(V.restoreState(withV()).vars, n0.vars, "vars の無い旧セーブ → 宣言の初期値で作る");
  ok(V.isValidSave(withV()), "isValidSave は vars を求めない（条件は従来どおり）");
  eq(V.restoreState(withV({ gold: 55 })).vars, { gold: 55, trust: { aoi: 0, beni: 0, sui: 0 } }, "セーブに無い変数 → 初期値で補う");
  eq(V.restoreState(withV({ gold: 55, trust: { aoi: 4 } })).vars.trust, { aoi: 4, beni: 0, sui: 0 }, "セーブに無い人物 → 初期値で補う");
  eq(V.restoreState(withV({ gold: "x", trust: { aoi: null, beni: 3, sui: NaN } })).vars, { gold: 100, trust: { aoi: 0, beni: 3, sui: 0 } }, "数値でない → 初期値");
  eq(V.restoreState(withV({ gold: -9, trust: { aoi: 25, beni: -1, sui: 10 } })).vars, { gold: 0, trust: { aoi: 10, beni: 0, sui: 10 } }, "範囲外 → 範囲へ収める");
  eq(V.restoreState(withV({ gold: 3, silver: 9, trust: { aoi: 1, kuro: 5 } })).vars, { gold: 3, trust: { aoi: 1, beni: 0, sui: 0 } }, "宣言に無い変数・人物 → 落とす");
  eq(V.restoreState(withV({ gold: 3, trust: 7 })).vars.trust, { aoi: 0, beni: 0, sui: 0 }, "人物ごとの変数が数値で入っていたら初期値");
  eq(V.restoreState(withV("broken")).vars, n0.vars, "vars がオブジェクトでなければ初期値");
  var saved = withV({ gold: 3, trust: { aoi: 1, beni: 2, sui: 3 } });
  var restored = V.restoreState(saved);
  restored.vars.trust.aoi = 9;
  eq(saved.vars.trust.aoi, 1, "復元は元のセーブと独立した複製");

  // 巻き戻し用の控え
  var live = V.newState();
  V.applyEffects(live, { vars: { gold: -10, trust: { beni: 2 } } });
  var snap = GameState.snapshotOf(live);
  eq(snap.vars, { gold: 90, trust: { aoi: 0, beni: 2, sui: 0 } }, "控えに vars の写しが入る");
  V.applyEffects(live, { vars: { gold: -50, trust: { beni: 5 } } });
  eq(snap.vars, { gold: 90, trust: { aoi: 0, beni: 2, sui: 0 } }, "控えはその後の更新と独立（入れ子も複製）");
  ok(V.canRewindFrom(snap), "vars のある控えからは戻れる");
  var oldSnap = clone(snap);
  delete oldSnap.vars;
  ok(!V.canRewindFrom(oldSnap) && V.isValidSave(oldSnap), "変数を宣言した作品では、vars の無い旧い控えからは戻れない（セーブとしては有効）");
  eq(V.restoreState(snap).vars, snap.vars, "控えから戻すと、選んだ時点の値に戻る");

  // (4) 変数の増減で分岐が変わる（エンジンと同じ順で進める：選ぶ → effects → 行き先の onEnter → next）
  function play(picks) {
    var st = V.newState();
    var route = [st.scene];
    var shown = [];
    var guard = 0;
    while (!VSTORY.scenes[st.scene].ending && guard++ < 20) {
      var scene = VSTORY.scenes[st.scene];
      var next;
      if (GameState.goesNext(scene, st)) next = GameState.resolve(scene.next, V.restoreState(st));
      else {
        var vis = GameState.visibleChoices(scene, st);
        shown.push(vis.map(function (c) {
          return c.text;
        }));
        var want = picks.shift();
        var choice = vis.filter(function (c) {
          return c.text.indexOf(want) === 0;
        })[0];
        if (!choice) return { route: route, shown: shown, missing: want };
        var probe = V.restoreState(st);
        V.applyEffects(probe, choice.effects);
        next = GameState.resolve(choice.next, probe);
        st.log.push({ k: "c", text: choice.text, s: GameState.snapshotOf(st) });
        V.applyEffects(st, choice.effects);
      }
      st.scene = next;
      st.steps += 1;
      V.applyEffects(st, VSTORY.scenes[next].onEnter);
      route.push(next);
    }
    return { route: route, shown: shown, state: st, text: GameState.resolve(VSTORY.scenes.plaza.text, st) };
  }
  var ALL = ["花を買う（30）", "指輪を買う（120）", "何も買わない"];
  var pA = play(["アオイ", "花"]);
  eq(pA.route, ["opening", "market", "plaza", "end_aoi"], "アオイ +3 → 花 +1 = 4 → END A");
  eq(pA.state.vars, { gold: 90, trust: { aoi: 4, beni: 0, sui: 0 } });
  eq(pA.shown[1], ALL, "所持金 120（100 ＋ onEnter 20）なら指輪も見える");
  eq(play(["アオイ", "何も"]).route.pop(), "end_alone", "花を買わなければ 3 のまま → END D（1 の差で分岐が変わる）");
  var pR = play(["アオイ", "指輪"]);
  eq([pR.route.pop(), pR.state.vars], ["end_beni", { gold: 0, trust: { aoi: 3, beni: 5, sui: 0 } }], "指輪：gold を 0 に代入、beni −1（0 止まり）＋5 → END B");
  eq(pR.text[1], "（広 2）財布の中身は 0 枚。", "本文の関数が変数を読む");
  eq(play(["ベニ", "何も"]).route.pop(), "end_beni", "ベニ +3 → END B");
  var pS = play(["スイ", "花"]);
  eq(pS.shown[1], ["花を買う（30）", "何も買わない"], "所持金 90 では指輪の選択肢が隠れる（requires が変数を読む）");
  eq([pS.route.pop(), pS.state.vars], ["end_sui", { gold: 60, trust: { aoi: 1, beni: 0, sui: 10 } }], "スイ +12 は上限 10 で止まり、それでも END C");
  eq(play(["スイ", "指輪"]).missing, "指輪", "隠れた選択肢は選べない");
  // 控えからの巻き戻し：opening の選択肢へ戻ると、変数も選ぶ前の値に戻る
  var back = V.restoreState(pA.state.log[0].s);
  eq([back.scene, back.vars], ["opening", n0.vars], "最初の選択肢の控えへ戻ると、変数は初期値");
  eq(V.restoreState(pA.state.log[1].s).vars, { gold: 120, trust: { aoi: 3, beni: 0, sui: 0 } }, "市場の選択肢の控えは、市場に入った時点の値");
  // セーブ → ロード（JSON を通す）で値が戻る
  var json = JSON.parse(JSON.stringify(pS.state));
  eq(V.restoreState(json).vars, pS.state.vars, "セーブの JSON を通しても値が戻る");
})();

// ---- 状態変数の点検（tools/validate-story.js）：検証用の作品は誤り・注意とも 0、壊したものを誤り・注意として拾う ----
(function () {
  var loadWork = require(path.join(__dirname, "lib", "load-work.js")).loadWork;
  var vs = require(path.join(__dirname, "validate-story.js"));
  var roots = [path.join(__dirname, "fixtures", "vars"), path.join(__dirname, "..")];
  var fresh = function () {
    return loadWork({ roots: roots });
  };
  var hasMsg = function (list, where, word) {
    return list.some(function (m) {
      return m.indexOf(where) === 0 && m.indexOf(word) !== -1;
    });
  };
  ok(fresh().State && typeof fresh().State.create === "function", "load-work は js/state.js（GameState）も読む");
  var base = vs.validate(fresh());
  eq([base.errors, base.warnings], [[], []], "変数を使う検証用の作品");
  eq([base.stats.scenes, base.stats.reachable, base.stats.endings], [7, 7, 4], "変数を振って、next の関数の 4 つの行き先すべてに届く");

  eq(vs.varsIn(function (s) {
    return s.vars.trust.aoi > s.vars["gold"] && s.vars.trust["beni"];
  }), [{ name: "trust", key: "aoi" }, { name: "gold", key: null }, { name: "trust", key: "beni" }], "関数の中の .vars.xxx を拾う");
  eq(vs.varSamples({ initial: 0, min: 0, max: 10, per: null }), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "幅 20 以下は全部の整数");
  eq(vs.varSamples({ initial: 5, min: 0, max: 1000, per: null }).length, 27, "幅が広いときは初期値の前後 20 と下限・上限");

  // 試した範囲で届かない行き先は、届かないと注意する（上限 10 の変数に 11 以上を求める）
  var high = fresh();
  high.STORY.scenes.plaza.next = function (s) {
    return s.vars.trust.aoi >= 11 ? "end_aoi" : "end_alone";
  };
  ok(hasMsg(vs.validate(high).warnings, "シーン end_aoi", "たどり着けません"), "上限を超える条件の行き先は到達できない");

  // 使う側の誤り
  var u = fresh();
  u.STORY.scenes.opening.choices[0].effects.vars.silver = 1; // 未宣言
  u.STORY.scenes.opening.choices[1].effects.vars.trust.kuro = 1; // per に無い人物
  u.STORY.scenes.opening.choices[2].effects.vars.gold = "30"; // 形
  u.STORY.scenes.market.onEnter.vars.trust = 2; // 人物ごとの変数に数値だけ
  u.STORY.scenes.market.choices[2].effects = { vars: { gold: { add: 3 } } }; // set 以外
  u.STORY.scenes.market.choices[0].requires = function (s) {
    return s.vars.trust.kuro > 0 || s.vars.mana > 0; // 関数の中の未宣言
  };
  var ur = vs.validate(u);
  ok(hasMsg(ur.errors, "シーン opening の選択肢 1 の effects", "silver は STORY.vars で宣言されていません"), "effects の未宣言の変数は誤り");
  ok(hasMsg(ur.errors, "シーン opening の選択肢 2 の effects", "per に人物 kuro がありません"), "per に無い人物は誤り");
  ok(hasMsg(ur.errors, "シーン opening の選択肢 3 の effects", "gold の更新は数値"), "更新の形の誤り");
  ok(hasMsg(ur.errors, "シーン market の onEnter", "人物ごとの変数 trust"), "onEnter の人物ごとの変数の形");
  ok(hasMsg(ur.errors, "シーン market の選択肢 3 の effects", "{ set: 数値 }"), "{ set } 以外のオブジェクトは誤り");
  ok(hasMsg(ur.errors, "シーン market", "trust.kuro の人物 kuro は per にありません"), "関数が読む人物の綴り違い");
  ok(hasMsg(ur.errors, "シーン market", "変数 mana は STORY.vars で宣言されていません"), "関数が読む未宣言の変数");
  eq(ur.warnings, [], "使う側の誤りで注意は増えない");

  // 宣言の誤り
  var d = fresh();
  d.STORY.vars = {
    set: { initial: 0 },
    "9lives": {},
    ok1: { initial: 0, step: 1 },
    ok2: { initial: "0" },
    ok3: { min: 5, max: 1 },
    ok4: { initial: 20, max: 10 },
    ok5: { per: [] },
    ok6: { per: ["aoi", "aoi"] },
    ok7: 3,
    gold: { initial: 100, min: 0 },
    trust: { initial: 0, min: 0, max: 10, per: ["aoi", "beni", "sui", "ghost"] }
  };
  var dr = vs.validate(d);
  [["STORY.vars.set", "set は使えません"], ["STORY.vars.9lives", "先頭は英字"], ["STORY.vars.ok1", "知らない項目 step"], ["STORY.vars.ok2", "数値にしてください"],
    ["STORY.vars.ok3", "min（5）が max（1）"], ["STORY.vars.ok4", "範囲の外"], ["STORY.vars.ok5", "1 つ以上"], ["STORY.vars.ok6", "2 回あります"], ["STORY.vars.ok7", "オブジェクトではありません"]].forEach(function (x) {
    ok(hasMsg(dr.errors, x[0], x[1]), "宣言の誤り：" + x[0]);
  });
  eq(dr.errors.length, 9, "正しい宣言（gold・trust）は誤りにしない");
  eq(dr.warnings, ["STORY.vars.trust：per の ghost は manifest の characters にも STORY.cast にもありません"], "per の人物が見つからなければ注意");
  var notObj = fresh();
  notObj.STORY.vars = [1];
  ok(hasMsg(vs.validate(notObj).errors, "STORY.vars", "オブジェクト"), "STORY.vars が配列なら誤り");
  var none = fresh();
  delete none.STORY.vars;
  ok(hasMsg(vs.validate(none).errors, "シーン opening の選択肢 1 の effects", "trust は STORY.vars で宣言されていません"), "宣言が無い作品で effects.vars を使うと誤り");
})();

// ---- 周回をまたぐ解放（STORY.unlocks。js/state.js）：到達済みエンディング → 新規開始の初期フラグ ----
(function () {
  var fs = require("fs");
  var GameState = require(path.join(__dirname, "..", "js", "state.js"));
  var USTORY = require(path.join(__dirname, "fixtures", "unlock", "js", "story.js"));
  var SIX = ["affection", "flags", "log", "scene", "shards", "steps"];
  var warned = [];
  var quiet = function (fn) {
    var orig = console.warn;
    console.warn = function (m) {
      warned.push(String(m));
    };
    try {
      return fn();
    } finally {
      console.warn = orig;
    }
  };

  // (1) 宣言の無い作品（本作）：到達記録を渡しても newState は従来どおり
  ok(STORY.unlocks === undefined, "本作の STORY に unlocks は無い");
  var own = GameState.create(STORY);
  var plain = own.newState();
  [["true", "normal", "bad", "another"], ["bad"], [], null, undefined, "true", [1, {}]].forEach(function (r) {
    eq(own.newState(r), plain, "本作：到達記録 " + JSON.stringify(r) + " でも最初の状態は同じ");
  });
  eq([Object.keys(plain).sort(), plain.flags], [SIX, {}], "本作の最初の状態は従来の 6 項目・flags は空");
  eq(own.unlockedFlags(["true", "normal", "bad", "another"]), [], "本作では解放されるフラグは無い");
  // 旧セーブ（ver 2.1・3.0-p4）は従来どおり読める（restoreState は解放に触れない）
  [["v2.1-localstorage.json", "ver 2.1"], ["3.0-p4-localstorage.json", "ver 3.0-p4"]].forEach(function (f) {
    var dump = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", f[0]), "utf8"));
    var auto = JSON.parse(dump["chrono-tale-save-v1"]);
    var expect = JSON.parse(JSON.stringify(auto));
    if (typeof expect.steps !== "number") expect.steps = 0;
    ok(own.isValidSave(auto), f[1] + " のオートセーブは有効");
    eq(own.restoreState(auto), expect, f[1] + " のオートセーブは、復元しても中身が変わらない（解放のフラグを足さない）");
    var seen = JSON.parse(dump["chrono-tale-endings-v1"] || "[]");
    eq(own.newState(seen), plain, f[1] + " の到達記録 " + JSON.stringify(seen) + " で新規開始しても従来どおり");
  });

  // (2) 宣言のある作品（tools/fixtures/unlock）：4 つのバッドエンディングの到達の全 16 通り
  var U = GameState.create(USTORY);
  var BADS = ["bad_aoi", "bad_beni", "bad_sui", "bad_kuro"];
  var ROUTES = ["アオイについていく", "ベニについていく", "スイについていく", "クロについていく"];
  for (var mask = 0; mask < 16; mask++) {
    var reached = BADS.filter(function (_, i) {
      return mask & (1 << i);
    });
    var n = reached.length;
    var st = U.newState(reached);
    var want = {};
    if (reached.indexOf("bad_aoi") !== -1) want.seen_aoi = true;
    if (n >= 2) want.two_bad = true;
    if (n === 4) want.true_route = true;
    var tag = "到達 [" + reached.join(",") + "]";
    eq(st.flags, want, tag + " → 新規開始のフラグ");
    eq(Object.keys(st).sort(), SIX, tag + "：最上位の形は従来の 6 項目のまま");
    var shown = GameState.visibleChoices(USTORY.scenes.opening, st).map(function (c) {
      return c.text;
    });
    eq(shown, ROUTES.concat(n >= 2 ? ["見覚えのある道"] : [], n === 4 ? ["真実の扉"] : []), tag + "：フラグを条件にした選択肢が見える");
    var text = Stage.pageTexts(GameState.resolve(USTORY.scenes.opening.text, st));
    eq(text.length, reached.indexOf("bad_aoi") !== -1 ? 3 : 2, tag + "：本文の関数がフラグを読む");
  }
  // 順番・重複・宣言に無い結末・別の作品の ID は結果に影響しない
  eq(U.newState(["bad_kuro", "x", "bad_sui", "bad_sui", "true"]).flags, { two_bad: true }, "宣言に無い ID・重複は数えない");
  eq(U.newState(BADS.slice().reverse()).flags, U.newState(BADS).flags, "到達の順番に依らない");
  eq(U.newState(BADS.concat(["normal", "true"])).flags, { seen_aoi: true, two_bad: true, true_route: true }, "ほかの結末が増えても同じ");
  eq([U.newState().flags, U.newState(null).flags, U.newState("bad_aoi").flags], [{}, {}, {}], "到達記録が無い・配列でない → 何も立てない");
  eq(U.unlockedFlags(BADS), ["seen_aoi", "two_bad", "true_route"], "解放されるフラグは宣言の順");
  var a1 = U.newState(BADS);
  a1.flags.true_route = false;
  eq(U.newState(BADS).flags.true_route, true, "新しい状態は毎回独立");

  // (3) 進行中の既存セーブには影響しない：1 周目のセーブ（flags 空）を、全部到達したあとに復元しても flags は空のまま
  var run1 = U.newState([]);
  run1.log.push({ k: "s", title: "四つの道" });
  var saved = JSON.parse(JSON.stringify(run1));
  eq(U.restoreState(saved).flags, {}, "既存のセーブを復元しても解放のフラグは足されない");
  ok(U.canRewindFrom(GameState.snapshotOf(U.newState(BADS))), "解放のフラグを持った控えから戻れる");
  eq(U.restoreState(GameState.snapshotOf(U.newState(BADS))).flags, { seen_aoi: true, two_bad: true, true_route: true }, "控えから戻すと、その周のフラグのまま");

  // (4) 通しの進行（エンジンと同じ順）：到達 → 記録 → 新規開始 → 選択肢 → 結末。4 周でトゥルーが開く
  var record = [];
  function play(pick) {
    var st = U.newState(record.slice());
    var guard = 0;
    while (!USTORY.scenes[st.scene].ending && guard++ < 10) {
      var scene = USTORY.scenes[st.scene];
      var next;
      if (GameState.goesNext(scene, st)) next = GameState.resolve(scene.next, U.restoreState(st));
      else {
        var c = GameState.visibleChoices(scene, st).filter(function (x) {
          return x.text === pick;
        })[0];
        if (!c) return { missing: pick, flags: st.flags };
        next = GameState.resolve(c.next, st);
      }
      st.scene = next;
      st.steps += 1;
      U.applyEffects(st, USTORY.scenes[next].onEnter);
    }
    var id = USTORY.scenes[st.scene].ending.id;
    if (record.indexOf(id) === -1) record.push(id);
    return { end: id, flags: st.flags };
  }
  eq(play("真実の扉").missing, "真実の扉", "1 周目：真実の扉は見えない");
  eq(play("アオイについていく").end, "bad_aoi");
  eq(play("見覚えのある道"), { missing: "見覚えのある道", flags: { seen_aoi: true } }, "2 周目：1 つ到達では見覚えのある道は見えない");
  eq(play("ベニについていく"), { end: "bad_beni", flags: { seen_aoi: true } });
  eq(play("見覚えのある道"), { end: "normal", flags: { seen_aoi: true, two_bad: true } }, "3 周目：2 つ到達で見覚えのある道 → NORMAL");
  eq(play("真実の扉").missing, "真実の扉", "4 周目：2 つではまだ真実の扉は見えない");
  play("スイについていく");
  eq(play("真実の扉").missing, "真実の扉", "3 つでも見えない");
  play("クロについていく");
  eq(play("真実の扉"), { end: "true", flags: { seen_aoi: true, two_bad: true, true_route: true } }, "4 つ全部に到達した次の周で真実の扉 → TRUE");
  eq(Stage.pageTexts(GameState.resolve(USTORY.scenes.true_gate.text, U.newState(record)))[1], "（扉 2）すべてを覚えている。");

  // (5) 宣言の崩れ：エンジンは崩れた宣言だけを無視して警告する（進行は止めない）
  var bad = quiet(function () {
    return GameState.create({ start: "x", scenes: {}, unlocks: { a: { endings: "e1" }, b: { endings: [] }, c: 3, d: { endings: ["e1", "e2"], count: 1 }, e: { endings: ["e1", "e2"], count: 9 } } });
  });
  eq(bad.unlockedFlags(["e1"]), ["d"], "崩れた宣言（a・b・c）は無視、count 1 は 1 つで解放、count が大きすぎれば全部（e）");
  eq(bad.unlockedFlags(["e1", "e2"]), ["d", "e"]);
  eq(warned.length, 3, "崩れた宣言ごとに警告");
  warned = [];
  quiet(function () {
    eq(GameState.create({ start: "x", scenes: {}, unlocks: ["a"] }).newState(["a"]).flags, {}, "unlocks が配列なら無視");
  });
  eq(warned.length, 1);
})();

// ---- 解放の点検（tools/validate-story.js）：検証用の作品は誤り・注意とも 0、壊したものを誤り・注意として拾う ----
(function () {
  var loadWork = require(path.join(__dirname, "lib", "load-work.js")).loadWork;
  var vs = require(path.join(__dirname, "validate-story.js"));
  var roots = [path.join(__dirname, "fixtures", "unlock"), path.join(__dirname, "..")];
  var fresh = function () {
    return loadWork({ roots: roots });
  };
  var hasMsg = function (list, where, word) {
    return list.some(function (m) {
      return m.indexOf(where) === 0 && m.indexOf(word) !== -1;
    });
  };
  var base = vs.validate(fresh());
  eq([base.errors, base.warnings], [[], []], "解放を使う検証用の作品");
  eq([base.stats.scenes, base.stats.reachable, base.stats.endings, base.stats.unlocks], [8, 8, 6, 3]);
  eq(vs.validate(loadWork({ roots: [path.join(__dirname, "..")] })).stats.unlocks, 0, "本作の解放は 0 件");

  var d = fresh();
  d.STORY.unlocks = {
    ok: { endings: ["bad_aoi"] },
    typo: { endings: ["bad_aoi", "bad_ao"] },
    dup: { endings: ["bad_aoi", "bad_aoi"] },
    empty: { endings: [] },
    str: { endings: "bad_aoi" },
    cnt0: { endings: ["bad_aoi"], count: 0 },
    cnt3: { endings: ["bad_aoi", "bad_beni"], count: 3 },
    cntf: { endings: ["bad_aoi", "bad_beni"], count: 1.5 },
    key: { endings: ["bad_aoi"], when: "all" },
    num: 1,
    "9x": { endings: ["bad_aoi"] },
    scene: { endings: ["end_bad_aoi"] }
  };
  var dr = vs.validate(d);
  [["STORY.unlocks.typo", "bad_ao の結末がありません"], ["STORY.unlocks.dup", "2 回あります"], ["STORY.unlocks.empty", "1 つ以上"], ["STORY.unlocks.str", "1 つ以上"],
    ["STORY.unlocks.cnt0", "count は 1 から"], ["STORY.unlocks.cnt3", "count は 1 から"], ["STORY.unlocks.cntf", "count は 1 から"], ["STORY.unlocks.key", "知らない項目 when"],
    ["STORY.unlocks.num", "オブジェクトではありません"], ["STORY.unlocks.9x", "フラグ名"], ["STORY.unlocks.scene", "end_bad_aoi の結末がありません"]].forEach(function (x) {
    ok(hasMsg(dr.errors, x[0], x[1]), "解放の宣言の誤り：" + x[0]);
  });
  eq(dr.errors.length, 11, "正しい宣言（ok）は誤りにしない");
  ok(!dr.errors.some(function (m) { return m.indexOf("STORY.unlocks.ok：") === 0; }));
  eq(dr.warnings, ["STORY.unlocks.ok：フラグ ok を読む関数（requires・next・text）がありません（解放しても何も変わりません）"], "読まれないフラグは注意");
  var arr = fresh();
  arr.STORY.unlocks = [];
  ok(hasMsg(vs.validate(arr).errors, "STORY.unlocks", "オブジェクト"), "STORY.unlocks が配列なら誤り");

  // 解放できない（条件のエンディングに、そのフラグなしでは届かない）
  var lock = fresh();
  lock.STORY.unlocks.true_route = { endings: ["bad_aoi", "bad_beni", "bad_sui", "bad_kuro", "true"] };
  var lr = vs.validate(lock);
  eq(lr.errors, [], "自分の条件に自分で開く結末を入れても誤りではない");
  ok(hasMsg(lr.warnings, "STORY.unlocks.true_route", "4 個にしか届きません（必要 5 個。届かない：true）"), "フラグなしでは届かない結末を条件にすると注意");
  var lock2 = fresh();
  lock2.STORY.unlocks.two_bad = { endings: ["normal", "bad_aoi"], count: 2 };
  ok(hasMsg(vs.validate(lock2).warnings, "STORY.unlocks.two_bad", "届かない：normal"), "count 個に届かなければ注意");
  var lock3 = fresh();
  lock3.STORY.unlocks.two_bad = { endings: ["normal", "bad_aoi"], count: 1 };
  eq(vs.validate(lock3).warnings, [], "count 個に届けば注意しない");
  // その周の中でも同じフラグを立てている
  var mix = fresh();
  mix.STORY.scenes.opening.choices[0].effects = { flags: { true_route: true } };
  ok(hasMsg(vs.validate(mix).warnings, "STORY.unlocks.true_route", "effects・onEnter でも立てています（シーン opening）"), "effects でも立てるフラグは注意");
})();

console.log("OK: " + checks + " 件の検査に合格（全 " + V3.length + " シーン × 4096 通り = " + replays + " 回の再生、固有の舞台状態 " + Object.keys(statesSeen).length + " 種）");
