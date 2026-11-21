/*
 * 検証用の物語データ（周回をまたぐ解放 STORY.unlocks）。本作のデータではない。
 *
 *   解放（到達済みエンディング → 新規開始のときに立つフラグ）
 *     seen_aoi   ：bad_aoi に到達済み（1 つ）                         → 序の本文に 1 ページ増える
 *     two_bad    ：bad_aoi・bad_beni・bad_sui・bad_kuro のうち 2 つ以上 → 選択肢「見覚えのある道」
 *     true_route ：同じ 4 つすべて                                    → 選択肢「真実の扉」
 *
 *   opening ─ アオイ／ベニ／スイ／クロについていく → それぞれのバッドエンディング
 *           ─ 見覚えのある道（requires two_bad）  → end_normal
 *           ─ 真実の扉（requires true_route）     → true_gate（本文が flags を読む）─next→ end_true
 */
(function (root) {
  "use strict";
  var BADS = ["bad_aoi", "bad_beni", "bad_sui", "bad_kuro"];
  var STORY = {
    start: "opening",
    maxShards: 0,
    maxAffection: 0,
    endingCount: 6,
    unlocks: {
      seen_aoi: { endings: ["bad_aoi"] },
      two_bad: { endings: BADS, count: 2 },
      true_route: { endings: BADS }
    },
    cast: {
      aoi: { name: "アオイ" },
      beni: { name: "ベニ" },
      sui: { name: "スイ" },
      kuro: { name: "クロ" }
    },
    scenes: {
      opening: {
        title: "四つの道",
        icon: "◇",
        theme: "day",
        text: function (s) {
          var t = ["（序 1）分かれ道に、四人が立っている。"];
          if (s.flags.seen_aoi) t.push("（序 既）アオイの背中に、見覚えがある。");
          t.push("（序 2）誰についていこうか。");
          return t;
        },
        choices: [
          { text: "アオイについていく", next: "end_bad_aoi" },
          { text: "ベニについていく", next: "end_bad_beni" },
          { text: "スイについていく", next: "end_bad_sui" },
          { text: "クロについていく", next: "end_bad_kuro" },
          {
            text: "見覚えのある道",
            next: "end_normal",
            requires: function (s) {
              return !!s.flags.two_bad;
            }
          },
          {
            text: "真実の扉",
            next: "true_gate",
            requires: function (s) {
              return !!s.flags.true_route;
            }
          }
        ]
      },
      true_gate: {
        title: "扉の向こう",
        icon: "◇",
        theme: "day",
        text: function (s) {
          return ["（扉 1）四つの結末を越えて、扉が開いた。", s.flags.true_route ? "（扉 2）すべてを覚えている。" : "（扉 2）何も覚えていない。"];
        },
        next: "end_true"
      },
      end_bad_aoi: { title: "アオイの道", icon: "◇", theme: "day", text: ["（結 A）アオイの道は途切れた。"], ending: { id: "bad_aoi", name: "BAD END A", kind: "bad" } },
      end_bad_beni: { title: "ベニの道", icon: "◇", theme: "day", text: ["（結 B）ベニの道は途切れた。"], ending: { id: "bad_beni", name: "BAD END B", kind: "bad" } },
      end_bad_sui: { title: "スイの道", icon: "◇", theme: "day", text: ["（結 C）スイの道は途切れた。"], ending: { id: "bad_sui", name: "BAD END C", kind: "bad" } },
      end_bad_kuro: { title: "クロの道", icon: "◇", theme: "day", text: ["（結 D）クロの道は途切れた。"], ending: { id: "bad_kuro", name: "BAD END D", kind: "bad" } },
      end_normal: { title: "見覚えのある道", icon: "◇", theme: "day", text: ["（結 N）見覚えのある道を、ひとりで歩いた。"], ending: { id: "normal", name: "NORMAL END", kind: "normal" } },
      end_true: { title: "真実", icon: "◇", theme: "day", text: ["（結 T）四人と、もう一度出会った。"], ending: { id: "true", name: "TRUE END", kind: "true" } }
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = STORY;
  else root.STORY = STORY;
})(this);
