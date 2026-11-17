#!/usr/bin/env node
/*
 * 長編規模の検証用データを生成する（本作のデータではない。リポジトリには生成結果を置かない）
 * ------------------------------------------------------------
 *   var files = require("./gen.js").build({ chapters: 40, scenesPerChapter: 20 }).files;
 *     → { "index.html", "js/work.js", "js/story.js", "js/chapters/ch01.js", …, "assets/manifest.json" }
 *     tools/preview-server.js の createServer({ files }) にそのまま渡せる（エンジンと画像は本体のものを使う）。
 *   node tools/fixtures/long/gen.js --out <フォルダ> [--chapters 40] [--scenes 20]   … ファイルに書き出す
 *
 * 作り：章ごとに 1 ファイル（GameStage.addChapter）。シーンは一本道＋ときどきフラグ。
 *   4 シーンに 1 つは「前のシーンで立てたフラグで段落が増える」関数の本文。立ち絵は本作の素材を 1 人ぶん流用。
 *   同じ引数なら必ず同じ内容になる（乱数は使わない）。
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ENGINE_ROOT = path.resolve(__dirname, "..", "..", "..");
var FILLER = [
  "潮の匂いが、石畳の隙間から立ちのぼってくる。",
  "遠くで鐘が鳴り、その余韻が屋根の上を渡っていった。",
  "足もとの影は、歩くたびに少しずつ長くなる。",
  "古い地図の端には、誰かの書き込みが残っていた。",
  "風が向きを変え、旗が一斉にこちらを向いた。",
  "扉の向こうから、かすかに話し声が聞こえる。",
  "数えていた階段の段数を、途中で見失ってしまった。",
  "灯りがひとつ、またひとつと窓にともっていく。"
];
var EXPRS = ["normal", "smile", "wry", "serious", "surprised", "sad"];
var BGS = ["tower_foot", "village_plaza", "forest", "library", "dune_night", "riverbank"];
var THEMES = ["tower", "day", "forest", "ruins", "night", "day"];

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}
function sceneId(c, s) {
  return "c" + pad(c) + "s" + pad(s);
}

function build(options) {
  options = options || {};
  var C = options.chapters || 40;
  var N = options.scenesPerChapter || 20;
  var files = {};
  var stats = { chapters: C, scenes: 0, pagesMax: 0, chars: 0 };

  function pageText(c, s, p) {
    var k = c * 131 + s * 17 + p * 7;
    var body = FILLER[k % FILLER.length] + (k % 3 === 0 ? FILLER[(k + 3) % FILLER.length] : "");
    return "第" + c + "章・場面" + s + "の" + p + "。" + body;
  }

  function sceneSource(c, s) {
    var id = sceneId(c, s);
    var count = 3 + ((c * 7 + s * 5) % 4); // 3〜6 ページ
    var pages = [];
    for (var p = 1; p <= count; p++) {
      var text = pageText(c, s, p);
      stats.chars += text.length;
      if (p === 2) {
        pages.push(JSON.stringify({ text: "「" + text + "」", speaker: "guide", chara: "guide", pose: "stand", expr: EXPRS[(c + s) % EXPRS.length], pos: "center" }));
        stats.chars += 2;
      } else {
        pages.push(JSON.stringify(text));
      }
    }
    var conditional = s % 4 === 1 && s > 1;
    var flagBefore = "f" + pad(c) + "_" + pad(s - 1);
    var extra = "（前の場面で寄り道をした。そのぶんだけ、景色が違って見える。第" + c + "章・場面" + s + "）";
    var textSrc;
    if (conditional) {
      stats.chars += extra.length;
      stats.pagesMax += 1;
      textSrc =
        "function (s) {\n          var t = [" + pages.join(",\n            ") + "];\n" +
        "          if (s.flags." + flagBefore + ") t.splice(1, 0, " + JSON.stringify(extra) + ");\n          return t;\n        }";
    } else {
      textSrc = "[\n          " + pages.join(",\n          ") + "\n        ]";
    }
    stats.pagesMax += count;
    stats.scenes += 1;

    var last = c === C && s === N;
    var next = last ? "end_a" : s === N ? sceneId(c + 1, 1) : sceneId(c, s + 1);
    var choices = [];
    var setsFlag = s % 4 === 0 && s < N;
    choices.push(
      '{ text: "先へ進む（' + id + '）", next: "' + next + '"' + (s % 5 === 0 ? ", effects: { affection: 1 }" : "") + " }"
    );
    choices.push(
      '{ text: "寄り道をしてから進む（' + id + '）", next: "' + next + '"' +
        (setsFlag ? ", effects: { flags: { f" + pad(c) + "_" + pad(s) + ": true } }" : "") + " }"
    );
    if (c === 1 && s === 2) choices.push('{ text: "ここで旅をやめる", next: "end_b" }');
    if (c === 1 && s === 3) choices.push('{ text: "（検証用）最終章の手前まで飛ぶ", next: "' + sceneId(C, N - 1) + '" }');
    return (
      "      " + id + ": {\n" +
      '        title: "場面 ' + c + "-" + s + '",\n        icon: "◇",\n        theme: "' + THEMES[(c + s) % THEMES.length] + '",\n' +
      '        stage: { bg: "' + BGS[(c * 3 + s) % BGS.length] + '" },\n' +
      "        text: " + textSrc + ",\n" +
      "        choices: [\n          " + choices.join(",\n          ") + "\n        ]\n      }"
    );
  }

  var chapterScripts = [];
  for (var c = 1; c <= C; c++) {
    var scenes = [];
    for (var s = 1; s <= N; s++) scenes.push(sceneSource(c, s));
    if (c === C) {
      scenes.push(
        '      end_a: {\n        title: "旅の終わり",\n        icon: "◇",\n        theme: "night",\n' +
          '        ending: { id: "a", name: "END A「旅の終わり」", kind: "true" },\n        stage: { bg: "tower_foot" },\n' +
          '        text: ["長い旅が終わった。", "数えきれない場面を、ここまで歩いてきた。"]\n      }'
      );
      stats.scenes += 1;
      stats.pagesMax += 2;
    }
    var rel = "js/chapters/ch" + pad(c) + ".js";
    files[rel] =
      "/* 検証用の生成データ（第 " + c + " 章）。本作のデータではない */\n(function (root) {\n" +
      '  "use strict";\n  root.GameStage.addChapter(root.STORY, {\n    id: "ch' + pad(c) + '",\n    title: "第' + c + "章　" + ["出立", "潮騒", "迷い道", "灯火", "峠"][c % 5] + '",\n    scenes: {\n' +
      scenes.join(",\n") + "\n    }\n  });\n})(this);\n";
    chapterScripts.push(rel);
  }

  files["js/story.js"] =
    "/* 検証用の生成データ（共通部分）。章は js/chapters/*.js。本作のデータではない */\n(function (root) {\n" +
    '  "use strict";\n  var STORY = {\n    start: "' + sceneId(1, 1) + '",\n    maxShards: 0,\n    maxAffection: ' + Math.ceil((C * N) / 5) + ",\n    endingCount: 2,\n" +
    '    cast: { guide: { name: "案内人", color: "#f2d48a", chara: "guide" } },\n    chapters: [],\n    scenes: {\n' +
    '      end_b: {\n        title: "途中下車",\n        icon: "◇",\n        theme: "night",\n        ending: { id: "b", name: "END B「途中下車」", kind: "bad" },\n' +
    '        text: ["旅は、始まったばかりのところで終わった。"]\n      }\n    }\n  };\n' +
    '  if (typeof module !== "undefined" && module.exports) module.exports = STORY;\n  else root.STORY = STORY;\n})(this);\n';
  stats.scenes += 1;
  stats.pagesMax += 1;

  files["js/work.js"] =
    "/* 検証用の作品設定（長編規模）。本作のデータではない */\n(function (root) {\n" +
    '  "use strict";\n  var WORK = ' +
    JSON.stringify(
      {
        id: "fixture-long",
        title: "長い旅の検証",
        subtitle: "エンジン検証用データ（" + C + " 章 × " + N + " シーン）",
        lead: ["長編の規模で、読み込み・既読・セーブ・バックログを確かめるための仮の物語です。"],
        hud: { heart: { label: "絆", name: "案内人との絆" } },
        slots: 8,
        limits: options.limits || undefined
      },
      null,
      2
    ).replace(/\n/g, "\n  ") +
    ';\n  if (typeof module !== "undefined" && module.exports) module.exports = WORK;\n  else root.WORK = WORK;\n})(this);\n';

  var exprs = {};
  EXPRS.forEach(function (e) {
    exprs[e] = "stand_" + e + ".webp";
  });
  files["assets/manifest.json"] = JSON.stringify(
    {
      version: 2,
      basePath: "assets/",
      defaults: { image: null, bgm: null },
      title: { image: "images/bg/dune_night.webp" },
      backgrounds: {
        tower_foot: { image: "images/bg/tower_foot.webp" },
        village_plaza: { image: "images/bg/village_plaza.webp" },
        forest: { image: "images/forest.jpg" },
        library: { image: "images/library.jpg" },
        dune_night: { image: "images/bg/dune_night.webp" },
        riverbank: { image: "images/river.jpg" }
      },
      characters: { guide: { base: "images/chara/rine/", poses: { stand: { exprs: exprs } } } },
      scenes: {}
    },
    null,
    1
  );

  // index.html はエンジンのものをそのまま使い、章のファイルを stage.js のあとに並べるだけ
  var html = fs.readFileSync(path.join(ENGINE_ROOT, "index.html"), "utf8");
  var anchor = /(<script src="js\/stage\.js[^"]*"><\/script>)/;
  if (!anchor.test(html)) throw new Error("index.html に js/stage.js の <script> がありません");
  files["index.html"] = html.replace(anchor, function (tag) {
    return (
      tag +
      chapterScripts
        .map(function (rel) {
          return '\n  <script src="' + rel + '"></script>';
        })
        .join("")
    );
  });

  stats.bytes = Object.keys(files).reduce(function (n, rel) {
    return /^js\/(story|chapters\/)/.test(rel) ? n + Buffer.byteLength(files[rel]) : n;
  }, 0);
  return { files: files, stats: stats, sceneId: sceneId, chapterScripts: chapterScripts };
}

module.exports = { build: build };

if (require.main === module) {
  var args = process.argv.slice(2);
  var arg = function (name, fallback) {
    var i = args.indexOf(name);
    return i !== -1 ? args[i + 1] : fallback;
  };
  var out = arg("--out", null);
  var built = build({ chapters: parseInt(arg("--chapters", "40"), 10), scenesPerChapter: parseInt(arg("--scenes", "20"), 10) });
  console.log(built.stats);
  if (out) {
    Object.keys(built.files).forEach(function (rel) {
      var file = path.join(out, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, built.files[rel]);
    });
    console.log("書き出しました: " + out);
  }
}
