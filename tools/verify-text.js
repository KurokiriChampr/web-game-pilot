#!/usr/bin/env node
/*
 * 本文不変の検証スクリプト（docs/v3-phase0-research.md §A-5 / §E-5）
 * ------------------------------------------------------------
 * 全シーン × 本文が参照するフラグの全組合せで「表示される段落テキスト列」を展開し、
 * v2.1 の基準データと完全一致するかを確かめる。選択肢（文・効果・表示条件・遷移先）も同様に照合する。
 *
 * 使い方:
 *   node tools/verify-text.js                     現在の js/story.js を基準と照合する
 *   node tools/verify-text.js --capture [--ref c9abfcd]
 *                                                 指定コミットの js/story.js から基準を採取し直す
 *
 * 基準データ: tools/baseline/v2.1-text.json
 *   texts[sceneId] = { lists: [[段落, ...], ...], index: [組合せ番号ごとの lists の添字] }
 *   組合せ番号 n の第 i ビットが flags[i] の真偽（flags は基準データ内に記録）。
 */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var crypto = require("crypto");
var childProcess = require("child_process");

var ROOT = path.resolve(__dirname, "..");
var BASELINE = path.join(__dirname, "baseline", "v2.1-text.json");
// 段落オブジェクトに書いてよい項目（本文 text と舞台指示だけ。分岐や効果に関わる項目は置かない）
var PAGE_KEYS = ["text", "speaker", "chara", "pose", "expr", "pos", "show", "hide", "bg", "cg", "halo", "fx"];
var STAGE_KEYS = ["bg", "cg", "halo", "show"];
var AFFECTION_RANGE = { min: -6, max: 20 }; // 取りうる値（-3〜13）より広く取る

function loadStoryFromSource(source, label) {
  var sandbox = { module: { exports: {} } };
  vm.runInNewContext(source, sandbox, { filename: label });
  return sandbox.module.exports;
}

/** エンジンと同じ正規化（js/stage.js）で「表示される文字列」を取り出す。v2.1 は文字列のみ。 */
function makeTextOf() {
  var stagePath = path.join(ROOT, "js", "stage.js");
  var Stage = fs.existsSync(stagePath) ? require(stagePath) : null;
  return function (pages) {
    if (Stage) return Stage.pageTexts(pages);
    return pages;
  };
}

function flagsIn(fn) {
  var found = {};
  var re = /\.flags\.([A-Za-z_$][\w$]*)/g;
  var m;
  var src = String(fn);
  while ((m = re.exec(src))) found[m[1]] = true;
  return Object.keys(found);
}

function uniq(list) {
  return list.filter(function (v, i) {
    return list.indexOf(v) === i;
  });
}

function stateFor(flagNames, n, affection) {
  var flags = {};
  flagNames.forEach(function (name, i) {
    if (n & (1 << i)) flags[name] = true;
  });
  return { scene: "", affection: affection || 0, shards: 0, flags: flags, steps: 0, log: [] };
}

