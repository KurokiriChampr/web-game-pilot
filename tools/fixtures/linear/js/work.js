/* 検証用の作品設定（一本道 scene.next）。本作のデータではない */
(function (root) {
  "use strict";
  var WORK = {
    id: "fixture-linear",
    title: "一本道の検証",
    titleLines: ["一本道の", "検証"],
    subtitle: "エンジン検証用データ",
    lead: ["選択肢なしのシーン遷移（scene.next）を確かめるための、", "仮の物語です。"],
    hud: { shards: false, heart: false },
    slots: 3
  };
  if (typeof module !== "undefined" && module.exports) module.exports = WORK;
  else root.WORK = WORK;
})(this);
