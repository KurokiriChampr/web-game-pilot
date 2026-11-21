/*
 * 作品設定（WORK）。項目の意味は .claude/skills/novel-work/references/work-config.md と docs/ENGINE.md §2。
 * id は保存キー（localStorage）の接頭辞。公開したあとは変えない（変えるとセーブを引き継げない）。
 */
(function (root) {
  "use strict";
  var WORK = {
    id: "ano-hi-no-koe",
    title: "あの日の声",
    titleLines: ["あの日の声"],
    subtitle: "乙女ゲーム（叩き台）",
    lead: ["転校初日の交差点で、私を助けてくれた人がいた。", "顔も知らないあの人を探して、私は星見学園で恋をする。"],
    // 好感度は人物ごとの変数（STORY.vars.aff）で持つ。HUD に出す仕組みが無いので、上部の表示は出さない
    hud: { shards: false, heart: false },
    slots: 6
  };
  if (typeof module !== "undefined" && module.exports) module.exports = WORK;
  else root.WORK = WORK;
})(this);
