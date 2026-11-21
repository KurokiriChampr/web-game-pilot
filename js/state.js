/*
 * 状態の計算（状態の生成・セーブの検査と復元・効果の適用・条件の解決・巻き戻し用の控え）
 * ------------------------------------------------------------
 * 状態 s は { scene, affection, shards, flags, steps, log }（セーブデータの最上位と同じ形）。
 * 作品が STORY.vars で数値の変数を 1 つ以上宣言したときだけ、最上位に vars が加わる（{ 変数: 値 } ／
 * 人物ごとの変数は { 変数: { 人物: 値 } }）。宣言しない作品（本作）の状態とセーブは従来と同じ 6 項目のまま。
 * ここでは DOM にも localStorage にも触らず、データだけを扱う（Node からも読めるので検証スクリプトと共用できる）。
 * 進行（いまの状態を持つ、画面を描く、ページを送る、オート）は js/game.js が担当する。
 *
 * 物語データ（STORY）に依らないもの：
 * - resolve(value, s)          : 関数なら状態を渡して呼び、値ならそのまま返す（next・text の解決）
 * - visibleChoices(scene, s)   : requires を満たす選択肢だけを返す
 * - goesNext(scene, s)         : シーンの最後に next へ進むか（見える選択肢があれば選択肢が優先）
 * - snapshotOf(s)              : 巻き戻し用の控え（log を含まない写し。flags と vars は複製。vars は状態にあるときだけ）
 * 物語データを使うもの（create(STORY) が返す。STORY は呼ばれた時点のものを読む）：
 * - newState()                 : 最初の状態
 * - isValidSave(s)             : セーブデータとして再開できるか
 * - restoreState(saved)        : セーブデータを複製し、旧バージョンに無い項目を補う
 * - applyEffects(s, effects)   : 選択肢の effects・シーンの onEnter を状態に反映する
 * - canRewindFrom(snapshot)    : 巻き戻し用の控えから再開できるか（変数を宣言した作品では、vars の無い旧い控えは不可）
 * - hasVars                    : 作品が変数を 1 つ以上宣言しているか
 *
 * 変数の宣言（STORY.vars）：{ 変数名: { initial, min, max, per } }。initial は省略＝0、min／max は省略＝制限なし、
 * per は人物 ID の配列（書くと人物ごとの変数）。effects.vars の数値は加算、{ set: 値 } は代入。適用後に min／max へ収める。
 * 宣言の無い変数・per に無い人物への更新は無視してコンソールに警告を出す（進行は止めない）。
 */
