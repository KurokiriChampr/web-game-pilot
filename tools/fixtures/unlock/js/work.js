/* 検証用の作品設定（周回をまたぐ解放 STORY.unlocks）。本作のデータではない */
(function (root) {
  "use strict";
  var WORK = {
    id: "fixture-unlock",
    title: "解放の検証",
    titleLines: ["解放の", "検証"],
    subtitle: "エンジン検証用データ",
    lead: ["到達したエンディングで次の周のフラグが立つ仕組み（STORY.unlocks）を確かめるための、", "仮の物語です。"],
    hud: { shards: false, heart: false },
    slots: 3
  };
  if (typeof module !== "undefined" && module.exports) module.exports = WORK;
  else root.WORK = WORK;
})(this);
