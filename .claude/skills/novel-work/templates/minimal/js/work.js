/*
 * 作品設定（WORK）。項目の意味は .claude/skills/novel-work/references/work-config.md と docs/ENGINE.md §2。
 * id は保存キー（localStorage）の接頭辞。公開したあとは変えない（変えるとセーブを引き継げない）。
 */
(function (root) {
  "use strict";
  var WORK = {
    id: "novel-work-template",
    title: "作品の題名",
    titleLines: ["作品の題名"],
    subtitle: "ノベルゲーム",
    lead: ["紹介文の 1 行目。", "紹介文の 2 行目。"],
    hud: { shards: false, heart: { label: "信頼", name: "ミオの信頼" } },
    slots: 3
  };
  if (typeof module !== "undefined" && module.exports) module.exports = WORK;
  else root.WORK = WORK;
})(this);
