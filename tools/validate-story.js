#!/usr/bin/env node
/*
 * 物語データの点検（どの作品にも使える。ブラウザは使わない）
 * ------------------------------------------------------------
 *   node tools/validate-story.js                       このリポジトリの作品を点検する
 *   node tools/validate-story.js --work <フォルダ>     作品の差し替え分を重ねて点検する（例: tools/fixtures/trio）
 *   オプション: --quiet（注意を個別に出さない）  --strict（注意が 1 件でもあれば失敗にする）
 *
 * 誤り（終了コード 1）：動かない・壊れる原因になるもの
 *   作品 ID が無い／開始シーンが無い／行き先の無い選択肢・next／選択肢も next も無いシーン／cast に無い話者／
 *   知らない項目名／manifest に無い背景・人物・ポーズ・表情／シーン ID に # や > が入っている／章の指定が登録されていない／
 *   next だけで輪になっていて抜けられない並び（A → B → A）／
 *   変数の宣言（STORY.vars）の書式の誤り／宣言されていない変数・per に無い人物の使用（effects.vars・onEnter.vars・
 *   関数の中の .vars.xxx）／変数の更新の形の誤り（数値か { set: 数値 } でない）
 * 注意（終了コード 0）：動くが、意図どおりか確かめたいもの
 *   退場の指定なしに押し出された立ち絵（1 か所に 1 人・最大 3 人の規則による）／同じシーンに同じ本文のページ
 *   （既読の記録が共有される）／どこからも行けないシーン／結末の数と endingCount の不一致／css に無いテーマ／
 *   結末のシーンの next／全部に requires が付いた選択肢（next が無いと、全部隠れたとき進めない）／
 *   next だけの輪で、行き先の関数しだいで抜けられるもの／変数の per に、manifest にも cast にも無い人物 ID
 *
 * 本文や選択肢が関数のシーンは、その関数が見ているフラグを「全部なし／全部あり／1 つずつ」で試す
 * （好感度と欠片は下限・0・上限）。組合せの全数ではないので、3 つ以上のフラグの重なりでだけ起きる問題は見つけられない。
 * 関数が見ている変数（.vars.xxx）は 1 つずつ振る（初期値の前後 20 までの整数と下限・上限。幅が 20 以下なら全部の整数。ほかの変数は初期値）。
 * 複数の変数の組合せでだけ起きる問題は見つけられない。
 */
"use strict";

var path = require("path");
var loadWork = require("./lib/load-work.js").loadWork;
var ENGINE_ROOT = require("./lib/load-work.js").ENGINE_ROOT;

var PAGE_KEYS = ["text", "speaker", "chara", "pose", "expr", "pos", "show", "hide", "bg", "cg", "halo", "fx", "portraits"];
var SCENE_KEYS = ["title", "icon", "theme", "text", "stage", "choices", "onEnter", "ending", "fx", "enter", "chapter", "next"];
var STAGE_KEYS = ["bg", "cg", "halo", "show", "hide"];
var CHOICE_KEYS = ["text", "next", "effects", "requires"];
var PAGE_FX = ["hop", "shake", "flash"];
var VAR_KEYS = ["initial", "min", "max", "per"];
var VAR_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

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

var ID_OR_KEY = "(?:\\.([A-Za-z_$][\\w$]*)|\\[\\s*[\"']([^\"']+)[\"']\\s*\\])";
/** 関数が見ている変数（.vars.名前 と、人物ごとの変数の .vars.名前.人物）。key は人物（書かれていなければ null） */
function varsIn(fn) {
  var found = {};
  var out = [];
  String(fn).replace(new RegExp("\\.vars" + ID_OR_KEY + "(?:" + ID_OR_KEY + ")?", "g"), function (_, a, b, c, d) {
    var ref = { name: a || b, key: c || d || null };
    var sig = ref.name + "." + ref.key;
    if (!found[sig]) {
      found[sig] = true;
      out.push(ref);
    }
  });
  return out;
}

function isNum(v) {
  return typeof v === "number" && isFinite(v);
}

