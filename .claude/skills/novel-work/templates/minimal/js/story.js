/*
 * 物語データ（STORY）。書式は .claude/skills/novel-work/references/story-format.md。
 * ひな形：1 人（ミオ）・3 シーン・結末 1。選択肢（effects つき）、一本道（next）、結末を 1 つずつ含む。
 *
 *   start ─ 声をかける（信頼 +1）／黙って隣に座る ─→ walk ─next→ fin（結末）
 *
 * 状態変数を使うときは、STORY に vars を足す（例：vars: { gold: { initial: 0, min: 0 } }）。
 * 章に分けるときは、STORY に chapters: [{ id: "ch1", title: "第一章　…" }] を足し、各シーンに chapter: "ch1" を書く。
 */
(function (root) {
  "use strict";
  var STORY = {
    start: "start",
    maxShards: 0,
    maxAffection: 3,
    endingCount: 1,
    cast: {
      mio: { name: "ミオ", color: "#9fd8ff", chara: "mio" }
    },
    scenes: {
      start: {
        title: "はじまり",
        icon: "◆",
        theme: "morning",
        stage: { bg: "room" },
        text: [
          "朝の光が、窓から差し込んでいる。",
          { text: "「おはよう」", speaker: "mio", chara: "mio", pose: "stand", expr: "normal" },
          { text: "ミオは少し眠そうに笑った。", expr: "smile" }
        ],
        choices: [
          { text: "声をかける", next: "walk", effects: { affection: 1, flags: { talked: true } } },
          { text: "黙って隣に座る", next: "walk" }
        ]
      },
      walk: {
        title: "帰り道",
        icon: "◆",
        theme: "evening",
        stage: { bg: "street", show: [{ chara: "mio", pos: "center", expr: "normal" }] },
        text: function (s) {
          var t = ["夕方の道を、二人で歩く。"];
          if (s.flags.talked) t.push({ text: "「朝、声をかけてくれてうれしかった」", speaker: "mio", expr: "smile" });
          else t.push({ text: "「……静かな一日だったね」", speaker: "mio" });
          return t;
        },
        next: "fin"
      },
      fin: {
        title: "おわり",
        icon: "◆",
        theme: "night",
        ending: { id: "fin", name: "END「おわり」", kind: "normal" },
        stage: { bg: "street", show: [{ chara: "mio", pos: "center", expr: "smile" }] },
        text: [{ text: "「また明日」", speaker: "mio" }, "こうして、一日が終わった。"]
      }
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = STORY;
  else root.STORY = STORY;
})(this);
