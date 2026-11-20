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

console.log("OK: " + checks + " 件の検査に合格（全 " + V3.length + " シーン × 4096 通り = " + replays + " 回の再生、固有の舞台状態 " + Object.keys(statesSeen).length + " 種）");