/** 変数の宣言（STORY.vars）を点検し、書式の正しいものだけを { 名前: { initial, min, max, per } } で返す */
function checkVarDecls(STORY, cast, charas, err, warn) {
  var decls = {};
  if (STORY.vars == null) return decls;
  if (!isObject(STORY.vars)) {
    err("STORY.vars", "変数の宣言は { 変数名: { initial, min, max, per } } のオブジェクトにしてください");
    return decls;
  }
  Object.keys(STORY.vars).forEach(function (name) {
    var at = "STORY.vars." + name;
    var d = STORY.vars[name];
    if (!VAR_NAME.test(name) || name === "set") {
      err(at, "変数名は半角英数字と _ で、先頭は英字にしてください（set は使えません）");
      return;
    }
    if (!isObject(d)) {
      err(at, "宣言がオブジェクトではありません（例：{ initial: 0, min: 0, max: 10 }）");
      return;
    }
    var bad = false;
    Object.keys(d).forEach(function (k) {
      if (VAR_KEYS.indexOf(k) === -1) {
        err(at, "知らない項目 " + k);
        bad = true;
      }
    });
    ["initial", "min", "max"].forEach(function (k) {
      if (d[k] != null && !isNum(d[k])) {
        err(at, k + " は数値にしてください（変数に入れられるのは数値だけです）");
        bad = true;
      }
    });
    if (bad) return;
    var init = d.initial == null ? 0 : d.initial;
    if (d.min != null && d.max != null && d.min > d.max) {
      err(at, "min（" + d.min + "）が max（" + d.max + "）より大きくなっています");
      return;
    }
    if ((d.min != null && init < d.min) || (d.max != null && init > d.max)) {
      err(at, "初期値 " + init + " が min／max の範囲の外です");
      return;
    }
    var per = null;
    if (d.per != null) {
      var okList = Array.isArray(d.per) && d.per.length && d.per.every(function (x) {
        return typeof x === "string" && x;
      });
      if (!okList) {
        err(at, "per は人物 ID（文字列）を 1 つ以上並べた配列にしてください");
        return;
      }
      var dup = d.per.filter(function (x, i) {
        return d.per.indexOf(x) !== i;
      });
      if (dup.length) {
        err(at, "per に同じ人物 ID が 2 回あります：" + dup.join("・"));
        return;
      }
      d.per.forEach(function (x) {
        if (!cast[x] && !charas[x]) warn(at, "per の " + x + " は manifest の characters にも STORY.cast にもありません");
      });
      per = d.per.slice();
    }
    decls[name] = { initial: init, min: d.min == null ? null : d.min, max: d.max == null ? null : d.max, per: per };
  });
  return decls;
}

/** effects.vars・onEnter.vars の点検（宣言されていない変数・per に無い人物・更新の形） */
function checkVarEffects(where, upd, decls, err) {
  if (upd == null) return;
  if (!isObject(upd)) {
    err(where, "vars はオブジェクトにしてください");
    return;
  }
  var isOp = function (op) {
    return isNum(op) || (isObject(op) && Object.keys(op).length === 1 && isNum(op.set));
  };
  Object.keys(upd).forEach(function (name) {
    var d = decls[name];
    var op = upd[name];
    if (!d) {
      err(where, "変数 " + name + " は STORY.vars で宣言されていません");
      return;
    }
    if (d.per) {
      if (!isObject(op) || "set" in op) {
        err(where, "人物ごとの変数 " + name + " の更新は { 人物 ID: 数値 か { set: 数値 } } の形にしてください");
        return;
      }
      Object.keys(op).forEach(function (id) {
        if (d.per.indexOf(id) === -1) err(where, "変数 " + name + " の per に人物 " + id + " がありません");
        else if (!isOp(op[id])) err(where, "変数 " + name + "." + id + " の更新は数値（加算）か { set: 数値 }（代入）にしてください");
      });
    } else if (!isOp(op)) {
      err(where, "変数 " + name + " の更新は数値（加算）か { set: 数値 }（代入）にしてください");
    }
  });
}

/** 関数の中の .vars.xxx が宣言どおりか（宣言に無い変数・per に無い人物は誤り） */
function checkVarRefs(where, refs, decls, err) {
  refs.forEach(function (r) {
    var d = decls[r.name];
    if (!d) err(where, "関数が読んでいる変数 " + r.name + " は STORY.vars で宣言されていません");
    else if (d.per && r.key != null && d.per.indexOf(r.key) === -1) err(where, "関数が読んでいる " + r.name + "." + r.key + " の人物 " + r.key + " は per にありません");
  });
}

