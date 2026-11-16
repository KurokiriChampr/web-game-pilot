#!/usr/bin/env node
/*
 * 物語データの点検（どの作品にも使える。ブラウザは使わない）
 * ------------------------------------------------------------
 *   node tools/validate-story.js                       このリポジトリの作品を点検する
 *   node tools/validate-story.js --work <フォルダ>     作品の差し替え分を重ねて点検する（例: tools/fixtures/trio）
 *   オプション: --quiet（注意を個別に出さない）  --strict（注意が 1 件でもあれば失敗にする）
 *
 * 誤り（終了コード 1）：動かない・壊れる原因になるもの
 *   作品 ID が無い／開始シーンが無い／行き先の無い選択肢／cast に無い話者／知らない項目名／
 *   manifest に無い背景・人物・ポーズ・表情／シーン ID に # や > が入っている／章の指定が登録されていない
 * 注意（終了コード 0）：動くが、意図どおりか確かめたいもの
 *   退場の指定なしに押し出された立ち絵（1 か所に 1 人・最大 3 人の規則による）／同じシーンに同じ本文のページ
 *   （既読の記録が共有される）／どこからも行けないシーン／結末の数と endingCount の不一致／css に無いテーマ
 *
 * 本文や選択肢が関数のシーンは、その関数が見ているフラグを「全部なし／全部あり／1 つずつ」で試す
 * （好感度と欠片は下限・0・上限）。組合せの全数ではないので、3 つ以上のフラグの重なりでだけ起きる問題は見つけられない。
 */
"use strict";

var path = require("path");
var loadWork = require("./lib/load-work.js").loadWork;
var ENGINE_ROOT = require("./lib/load-work.js").ENGINE_ROOT;

