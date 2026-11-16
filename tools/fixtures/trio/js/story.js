/*
 * 検証用の物語データ（3 人同時表示）。本作のデータではない。
 * 人物：aoi（本作の立ち絵を流用）／beni・sui・dan（サーバが作る単純な図形）
 * 話者：duo＝二人同時（cast の charas）、voice＝舞台にいない声（立ち絵なし）
 */
(function (root) {
  "use strict";
  var STORY = {
    start: "gather",
    maxShards: 0,
    maxAffection: 6,
    endingCount: 1,
    cast: {
      aoi: { name: "アオイ", color: "#9fd8ff", chara: "aoi" },
      beni: { name: "ベニ", color: "#ffb0a8", chara: "beni" },
      sui: { name: "スイ", color: "#b8e6b0", chara: "sui" },
      dan: { name: "ダン", color: "#d9c2ff", chara: "dan" },
      duo: { name: "アオイとベニ", color: "#f2d48a", charas: ["aoi", "beni"] },
      voice: { name: "遠くの声", color: "#cccccc", chara: "nobody" }
    },
    scenes: {
      gather: {
        title: "三人がそろう",
        icon: "◆",
        theme: "tower",
        stage: { bg: "plaza" },
        text: [
          "（1）まだ誰もいない広場。",
          { text: "（2）アオイが来た。位置の指定なし＝中央に立つ。", chara: "aoi", pose: "stand", expr: "normal" },
          { text: "（3）「お待たせ」ベニが来た。位置の指定なし＝空いている左に立つ。", speaker: "beni", chara: "beni", expr: "normal" },
          { text: "（4）スイも来た。右を指定。地の文なので、三人とも同じ明るさ。", show: [{ chara: "sui", pos: "right", expr: "normal" }] },
          { text: "（5）「三人そろったね」アオイが話す。ほかの二人は沈む。", speaker: "aoi", expr: "smile" },
          { text: "（6）「せーの」アオイとベニが同時に話す。スイだけが沈む。", speaker: "duo" },
          { text: "（7）「……聞こえる？」舞台にいない声。誰も沈まない。", speaker: "voice" },
          { text: "（8）「ねえ、あれ」右のスイが話す。", speaker: "sui", expr: "surprised", fx: "hop" },
          { text: "（9）「やあ」ダンが左に来た。左にいたベニは退場する（1 か所に 1 人）。", speaker: "dan", show: [{ chara: "dan", pos: "left" }] },
          { text: "（10）アオイが右へ移る。右にいたスイは退場する。", chara: "aoi", pos: "right" },
          { text: "（11）全員が退場する。", hide: "*" },
          { text: "（12）「最後はひとりで」アオイだけが戻る。1 人のときは従来どおりの表示。", speaker: "aoi", chara: "aoi", expr: "wry" }
        ],
        choices: [
          { text: "三人で進む", next: "walk", effects: { affection: 2, flags: { together: true } } },
          { text: "ひとりで進む", next: "walk" }
        ]
      },
      walk: {
        title: "並んで歩く",
        icon: "◆",
        theme: "forest",
        stage: {
          bg: "path",
          show: [
            { chara: "beni", pos: "left", expr: "normal" },
            { chara: "aoi", pos: "center", expr: "normal" },
            { chara: "sui", pos: "right", expr: "normal" }
          ]
        },
        text: function (s) {
          var t = [
            "（1）シーンの最初から三人が並んでいる（stage の show）。",
            { text: "（2）「行こう」中央のアオイ。", speaker: "aoi", expr: "smile" },
            { text: "（3）「うん」左のベニ。", speaker: "beni" },
            { text: "（4）「待って」右のスイ。", speaker: "sui", expr: "surprised" }
          ];
          if (s.flags.together) t.push({ text: "（5）三人で選んだ道は、少しだけ明るく見えた。" });
          t.push({ text: "（終）ベニが抜けて二人になる。", hide: ["beni"] });
          return t;
        },
        choices: [{ text: "おわりへ", next: "fin" }]
      },
      fin: {
        title: "検証のおわり",
        icon: "◆",
        theme: "night",
        ending: { id: "fin", name: "END「検証のおわり」", kind: "normal" },
        stage: { bg: "path", show: [{ chara: "aoi", pos: "left" }, { chara: "sui", pos: "right" }] },
        text: ["二人で終わる。", { text: "「おつかれさま」", speaker: "sui" }]
      }
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = STORY;
  else root.STORY = STORY;
})(this);
