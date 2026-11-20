/*
 * 検証用の物語データ（選択肢なしのシーン遷移 scene.next）。本作のデータではない。
 *
 *   opening ─ 左 → l1 ─next→ l2 ─next→ gate ┐
 *           ─ 右 → r1 ─next→ ─────────────── gate ─next(関数)→ 鍵あり：door ／ 鍵なし：fork
 *           ─ まっすぐ → s1 ─next→ s2 ─next→ end_straight（結末）
 *   fork：鍵が要る選択肢だけ＋next（鍵なし＝見える選択肢 0 個 → next で lastroad へ）
 *   door：鍵が要る選択肢＋next（鍵あり＝選択肢が優先）
 *   lastroad：選択肢だけ（オートはここで止まる）
 *   章：gate から先は「第二章　門の先」。それより前は章なし（「第 n 幕」）
 */
(function (root) {
  "use strict";
  var STORY = {
    start: "opening",
    maxShards: 0,
    maxAffection: 0,
    endingCount: 3,
    chapters: [{ id: "ch2", title: "第二章　門の先" }],
    scenes: {
      opening: {
        title: "分かれ道",
        icon: "◇",
        theme: "day",
        text: ["（序 1）道が三つに分かれている。", "（序 2）どの道を行こうか。"],
        choices: [
          { text: "左の道へ", next: "l1", effects: { flags: { left: true } } },
          { text: "右の道へ", next: "r1" },
          { text: "まっすぐ進む", next: "s1" }
        ]
      },
      l1: {
        title: "左の道・一",
        icon: "◇",
        theme: "forest",
        text: ["（左 1-1）木立のあいだを歩く。", "（左 1-2）鳥の声が遠ざかる。"],
        next: "l2"
      },
      l2: {
        title: "左の道・二",
        icon: "◇",
        theme: "forest",
        text: ["（左 2-1）小川を渡る。", "（左 2-2）石が濡れて滑りやすい。", "（左 2-3）向こう岸に門が見えた。"],
        next: "gate"
      },
      r1: {
        title: "右の道",
        icon: "◇",
        theme: "day",
        onEnter: { flags: { key: true } },
        text: ["（右 1）道ばたに古い鍵が落ちていた。", "（右 2）拾って先へ進む。"],
        next: "gate"
      },
      gate: {
        title: "門前",
        icon: "◇",
        theme: "night",
        chapter: "ch2",
        text: ["（門 1）大きな門の前に出た。", "（門 2）門をくぐる。"],
        next: function (s) {
          return s.flags.key ? "door" : "fork";
        }
      },
      fork: {
        title: "行き止まりの壁",
        icon: "◇",
        theme: "night",
        chapter: "ch2",
        text: ["（壁 1）壁に小さな鍵穴がある。", "（壁 2）鍵が無いので、脇の道を行く。"],
        choices: [{ text: "鍵で隠し扉を開ける", next: "end_door", requires: function (s) { return !!s.flags.key; } }],
        next: "lastroad"
      },
      door: {
        title: "鍵穴の扉",
        icon: "◇",
        theme: "night",
        chapter: "ch2",
        text: ["（扉 1）壁に小さな鍵穴がある。", "（扉 2）拾った鍵が合いそうだ。"],
        choices: [{ text: "鍵で扉を開ける", next: "end_door", requires: function (s) { return !!s.flags.key; } }],
        next: "lastroad"
      },
      lastroad: {
        title: "最後の道",
        icon: "◇",
        theme: "night",
        chapter: "ch2",
        text: ["（終 1）道はまだ続いている。", "（終 2）どうしようか。"],
        choices: [
          { text: "旅を終える", next: "end_a" },
          { text: "もう少し歩く", next: "end_a" }
        ]
      },
      s1: {
        title: "まっすぐの道・一",
        icon: "◇",
        theme: "day",
        text: ["（直 1-1）まっすぐな道を進む。", "（直 1-2）振り返らずに歩く。"],
        next: "s2"
      },
      s2: {
        title: "まっすぐの道・二",
        icon: "◇",
        theme: "day",
        text: ["（直 2-1）丘の上に出た。", "（直 2-2）ここで旅は終わる。"],
        next: "end_straight"
      },
      end_a: {
        title: "旅の終わり",
        icon: "◇",
        theme: "night",
        chapter: "ch2",
        ending: { id: "a", name: "END A「旅の終わり」", kind: "normal" },
        text: ["（結 A）長い道のりだった。"]
      },
      end_door: {
        title: "扉の向こう",
        icon: "◇",
        theme: "night",
        chapter: "ch2",
        ending: { id: "door", name: "END B「扉の向こう」", kind: "true" },
        text: ["（結 B）扉の向こうには光があった。"]
      },
      end_straight: {
        title: "丘の上",
        icon: "◇",
        theme: "day",
        ending: { id: "straight", name: "END C「丘の上」", kind: "bad" },
        text: ["（結 C）まっすぐ来すぎたのかもしれない。"]
      }
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = STORY;
  else root.STORY = STORY;
})(this);