/** 変数を振って試す値（初期値の前後 20 までの整数と、下限・上限。幅が 20 以下の変数なら全部の整数になる。制限が無い側は初期値から 20 まで） */
function varSamples(d) {
  var lo = d.min != null ? d.min : d.initial - 20;
  var hi = d.max != null ? d.max : d.initial + 20;
  var vals = [];
  var add = function (v) {
    if (vals.indexOf(v) === -1) vals.push(v);
  };
  for (var v = Math.ceil(Math.max(lo, d.initial - 20)); v <= Math.min(hi, d.initial + 20); v++) add(v);
  [lo, d.initial, hi].forEach(add);
  return vals.sort(function (x, y) {
    return x - y;
  });
}

/**
 * 関数を試す状態の一覧（フラグ：全部なし／全部あり／1 つずつ × 好感度・欠片の下限・0・上限）。
 * 変数を宣言した作品では、どの状態も vars を初期値で持つ。refs（関数が見ている変数）があれば、
 * 1 つずつ varSamples の値に振った状態を足す（フラグは同じ組合せ、好感度・欠片は 0）。
 */
function sampleStates(story, flags, refs, decls) {
  var initVars = null;
  decls = decls || {};
  if (Object.keys(decls).length) {
    initVars = {};
    Object.keys(decls).forEach(function (name) {
      var d = decls[name];
      if (d.per) {
        initVars[name] = {};
        d.per.forEach(function (id) {
          initVars[name][id] = d.initial;
        });
      } else initVars[name] = d.initial;
    });
  }
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
  var make = function (flagSet, aff, sh, vars) {
    var st = { scene: story.start, affection: aff, shards: sh, flags: JSON.parse(JSON.stringify(flagSet)), steps: 0, log: [] };
    if (vars) st.vars = JSON.parse(JSON.stringify(vars));
    return st;
  };
  sets.forEach(function (flagSet) {
    [-5, 0, maxA + 5].forEach(function (aff) {
      [0, maxS].forEach(function (sh) {
        out.push(make(flagSet, aff, sh, initVars));
      });
    });
  });
  if (initVars) {
    var slots = []; // 振る値の置き場所 [変数, 人物 or null]
    (refs || []).forEach(function (r) {
      var d = decls[r.name];
      if (!d) return;
      var keys = d.per ? (r.key != null ? (d.per.indexOf(r.key) !== -1 ? [r.key] : []) : d.per) : [null];
      keys.forEach(function (k) {
        if (!slots.some(function (x) { return x[0] === r.name && x[1] === k; })) slots.push([r.name, k]);
      });
    });
    slots.forEach(function (slot) {
      varSamples(decls[slot[0]]).forEach(function (v) {
        sets.forEach(function (flagSet) {
          var vars = JSON.parse(JSON.stringify(initVars));
          if (slot[1] == null) vars[slot[0]] = v;
          else vars[slot[0]][slot[1]] = v;
          out.push(make(flagSet, 0, 0, vars));
        });
      });
    });
  }
  return out;
}

/** シーンの next の行き先（関数なら、試す状態ごとに呼んで重複を除く）。onError があれば例外を知らせる */
function nextTargetsOf(scene, states, onError) {
  var targets = [];
  if (typeof scene.next === "string") targets.push(scene.next);
  else if (typeof scene.next === "function") {
    states.forEach(function (st) {
      try {
        var t = scene.next(JSON.parse(JSON.stringify(st)));
        if (targets.indexOf(t) === -1) targets.push(t);
      } catch (e) {
        if (onError) onError("関数が例外を出しました：" + e.message);
      }
    });
  }
  return targets;
}

/**
 * next だけで進むシーン（選択肢の無い一本道）どうしの輪を探す。
 * 輪の外へ出る行き先が 1 つも無ければ誤り（オートのまま回り続ける）。行き先の関数しだいで出られるなら注意。
 * 関数の行き先は試した状態の範囲で判定する（試していない状態でだけ抜けられる関数は、誤りとして報告される）。
 */
