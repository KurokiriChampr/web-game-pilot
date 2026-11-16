/* 検証用の作品設定（3 人同時表示）。本作のデータではない */
(function (root) {
  "use strict";
  var WORK = {
    id: "fixture-trio",
    title: "三人の検証",
    titleLines: ["三人の", "検証"],
    subtitle: "エンジン検証用データ",
    lead: ["立ち絵を三人まで並べる表示を確かめるための、", "仮の物語です。"],
    hud: { shards: false, heart: { label: "信頼", name: "三人の信頼" } },
    slots: 5
  };
  if (typeof module !== "undefined" && module.exports) module.exports = WORK;
  else root.WORK = WORK;
})(this);
