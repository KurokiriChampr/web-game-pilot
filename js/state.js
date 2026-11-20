/*
 * 状態の計算（状態の生成・セーブの検査と復元・効果の適用・条件の解決・巻き戻し用の控え）
 * ------------------------------------------------------------
 * 状態 s は { scene, affection, shards, flags, steps, log }（セーブデータの最上位と同じ形）。
 * ここでは DOM にも localStorage にも触らず、データだけを扱う（Node からも読めるので検証スクリプトと共用できる）。
 * 進行（いまの状態を持つ、画面を描く、ページを送る、オート）は js/game.js が担当する。
 *
 * 物語データ（STORY）に依らないもの：
 * - resolve(value, s)          : 関数なら状態を渡して呼び、値ならそのまま返す（next・text の解決）
 * - visibleChoices(scene, s)   : requires を満たす選択肢だけを返す
 * - goesNext(scene, s)         : シーンの最後に next へ進むか（見える選択肢があれば選択肢が優先）
 * - snapshotOf(s)              : 巻き戻し用の控え（log を含まない写し。flags は複製）
 * 物語データを使うもの（create(STORY) が返す。STORY は呼ばれた時点のものを読む）：
 * - newState()                 : 最初の状態
 * - isValidSave(s)             : セーブデータとして再開できるか
 * - restoreState(saved)        : セーブデータを複製し、旧バージョンに無い項目を補う
 * - applyEffects(s, effects)   : 選択肢の effects・シーンの onEnter を状態に反映する
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
    return {
      scene: s.scene,
      affection: s.affection,
      shards: s.shards,
      flags: JSON.parse(JSON.stringify(s.flags)),
      steps: s.steps
    };
  }

  /** 物語データ STORY に結びついた計算をまとめて返す */
  function create(STORY) {
    function newState() {
      return { scene: STORY.start, affection: 0, shards: 0, flags: {}, steps: 0, log: [] };
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
      return s;
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
    }

    return {
      newState: newState,
      isValidSave: isValidSave,
      restoreState: restoreState,
      applyEffects: applyEffects,
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
