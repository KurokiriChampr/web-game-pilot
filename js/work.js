/*
 * 作品設定（この作品に固有で、物語データ以外のもの）
 * ------------------------------------------------------------
 * エンジン（js/game.js）は、題名・用語・保存キー・上限値をここから読む。
 * 別作品を作るときは、このファイルと js/story.js、assets/、css/work.css を差し替える（docs/ENGINE.md）。
 *
 *   id:            保存キー（localStorage）の接頭辞。半角の英小文字・数字・ハイフン。【必須】
 *                  同じサイトに置くほかの作品と重ならない名前にする。公開後に変えるとセーブが引き継がれない。
 *   title:         作品名（設定画面の表記、ブラウザのタブ）
 *   documentTitle: ブラウザのタブに出す題名（省略＝title）
 *   titleLines:    タイトル画面のロゴ（行ごとの配列。省略＝title を 1 行で）
 *   subtitle:      ロゴの上の小さな見出し
 *   lead:          ロゴの下の紹介文（行ごとの配列）
 *   hud:           上部の状態表示。shards／heart それぞれ { label: 短い見出し, name: 説明に出す名前 }。
 *                  false にするとその表示を隠す（STORY.maxShards／maxAffection が 0 の作品でも隠れる）
 *   slots:         手動セーブのスロット数（省略＝3）
 *   limits:        バックログ（セーブデータに入る）の上限。{ logEntries, logPages, rewindPoints }（省略＝150／600／40）
 *   stepLabel:     「第 n 幕」の呼び名を変える関数（省略可）。({ scene, steps, ending, chapter }) → 文字列
 */
(function (root) {
  "use strict";

  var WORK = {
    id: "chrono-tale",
    title: "刻の女神と止まった世界",
    documentTitle: "刻（とき）の女神と止まった世界",
    titleLines: ["刻の女神と", "止まった世界"],
    subtitle: "異世界転生テキストアドベンチャー",
    lead: ["目覚めた異世界は、すべての時間が止まっていた。", "時の女神の少女とともに、三つの欠片を取り戻せ。"],
    hud: {
      shards: { label: "欠片", name: "時の欠片" },
      heart: { label: "心", name: "女神の心" }
    },
    slots: 3
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = WORK;
  } else {
    root.WORK = WORK;
  }
})(this);
