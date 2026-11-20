/* 検証用の作品設定（状態変数 STORY.vars）。本作のデータではない */
(function (root) {
  "use strict";
  var WORK = {
    id: "fixture-vars",
    title: "変数の検証",
    titleLines: ["変数の", "検証"],
    subtitle: "エンジン検証用データ",
    lead: ["作品が宣言する状態変数（STORY.vars）を確かめるための、", "仮の物語です。"],
    hud: { shards: false, heart: false },
    slots: 3
  };
  if (typeof module !== "undefined" && module.exports) module.exports = WORK;
  else root.WORK = WORK;
})(this);