var PAGE_KEYS = ["text", "speaker", "chara", "pose", "expr", "pos", "show", "hide", "bg", "cg", "halo", "fx", "portraits"];
var SCENE_KEYS = ["title", "icon", "theme", "text", "stage", "choices", "onEnter", "ending", "fx", "enter", "chapter"];
var STAGE_KEYS = ["bg", "cg", "halo", "show", "hide"];
var CHOICE_KEYS = ["text", "next", "effects", "requires"];
var PAGE_FX = ["hop", "shake", "flash"];

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function toList(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function flagsIn(fn) {
  var found = {};
  String(fn).replace(/\.flags(?:\.([A-Za-z_$][\w$]*)|\[\s*["']([^"']+)["']\s*\])/g, function (_, a, b) {
    found[a || b] = true;
  });
  return Object.keys(found);
}

/** 関数を試す状態の一覧（フラグ：全部なし／全部あり／1 つずつ × 好感度・欠片の下限・0・上限） */
function sampleStates(story, flags) {
  var sets = [{}, {}];
  flags.forEach(function (f) {
    sets[1][f] = true;
    var one = {};
    one[f] = true;
    sets.push(one);
  });
  var maxA = story.maxAffection || 0;
  var maxS = story.maxShards || 0;
  var out = [];
  sets.forEach(function (flagSet) {
    [-5, 0, maxA + 5].forEach(function (aff) {
      [0, maxS].forEach(function (sh) {
        out.push({ scene: story.start, affection: aff, shards: sh, flags: JSON.parse(JSON.stringify(flagSet)), steps: 0, log: [] });
      });
    });
  });
  return out;
}

function validate(work) {
  var STORY = work.STORY;
  var WORK = work.WORK;
  var Stage = work.Stage;
  var manifest = work.manifest || {};
  var errors = [];
  var warnings = [];
  var err = function (where, msg) {
    errors.push(where + "：" + msg);
  };
  var warn = function (where, msg) {
    warnings.push(where + "：" + msg);
  };

  if (!isObject(WORK) || typeof WORK.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(WORK.id)) {
    err("js/work.js", "id（保存キーの接頭辞。半角の英小文字・数字・ハイフン）がありません");
  }
  if (!isObject(STORY) || !isObject(STORY.scenes)) {
    err("js/story.js", "STORY.scenes がありません");
    return { errors: errors, warnings: warnings, stats: {} };
  }
  if (!Stage) err("index.html", "js/stage.js を読み込んでいません");
  var scenes = STORY.scenes;
  var ids = Object.keys(scenes);
  var cast = isObject(STORY.cast) ? STORY.cast : {};
  var bgs = isObject(manifest.backgrounds) ? manifest.backgrounds : {};
  var charas = isObject(manifest.characters) ? manifest.characters : {};
  var css = (work.read("css/work.css") || "") + (work.read("css/style.css") || "");
  var chapterIds = toList(STORY.chapters).map(function (c) {
    return c && c.id;
  });

  if (!scenes[STORY.start]) err("STORY.start", "開始シーン " + JSON.stringify(STORY.start) + " がありません");
  Object.keys(cast).forEach(function (k) {
    var c = cast[k];
    toList(isObject(c) ? c.charas : null).forEach(function (x) {
      if (!charas[x]) warn("cast." + k, "charas の " + x + " は manifest の characters にありません");
    });
  });

  var stats = { scenes: ids.length, chapters: chapterIds.length, pages: 0, chars: 0, choices: 0, endings: 0, maxOnStage: 0, readEntries: 0, readBytes: 0 };
  var endingIds = {};
  var themeMissing = {};

  function checkChara(where, spec) {
    var def = charas[spec.chara];
    if (!isObject(def)) {
      err(where, "人物 " + spec.chara + " が manifest の characters にありません");
      return;
    }
    return def;
  }

  ids.forEach(function (id) {
    var scene = scenes[id];
    var at = "シーン " + id;
    if (/[#>]/.test(id)) err(at, "シーン ID に # と > は使えません（既読の記録の区切りに使っています）");
    if (!isObject(scene)) {
      err(at, "シーンがオブジェクトではありません");
      return;
    }
    Object.keys(scene).forEach(function (k) {
      if (SCENE_KEYS.indexOf(k) === -1) err(at, "知らない項目 " + k);
    });
    if (typeof scene.title !== "string" || !scene.title) err(at, "title がありません");
    if (scene.chapter != null && chapterIds.indexOf(scene.chapter) === -1) err(at, "章 " + scene.chapter + " が STORY.chapters にありません");
    if (typeof scene.theme === "string" && css.indexOf("body.theme-" + scene.theme) === -1) themeMissing[scene.theme] = true;
    if (isObject(scene.stage)) {
      Object.keys(scene.stage).forEach(function (k) {
        if (STAGE_KEYS.indexOf(k) === -1) err(at, "stage に知らない項目 " + k);
      });
    }
    if (scene.ending) {
      stats.endings += 1;
      if (!isObject(scene.ending) || typeof scene.ending.id !== "string") err(at, "ending.id がありません");
      else if (endingIds[scene.ending.id]) err(at, "結末 ID " + scene.ending.id + " が " + endingIds[scene.ending.id] + " と重複しています");
      else endingIds[scene.ending.id] = id;
      if (toList(scene.choices).length) warn(at, "結末のシーンに選択肢があります（表示されません）");
    } else if (!toList(scene.choices).length) {
      err(at, "結末でないのに選択肢がありません（先へ進めなくなります）");
    }

    // ---- 本文（関数なら、見ているフラグを振って試す） ----
    var fns = [scene.text].concat(
      toList(scene.choices).reduce(function (list, c) {
        return list.concat([c && c.next, c && c.requires]);
      }, [])
    );
    var flags = [];
    fns.forEach(function (f) {
      if (typeof f === "function") {
        flagsIn(f).forEach(function (x) {
          if (flags.indexOf(x) === -1) flags.push(x);
        });
      }
    });
    var states = typeof scene.text === "function" || flags.length ? sampleStates(STORY, flags) : [sampleStates(STORY, [])[0]];
    var seenLists = {};
    var pageKeys = {};
    var maxPages = 0;
    states.forEach(function (st) {
      var raw;
      try {
        raw = typeof scene.text === "function" ? scene.text(st) : scene.text;
      } catch (e) {
        err(at, "text の関数が例外を出しました：" + e.message);
        return;
      }
      if (!Array.isArray(raw) || !raw.length) {
        err(at, "text が空です");
        return;
      }
      var sig = JSON.stringify(raw);
      if (seenLists[sig]) return;
      seenLists[sig] = true;
      maxPages = Math.max(maxPages, raw.length);
      var texts = Stage.pageTexts(raw);
      var dup = {};
      texts.forEach(function (t, i) {
        if (!t) err(at, i + 1 + " ページ目の本文が空です");
        if (dup[t]) warn(at, "同じ本文のページが 2 つあります（既読の記録を共有します）：" + t.slice(0, 20) + "…");
        dup[t] = true;
        if (!pageKeys[t]) {
          pageKeys[t] = true;
          stats.chars += t.length;
        }
      });
      var opts = { stage: scene.stage, cast: cast };
      var prev = Stage.stageAt(raw, -1, opts);
      [scene.stage].concat(raw).forEach(function (p, n) {
        if (!isObject(p)) return;
        var where = at + (n === 0 ? " の stage" : " の " + n + " ページ目");
        if (n > 0) {
          Object.keys(p).forEach(function (k) {
            if (PAGE_KEYS.indexOf(k) === -1) err(where, "知らない項目 " + k);
          });
          if (p.speaker != null && !cast[p.speaker]) err(where, "話者 " + p.speaker + " が STORY.cast にありません");
          toList(p.fx).forEach(function (x) {
            if (PAGE_FX.indexOf(x) === -1) warn(where, "知らない演出 fx: " + x);
          });
        }
        if (typeof p.bg === "string" && !bgs[p.bg]) err(where, "背景 " + p.bg + " が manifest の backgrounds にありません");
        if (typeof p.cg === "string" && !bgs[p.cg]) err(where, "一枚絵 " + p.cg + " が manifest の backgrounds にありません");
        if (p.halo != null && Stage.HALO_STATES.indexOf(p.halo) === -1) err(where, "halo の値 " + p.halo + " は使えません");
        var specs = toList(p.show || p.portraits);
        if (specs.length > Stage.MAX_CHARAS) warn(where, "show に " + specs.length + " 人います（同時に並ぶのは " + Stage.MAX_CHARAS + " 人まで）");
        if (p.chara != null || p.pos != null) specs = specs.concat([{ chara: p.chara, pos: p.pos }]);
        specs.forEach(function (one) {
          if (!isObject(one)) return;
          if (one.pos != null && Stage.POSITIONS.indexOf(one.pos) === -1) err(where, "pos の値 " + one.pos + " は使えません（left / center / right）");
        });
      });
      // 舞台を 1 ページずつ進めて、素材の有無と「押し出し」を確かめる
      for (var i = 0; i < raw.length; i++) {
        var cur = Stage.stageAt(raw, i, opts);
        var where2 = at + " の " + (i + 1) + " ページ目";
        stats.maxOnStage = Math.max(stats.maxOnStage, cur.charas.length);
        cur.charas.forEach(function (c) {
          var def = checkChara(where2, { chara: c.id });
          if (!def) return;
          var pose = isObject(def.poses) ? def.poses[c.pose] : null;
          if (!isObject(pose)) err(where2, c.id + " のポーズ " + c.pose + " が manifest にありません");
          else if (!isObject(pose.exprs) || pose.exprs[c.expr] == null) err(where2, c.id + " の表情 " + c.pose + "/" + c.expr + " が manifest にありません");
        });
        var page = Stage.normalizePage(raw[i]);
        var hidden = toList(page.hide);
        var now = cur.charas.map(function (c) {
          return c.id;
        });
        prev.charas.forEach(function (c) {
          if (now.indexOf(c.id) === -1 && hidden.indexOf(c.id) === -1 && hidden.indexOf("*") === -1) {
            warn(where2, c.id + " が、退場の指定（hide）なしに押し出されました（同じ位置に別の人が立った）");
          }
        });
        prev = cur;
      }
    });
    stats.pages += Object.keys(pageKeys).length;
    stats.readEntries += 1 + Object.keys(pageKeys).length;
    stats.readBytes += id.length + 3 + Object.keys(pageKeys).length * (id.length + 11);

    // ---- 選択肢 ----
    toList(scene.choices).forEach(function (choice, n) {
      var where = at + " の選択肢 " + (n + 1);
      stats.choices += 1;
      stats.readEntries += 1;
      stats.readBytes += id.length + 11;
      if (!isObject(choice) || typeof choice.text !== "string" || !choice.text) {
        err(where, "text がありません");
        return;
      }
      Object.keys(choice).forEach(function (k) {
        if (CHOICE_KEYS.indexOf(k) === -1) err(where, "知らない項目 " + k);
      });
      var targets = [];
      if (typeof choice.next === "string") targets.push(choice.next);
      else if (typeof choice.next === "function") {
        states.forEach(function (st) {
          try {
            var t = choice.next(st);
            if (targets.indexOf(t) === -1) targets.push(t);
          } catch (e) {
            err(where, "next の関数が例外を出しました：" + e.message);
          }
        });
      } else err(where, "next がありません");
      targets.forEach(function (t) {
        if (!scenes[t]) err(where, "行き先のシーン " + JSON.stringify(t) + " がありません");
      });
    });
  });
  // 到達できるシーン（開始シーンから選択肢をたどる）
  var seen = {};
  var stack = scenes[STORY.start] ? [STORY.start] : [];
  var edges = {};
  ids.forEach(function (id) {
    edges[id] = [];
    var scene = scenes[id];
    var flags = [];
    toList(scene.choices).forEach(function (c) {
      if (c && typeof c.next === "function") flags = flags.concat(flagsIn(c.next));
    });
    var states = sampleStates(STORY, flags);
    toList(scene.choices).forEach(function (c) {
      if (!c) return;
      if (typeof c.next === "string") edges[id].push(c.next);
      else if (typeof c.next === "function") {
        states.forEach(function (st) {
          try {
            edges[id].push(c.next(st));
          } catch (e) {
            /* 上で報告済み */
          }
        });
      }
    });
  });
  while (stack.length) {
    var cur = stack.pop();
    if (seen[cur] || !scenes[cur]) continue;
    seen[cur] = true;
    edges[cur].forEach(function (t) {
      if (!seen[t]) stack.push(t);
    });
  }
  ids.forEach(function (id) {
    if (!seen[id]) warn("シーン " + id, "開始シーンからたどり着けません");
  });
  Object.keys(themeMissing).forEach(function (t) {
    warn("テーマ " + t, "css（css/work.css）に body.theme-" + t + " がありません（既定の配色で表示されます）");
  });
  if (typeof STORY.endingCount === "number" && STORY.endingCount !== stats.endings) {
    warn("STORY.endingCount", STORY.endingCount + " ですが、結末のシーンは " + stats.endings + " 個あります");
  }
  stats.reachable = Object.keys(seen).length;
  return { errors: errors, warnings: warnings, stats: stats };
}

module.exports = { validate: validate };

if (require.main === module) {
  var args = process.argv.slice(2);
  var wi = args.indexOf("--work");
  var roots = wi !== -1 && args[wi + 1] ? [path.resolve(args[wi + 1]), ENGINE_ROOT] : [ENGINE_ROOT];
  var result = validate(loadWork({ roots: roots }));
  var s = result.stats;
  console.log(
    "シーン " + s.scenes + "（到達できる " + s.reachable + "）／章 " + s.chapters + "／固有のページ " + s.pages + "／本文 " + s.chars + " 字／選択肢 " + s.choices +
      "／結末 " + s.endings + "／同時に並ぶ立ち絵 最大 " + s.maxOnStage + " 人"
  );
  console.log("既読データの見積もり（すべて読み、すべて選んだとき）：" + s.readEntries + " 要素・約 " + Math.round(s.readBytes / 1024) + " KB");
  if (args.indexOf("--quiet") === -1) {
    result.warnings.forEach(function (w) {
      console.log("注意: " + w);
    });
  }
  result.errors.forEach(function (e) {
    console.log("誤り: " + e);
  });
  var failed = result.errors.length > 0 || (args.indexOf("--strict") !== -1 && result.warnings.length > 0);
  console.log((failed ? "NG" : "OK") + ": 誤り " + result.errors.length + " 件、注意 " + result.warnings.length + " 件");
  process.exit(failed ? 1 : 0);
}