function expand(story, textOf) {
  var ids = Object.keys(story.scenes);

  // 本文が参照するフラグ（text が関数のシーンのソースから抽出）
  var textFlags = [];
  ids.forEach(function (id) {
    var t = story.scenes[id].text;
    if (typeof t === "function") textFlags = textFlags.concat(flagsIn(t));
  });
  textFlags = uniq(textFlags);
  var combos = 1 << textFlags.length;

  var texts = {};
  var hash = crypto.createHash("sha256");
  var paragraphs = 0;
  ids.forEach(function (id) {
    var scene = story.scenes[id];
    var lists = [];
    var seen = {};
    var index = [];
    for (var n = 0; n < combos; n++) {
      var raw = typeof scene.text === "function" ? scene.text(stateFor(textFlags, n)) : scene.text;
      var list = textOf(raw || []);
      list.forEach(function (p) {
        if (typeof p !== "string") throw new Error(id + ": 段落が文字列ではありません（組合せ " + n + "）");
      });
      var key = JSON.stringify(list);
      if (!(key in seen)) {
        seen[key] = lists.length;
        lists.push(list);
      }
      index.push(seen[key]);
      paragraphs += list.length;
      hash.update(id + "\u0000" + n + "\u0000" + key + "\n");
    }
    texts[id] = { lists: lists, index: index };
  });

  // 選択肢：文・効果（静的）と、表示条件・遷移先（関数は参照フラグ × 好感度で総当たり）
  var choices = {};
  ids.forEach(function (id) {
    var list = story.scenes[id].choices || [];
    var names = [];
    list.forEach(function (c) {
      if (typeof c.requires === "function") names = names.concat(flagsIn(c.requires));
      if (typeof c.next === "function") names = names.concat(flagsIn(c.next));
    });
    names = uniq(names);
    var dynamic = list.some(function (c) {
      return typeof c.requires === "function" || typeof c.next === "function";
    });
    var table = [];
    if (dynamic) {
      for (var n = 0; n < 1 << names.length; n++) {
        for (var a = AFFECTION_RANGE.min; a <= AFFECTION_RANGE.max; a++) {
          var s = stateFor(names, n, a);
          table.push(
            list
              .map(function (c) {
                var visible = !c.requires || !!c.requires(s);
                var next = typeof c.next === "function" ? c.next(s) : c.next;
                return (visible ? "1" : "0") + ":" + next;
              })
              .join("|")
          );
        }
      }
    }
    choices[id] = {
      flags: names,
      items: list.map(function (c) {
        return {
          text: c.text,
          effects: c.effects || null,
          next: typeof c.next === "function" ? "(function)" : c.next
        };
      }),
      table: table
    };
  });

  var meta = {};
  ids.forEach(function (id) {
    var s = story.scenes[id];
    meta[id] = {
      title: s.title,
      icon: s.icon,
      theme: s.theme,
      fx: s.fx || null,
      enter: s.enter || null,
      onEnter: s.onEnter || null,
      ending: s.ending || null
    };
  });

  return {
    flags: textFlags,
    combos: combos,
    sceneIds: ids,
    paragraphs: paragraphs,
    sha256: hash.digest("hex"),
    texts: texts,
    choices: choices,
    meta: meta,
    top: {
      start: story.start,
      maxShards: story.maxShards,
      maxAffection: story.maxAffection,
      endingCount: story.endingCount,
      shardNames: story.shardNames
    }
  };
}

function capture(ref) {
  var source = childProcess.execFileSync("git", ["show", ref + ":js/story.js"], { cwd: ROOT, encoding: "utf8" });
  var commit = childProcess.execFileSync("git", ["rev-parse", ref], { cwd: ROOT, encoding: "utf8" }).trim();
  var story = loadStoryFromSource(source, ref + ":js/story.js");
  var data = expand(story, function (pages) {
    return pages; // v2.1 は文字列配列のみ。正規化層を通さずそのまま採取する
  });
  data.source = { ref: ref, commit: commit, file: "js/story.js" };
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(data) + "\n");
  console.log("基準を採取しました: " + path.relative(ROOT, BASELINE));
  console.log("  コミット " + commit);
  report(data);
}

function report(data) {
  var unique = {};
  data.sceneIds.forEach(function (id) {
    data.texts[id].lists.forEach(function (l) {
      l.forEach(function (p) {
        unique[p] = true;
      });
    });
  });
  console.log("  シーン数 " + data.sceneIds.length + " / フラグ " + data.flags.length + " 個（" + data.flags.join(", ") + "）");
  console.log("  組合せ " + data.combos + " 通り × " + data.sceneIds.length + " シーン = " + data.combos * data.sceneIds.length + " 展開");
  console.log("  段落 延べ " + data.paragraphs + " / 固有 " + Object.keys(unique).length);
  console.log("  sha256 " + data.sha256);
}