function checkNextLoops(scenes, linear, err, warn) {
  var ids = Object.keys(linear);
  // 強連結成分（Tarjan）。行き先が一本道のシーンのときだけ辺とみなす
  var index = {};
  var low = {};
  var onStack = {};
  var stack = [];
  var counter = 0;
  var groups = [];
  function visit(v) {
    index[v] = low[v] = counter++;
    stack.push(v);
    onStack[v] = true;
    linear[v].forEach(function (w) {
      if (!linear[w]) return;
      if (index[w] === undefined) {
        visit(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onStack[w]) low[v] = Math.min(low[v], index[w]);
    });
    if (low[v] === index[v]) {
      var group = [];
      var w;
      do {
        w = stack.pop();
        onStack[w] = false;
        group.push(w);
      } while (w !== v);
      groups.push(group);
    }
  }
  ids.forEach(function (v) {
    if (index[v] === undefined) visit(v);
  });
  groups.forEach(function (group) {
    var looped = group.length > 1 || linear[group[0]].indexOf(group[0]) !== -1;
    if (!looped) return;
    var exits = group.filter(function (v) {
      return linear[v].some(function (w) {
        return group.indexOf(w) === -1;
      });
    });
    var members = group.slice().sort();
    var list = "輪のシーン：" + members.join("・");
    if (!exits.length) err("シーン " + members[0], "next だけで輪になっていて抜けられません（" + list + "）");
    else warn("シーン " + exits.sort()[0], "next だけの輪です。行き先の関数しだいで抜けられます（" + list + "）");
  });
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

  var decls = checkVarDecls(STORY, cast, charas, err, warn);
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
      if (scene.next != null) warn(at, "結末のシーンに next があります（使われません）");
    } else if (!toList(scene.choices).length && scene.next == null) {
      err(at, "選択肢も next もありません（先へ進めなくなります）");
    } else if (scene.next == null) {
      var guarded = toList(scene.choices).every(function (c) {
        return isObject(c) && typeof c.requires === "function";
      });
      if (guarded) warn(at, "すべての選択肢に requires があります（全部隠れると先へ進めなくなります。next を足すと、そのときの行き先になります）");
    }
    if (scene.next != null && typeof scene.next !== "string" && typeof scene.next !== "function") {
      err(at, "next はシーン ID（文字列）か、状態を受け取って ID を返す関数にしてください");
    }

    // ---- 本文（関数なら、見ているフラグを振って試す） ----
    var fns = [scene.text, scene.next].concat(
      toList(scene.choices).reduce(function (list, c) {
        return list.concat([c && c.next, c && c.requires]);
      }, [])
    );
    var flags = [];
    var refs = [];
    fns.forEach(function (f) {
      if (typeof f === "function") {
        flagsIn(f).forEach(function (x) {
          if (flags.indexOf(x) === -1) flags.push(x);
        });
        refs = refs.concat(varsIn(f));
      }
    });
    checkVarRefs(at, varsIn(fns.filter(function (f) {
      return typeof f === "function";
    }).map(String).join("\n")), decls, err);
    if (isObject(scene.onEnter)) checkVarEffects(at + " の onEnter", scene.onEnter.vars, decls, err);
    var states = typeof scene.text === "function" || flags.length || refs.length ? sampleStates(STORY, flags, refs, decls) : [sampleStates(STORY, [], [], decls)[0]];
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
      if (isObject(choice.effects)) checkVarEffects(where + " の effects", choice.effects.vars, decls, err);
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

    // ---- next（選択肢なしの遷移。結末では使われない） ----
    if (!scene.ending) {
      nextTargetsOf(scene, states, function (msg) {
        err(at + " の next", msg);
      }).forEach(function (t) {
        if (!scenes[t]) err(at + " の next", "行き先のシーン " + JSON.stringify(t) + " がありません");
      });
    }
  });
  // 到達できるシーン（開始シーンから選択肢と next をたどる）
  var seen = {};
  var stack = scenes[STORY.start] ? [STORY.start] : [];
  var edges = {};
  var linear = {}; // next だけで進むシーン → 行き先の一覧（輪の点検用）
  ids.forEach(function (id) {
    edges[id] = [];
    var scene = scenes[id];
    var flags = typeof scene.next === "function" ? flagsIn(scene.next) : [];
    var refs = typeof scene.next === "function" ? varsIn(scene.next) : [];
    toList(scene.choices).forEach(function (c) {
      if (c && typeof c.next === "function") {
        flags = flags.concat(flagsIn(c.next));
        refs = refs.concat(varsIn(c.next));
      }
    });
    var states = sampleStates(STORY, flags, refs, decls);
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
    if (!scene.ending) {
      nextTargetsOf(scene, states).forEach(function (t) {
        edges[id].push(t);
      });
      if (scene.next != null && !toList(scene.choices).length) {
        linear[id] = nextTargetsOf(scene, states).filter(function (t) {
          return !!scenes[t];
        });
      }
    }
  });
  checkNextLoops(scenes, linear, err, warn);
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

module.exports = { validate: validate, varsIn: varsIn, varSamples: varSamples };

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
