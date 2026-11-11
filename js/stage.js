/*
 * 舞台の状態（ページの正規化と、立ち絵・名前札・光輪の状態計算）
 * ------------------------------------------------------------
 * scene.text の要素は「文字列」または「{ text, speaker, chara, pose, expr, pos,
 * show, hide, bg, cg, halo, fx }」のどちらでもよい（docs/v3-phase0-research.md §A-3）。
 * ここでは DOM に触らず、データだけを扱う（Node からも読めるので検証スクリプトと共用する）。
 *
 * - normalizePage / normalizePages : 文字列を { text } に包み、形をそろえる
 * - pageTexts                      : 表示される本文（文字列）だけを取り出す
 * - stageAt(pages, index, opts)    : 0 ページ目から index まで畳み込み、
 *                                    「いま誰が・どのポーズ・どの表情・どの位置にいるか」を返す純関数。
 *                                    1 ページずつ進めても、スキップやロードで飛んでも同じ結果になる。
 */
(function (root) {
  "use strict";

  var POSITIONS = ["left", "center", "right"];
  var HALO_STATES = ["weak", "flicker", "bright", "off"];
  var DEFAULT_POSE = "stand";
  var DEFAULT_EXPR = "normal";
  var DEFAULT_POS = "center";
  var DEFAULT_HALO = "weak";

  function isObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function toList(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }

  /** 文字列でもオブジェクトでも { text, ... } にそろえる。本文の文字列には手を加えない。 */
  function normalizePage(p) {
    if (typeof p === "string") return { text: p };
    if (!isObject(p)) return { text: p == null ? "" : String(p) };
    var out = {};
    Object.keys(p).forEach(function (k) {
      out[k] = p[k];
    });
    out.text = typeof p.text === "string" ? p.text : p.text == null ? "" : String(p.text);
    // 指示書側の呼び名 portraits は show の別名として受ける
    if (out.show == null && out.portraits != null) out.show = out.portraits;
    return out;
  }

  function normalizePages(pages) {
    return toList(pages).map(normalizePage);
  }

  /** 表示される本文だけ（バックログ・検証はこの文字列配列を使う） */
  function pageTexts(pages) {
    return toList(pages).map(function (p) {
      return typeof p === "string" ? p : normalizePage(p).text;
    });
  }

  /** そのシーンが新形式（舞台指定つき）かどうか。false なら v2.1 と同じ見た目で動かす。 */
  function usesStage(scene, pages) {
    if (scene && isObject(scene.stage)) return true;
    return toList(pages).some(function (p) {
      return isObject(p);
    });
  }

  /** 話者 ID → 立ち絵の人物 ID（cast[x].chara。無ければ話者 ID 自身が人物かどうかは呼び出し側が判断） */
  function charaOfSpeaker(cast, speaker) {
    if (!speaker) return null;
    var c = cast && cast[speaker];
    if (isObject(c) && typeof c.chara === "string") return c.chara;
    return speaker;
  }

  function applyOne(charas, order, spec) {
    if (!isObject(spec) || typeof spec.chara !== "string" || !spec.chara) return;
    var id = spec.chara;
    var cur = charas[id];
    if (!cur) {
      cur = charas[id] = { id: id, pose: DEFAULT_POSE, expr: DEFAULT_EXPR, pos: DEFAULT_POS };
      order.push(id);
    }
    if (typeof spec.pose === "string" && spec.pose) cur.pose = spec.pose;
    if (typeof spec.expr === "string" && spec.expr) cur.expr = spec.expr;
    if (POSITIONS.indexOf(spec.pos) !== -1) cur.pos = spec.pos;
  }

  function applyHide(charas, order, hide) {
    toList(hide).forEach(function (id) {
      if (id === "*") {
        order.slice().forEach(function (x) {
          delete charas[x];
        });
        order.length = 0;
      } else if (charas[id]) {
        delete charas[id];
        order.splice(order.indexOf(id), 1);
      }
    });
  }

  function applyCommon(st, spec) {
    if (typeof spec.bg === "string" || spec.bg === null) st.bg = spec.bg;
    if (typeof spec.cg === "string" || spec.cg === null) st.cg = spec.cg;
    if (HALO_STATES.indexOf(spec.halo) !== -1) st.halo = spec.halo;
    applyHide(st._charas, st._order, spec.hide);
    toList(spec.show).forEach(function (one) {
      applyOne(st._charas, st._order, one);
    });
  }

  /**
   * pages: 正規化前でも後でもよい。index: 0 始まりのページ位置。
   *   index < 0 は「シーン開始位置」（scene.stage だけを適用した状態）。
   * opts: { stage: scene.stage, cast: STORY.cast }
   * 戻り値: { bg, cg, halo, charas: [{ id, pose, expr, pos }], speaker, speakerChara, fx: [] }
   */
  function stageAt(pages, index, opts) {
    opts = opts || {};
    var cast = opts.cast || {};
    var list = normalizePages(pages);
    var st = { bg: null, cg: null, halo: DEFAULT_HALO, _charas: {}, _order: [] };
    var speaker = null;
    var fx = [];

    if (isObject(opts.stage)) applyCommon(st, opts.stage);

    var last = Math.min(typeof index === "number" ? index : -1, list.length - 1);
    for (var i = 0; i <= last; i++) {
      var p = list[i];
      applyCommon(st, p);

      // 1 人ぶんの省略記法。chara が無ければ話者の立ち絵、それも無ければ舞台に 1 人だけのときその人に適用
      var hasShort = p.chara != null || p.pose != null || p.expr != null || p.pos != null;
      if (hasShort) {
        var target = typeof p.chara === "string" ? p.chara : null;
        if (!target && p.speaker) target = charaOfSpeaker(cast, p.speaker);
        if (!target && st._order.length === 1) target = st._order[0];
        if (target) applyOne(st._charas, st._order, { chara: target, pose: p.pose, expr: p.expr, pos: p.pos });
      }

      if (i === last) {
        speaker = typeof p.speaker === "string" && p.speaker ? p.speaker : null;
        fx = toList(p.fx).filter(function (x) {
          return typeof x === "string" && x;
        });
      }
    }

    var speakerChara = speaker ? charaOfSpeaker(cast, speaker) : null;
    if (speakerChara && !st._charas[speakerChara]) speakerChara = null;

    return {
      bg: st.bg,
      cg: st.cg,
      halo: st.halo,
      charas: st._order.map(function (id) {
        var c = st._charas[id];
        return { id: c.id, pose: c.pose, expr: c.expr, pos: c.pos };
      }),
      speaker: speaker,
      speakerChara: speakerChara,
      fx: fx
    };
  }

  /** シーン内で使う立ち絵の組（先読み用）。重複は除く。 */
  function charasUsed(pages, opts) {
    var list = normalizePages(pages);
    var seen = {};
    var out = [];
    for (var i = -1; i < list.length; i++) {
      stageAt(list, i, opts).charas.forEach(function (c) {
        var key = c.id + "/" + c.pose + "/" + c.expr;
        if (!seen[key]) {
          seen[key] = true;
          out.push({ id: c.id, pose: c.pose, expr: c.expr });
        }
      });
    }
    return out;
  }

  var api = {
    POSITIONS: POSITIONS,
    HALO_STATES: HALO_STATES,
    normalizePage: normalizePage,
    normalizePages: normalizePages,
    pageTexts: pageTexts,
    usesStage: usesStage,
    stageAt: stageAt,
    charasUsed: charasUsed
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.GameStage = api;
  }
})(this);