function verify() {
  if (!fs.existsSync(BASELINE)) {
    console.error("基準データがありません。先に --capture を実行してください。");
    process.exit(2);
  }
  var base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  var story = loadStoryFromSource(fs.readFileSync(path.join(ROOT, "js", "story.js"), "utf8"), "js/story.js");
  var now = expand(story, makeTextOf());
  var errors = [];
  var compared = 0;

  if (JSON.stringify(now.flags.slice().sort()) !== JSON.stringify(base.flags.slice().sort())) {
    errors.push("本文が参照するフラグが変わっています: " + now.flags.join(",") + " ≠ " + base.flags.join(","));
  }
  if (JSON.stringify(now.sceneIds) !== JSON.stringify(base.sceneIds)) {
    errors.push("シーンIDの並びが変わっています");
  }

  // フラグの並び順が変わっても照合できるよう、基準側のビット位置へ写す
  var pos = now.flags.map(function (name) {
    return base.flags.indexOf(name);
  });
  function toBase(n) {
    var out = 0;
    for (var i = 0; i < pos.length; i++) if (n & (1 << i)) out |= 1 << pos[i];
    return out;
  }

  if (!errors.length) {
    base.sceneIds.forEach(function (id) {
      var b = base.texts[id];
      var c = now.texts[id];
      var bKeys = b.lists.map(function (l) {
        return JSON.stringify(l);
      });
      var cKeys = c.lists.map(function (l) {
        return JSON.stringify(l);
      });
      var bad = 0;
      for (var n = 0; n < now.combos; n++) {
        compared += 1;
        if (cKeys[c.index[n]] !== bKeys[b.index[toBase(n)]]) {
          bad += 1;
          if (bad === 1) {
            errors.push(
              "本文不一致 " + id + "（組合せ " + n + "）\n    基準: " + bKeys[b.index[toBase(n)]] + "\n    現在: " + cKeys[c.index[n]]
            );
          }
        }
      }
      if (bad > 1) errors.push("  … " + id + " は計 " + bad + " 通りで不一致");
    });
  }

  // Phase 2 で全シーンが新形式（stage 指定つき）。段落は「文字列」か「text＋舞台指示だけのオブジェクト」であること
  var rawForms = 0;
  base.sceneIds.forEach(function (id) {
    var scene = story.scenes[id];
    if (!scene) return;
    if (!scene.stage || typeof scene.stage !== "object") errors.push("stage 指定がありません: " + id);
    else {
      Object.keys(scene.stage).forEach(function (k) {
        if (STAGE_KEYS.indexOf(k) === -1) errors.push("stage に想定外の項目があります: " + id + "." + k);
      });
    }
    var reported = {};
    for (var n = 0; n < now.combos; n++) {
      var raw = typeof scene.text === "function" ? scene.text(stateFor(now.flags, n)) : scene.text;
      rawForms += 1;
      raw.forEach(function (p) {
        if (typeof p === "string") return;
        if (!p || typeof p !== "object" || Array.isArray(p) || typeof p.text !== "string") {
          if (!reported._form) errors.push("段落の形が不正です: " + id);
          reported._form = true;
          return;
        }
        Object.keys(p).forEach(function (k) {
          if (PAGE_KEYS.indexOf(k) === -1 && !reported[k]) {
            reported[k] = true;
            errors.push("段落に舞台指示以外の項目があります: " + id + "." + k);
          }
        });
      });
    }
  });

  ["choices", "meta", "top"].forEach(function (part) {
    Object.keys(base[part]).forEach(function (key) {
      if (JSON.stringify(base[part][key]) !== JSON.stringify(now[part][key])) {
        errors.push(part + " 不一致: " + key);
      }
    });
  });

  console.log("基準: " + base.source.commit + "（" + base.source.ref + "）");
  report(now);
  console.log("  照合 " + compared + " 展開（" + base.sceneIds.length + " シーン × " + base.combos + " 通り）");
  console.log("  全 " + base.sceneIds.length + " シーンに stage があり、段落の項目が本文＋舞台指示だけであること: " + rawForms + " 展開");
  console.log("  選択肢の照合 " + Object.keys(base.choices).length + " シーン / シーン属性 " + Object.keys(base.meta).length + " シーン");
  if (!errors.length && now.sha256 !== base.sha256) errors.push("sha256 が一致しません");
  if (errors.length) {
    console.error("\nNG: " + errors.length + " 件\n" + errors.join("\n"));
    process.exit(1);
  }
  console.log("\nOK: 表示テキスト列・選択肢・シーン属性は基準と完全一致");
}

var args = process.argv.slice(2);
if (args.indexOf("--capture") !== -1) {
  var i = args.indexOf("--ref");
  capture(i !== -1 && args[i + 1] ? args[i + 1] : "c9abfcd");
} else {
  verify();
}