(function (root) {
  "use strict";

  function resolve(value, s) {
    return typeof value === "function" ? value(s) : value;
  }

  function visibleChoices(scene, s) {
    return (scene.choices || []).filter(function (c) {
      return !c.requires || c.requires(s);
    });
  }

  /** シーンの最後に next へ進むか（結末でなく、next があり、見える選択肢が 0 個のとき。見える選択肢があれば選択肢が優先） */
  function goesNext(scene, s) {
    return !!scene && !scene.ending && scene.next != null && !visibleChoices(scene, s).length;
  }

  // 選んだ時点の状態の控えを、バックログの選択肢の行（k: "c"）に s として持たせる。
  // セーブデータの最上位の形は変えない（旧版は s を無視する。旧データの行には控えが無いので「戻る」を出さない）。
  function snapshotOf(s) {
    var snap = {
      scene: s.scene,
      affection: s.affection,
      shards: s.shards,
      flags: JSON.parse(JSON.stringify(s.flags)),
      steps: s.steps
    };
    if (s.vars) snap.vars = JSON.parse(JSON.stringify(s.vars)); // 変数を宣言した作品だけ（本作の控えは従来の形のまま）
    return snap;
  }

  function isPlainObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }
  function isNum(v) {
    return typeof v === "number" && isFinite(v);
  }
  function warn(msg) {
    if (typeof console !== "undefined" && console.warn) console.warn("[GameState] " + msg);
  }

  /** STORY.vars を読みやすい形にそろえる（{ 名前: { initial, min, max, per } }。宣言が無ければ空） */
  function readDecls(STORY) {
    var out = {};
    var src = STORY && isPlainObject(STORY.vars) ? STORY.vars : {};
    Object.keys(src).forEach(function (name) {
      var d = isPlainObject(src[name]) ? src[name] : {};
      out[name] = {
        initial: isNum(d.initial) ? d.initial : 0,
        min: isNum(d.min) ? d.min : null,
        max: isNum(d.max) ? d.max : null,
        per: Array.isArray(d.per) ? d.per.slice() : null
      };
    });
    return out;
  }

  function clampTo(d, v) {
    if (d.min != null && v < d.min) v = d.min;
    if (d.max != null && v > d.max) v = d.max;
    return v;
  }

  /** 物語データ STORY に結びついた計算をまとめて返す */
  function create(STORY) {
    var decls = readDecls(STORY);
    var names = Object.keys(decls);
    var hasVars = names.length > 0;

    /** 宣言の初期値（範囲へ収めた値）で vars を作る */
    function initialVars() {
      var vars = {};
      names.forEach(function (name) {
        var d = decls[name];
        var init = clampTo(d, d.initial);
        if (d.per) {
          vars[name] = {};
          d.per.forEach(function (id) {
            vars[name][id] = init;
          });
        } else vars[name] = init;
      });
      return vars;
    }

    /** 保存されていた vars を宣言に合わせてそろえる（無い・数値でない → 初期値、範囲外 → 収める、宣言に無い → 落とす） */
    function normalizeVars(saved) {
      var src = isPlainObject(saved) ? saved : {};
      var init = initialVars();
      var vars = {};
      names.forEach(function (name) {
        var d = decls[name];
        if (d.per) {
          var row = isPlainObject(src[name]) ? src[name] : {};
          vars[name] = {};
          d.per.forEach(function (id) {
            vars[name][id] = isNum(row[id]) ? clampTo(d, row[id]) : init[name][id];
          });
        } else vars[name] = isNum(src[name]) ? clampTo(d, src[name]) : init[name];
      });
      return vars;
    }

    function newState() {
      var s = { scene: STORY.start, affection: 0, shards: 0, flags: {}, steps: 0, log: [] };
      if (hasVars) s.vars = initialVars();
      return s;
    }

    function isValidSave(s) {
      return !!(
        s &&
        typeof s.scene === "string" &&
        STORY.scenes[s.scene] &&
        !STORY.scenes[s.scene].ending &&
        typeof s.affection === "number" &&
        typeof s.shards === "number" &&
        s.flags &&
        typeof s.flags === "object"
      );
    }

    /** セーブデータを複製し、旧バージョンに無い項目を補う */
    function restoreState(saved) {
      var s = JSON.parse(JSON.stringify(saved));
      if (typeof s.steps !== "number") s.steps = 0;
      if (!Array.isArray(s.log)) s.log = [];
      if (hasVars) s.vars = normalizeVars(s.vars);
      else delete s.vars; // 変数を宣言しない作品のセーブには vars を書かない
      return s;
    }

    /** 巻き戻し用の控えから再開できるか（変数を宣言した作品では、vars を持たない旧い控えからは戻れない） */
    function canRewindFrom(snap) {
      return isValidSave(snap) && (!hasVars || isPlainObject(snap.vars));
    }

    /** 1 つの値に更新を当てる（数値＝加算、{ set: 数値 }＝代入）。当てられない形なら null */
    function applyOp(cur, op) {
      if (isNum(op)) return cur + op;
      if (isPlainObject(op) && isNum(op.set)) return op.set;
      return null;
    }

    function applyVars(s, upd) {
      if (!isPlainObject(upd)) {
        warn("effects.vars はオブジェクトにしてください");
        return;
      }
      Object.keys(upd).forEach(function (name) {
        var d = decls[name];
        if (!d) {
          warn("宣言されていない変数 " + name + " への更新を無視しました");
          return;
        }
        if (!isPlainObject(s.vars)) s.vars = normalizeVars(s.vars);
        var op = upd[name];
        if (d.per) {
          if (!isPlainObject(op)) {
            warn("人物ごとの変数 " + name + " の更新は { 人物: 値 } の形にしてください");
            return;
          }
          Object.keys(op).forEach(function (id) {
            if (d.per.indexOf(id) === -1) {
              warn("変数 " + name + " の per に無い人物 " + id + " への更新を無視しました");
              return;
            }
            var v = applyOp(s.vars[name][id], op[id]);
            if (v == null) warn("変数 " + name + "." + id + " の更新は数値か { set: 数値 } にしてください");
            else s.vars[name][id] = clampTo(d, v);
          });
        } else {
          var v = applyOp(s.vars[name], op);
          if (v == null) warn("変数 " + name + " の更新は数値か { set: 数値 } にしてください");
          else s.vars[name] = clampTo(d, v);
        }
      });
    }

    function applyEffects(s, effects) {
      if (!effects) return;
      if (effects.affection) s.affection += effects.affection;
      if (effects.shards) s.shards = Math.min(STORY.maxShards || 0, s.shards + effects.shards);
      if (effects.flags) {
        Object.keys(effects.flags).forEach(function (k) {
          s.flags[k] = effects.flags[k];
        });
      }
      if (effects.vars) applyVars(s, effects.vars);
    }

    return {
      newState: newState,
      isValidSave: isValidSave,
      restoreState: restoreState,
      applyEffects: applyEffects,
      canRewindFrom: canRewindFrom,
      hasVars: hasVars,
      resolve: resolve,
      visibleChoices: visibleChoices,
      goesNext: goesNext,
      snapshotOf: snapshotOf
    };
  }

  var api = {
    create: create,
    resolve: resolve,
    visibleChoices: visibleChoices,
    goesNext: goesNext,
    snapshotOf: snapshotOf
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.GameState = api;
  }
})(this);
