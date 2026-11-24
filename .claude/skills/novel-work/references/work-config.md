# 作品設定 `js/work.js`

正本は `docs/ENGINE.md` §2。ここは作品を作る側の要点だけ。

```js
(function (root) {
  "use strict";
  var WORK = {
    id: "my-story",                       // 必須。保存キーの接頭辞
    title: "題名",
    documentTitle: "題名（よみ）",          // タブの題名を変えたいときだけ
    titleLines: ["題名の", "2 行目"],        // タイトル画面のロゴ（行ごと）
    subtitle: "小見出し",
    lead: ["紹介文 1 行目", "紹介文 2 行目"],
    hud: { shards: false, heart: { label: "信頼", name: "ミオの信頼" } },
    slots: 3
  };
  if (typeof module !== "undefined" && module.exports) module.exports = WORK;   // Node（点検ツール）用。消さない
  else root.WORK = WORK;
})(this);
```

| 項目 | 要点 |
| --- | --- |
| `id` | 半角英小文字・数字・ハイフン（先頭は英小文字か数字）。保存キーは `<id>-save-v1`・`-slots-v1`・`-endings-v1`・`-settings-v1`・`-read-v1`。**公開後に変えない。** 同じサイト（同じドメイン）に置く作品どうしで重ねない |
| `title`／`documentTitle` | 設定画面とタブの題名。`build-work.js` は `documentTitle`（無ければ `title`）を `index.html` の `<title>` に入れる |
| `titleLines`／`subtitle`／`lead` | タイトル画面の文言。`build-work.js` は `lead` をつないで `<meta name="description">` に入れる（`--description` で上書き可） |
| `hud.shards`／`hud.heart` | 上部の表示。`{ label, name }` で呼び名、`false` で隠す。`STORY.maxShards`／`maxAffection` が 0 でも隠れる |
| `slots` | 手動セーブの数（1〜30、既定 3） |
| `titleProgress` | タイトル画面の結末・既読の表示。既定 `"inline"`（そのまま並べる）、`"dialog"` で「進行状況」ボタンから開く（スマホで場所を取らない） |
| `limits` | バックログの上限 `{ logEntries: 150, logPages: 600, rewindPoints: 40 }`。長編で変えたいときだけ |
| `stepLabel` | 「第 n 幕」の呼び名を返す関数 `({ scene, steps, ending, chapter }) → 文字列`。章のあるシーンは何もしなくても章の題名になる |

- `module.exports` の行は、点検ツールと `new-work.js`（ID の重複確認）が Node で読むために要る。
- HUD に出せるのは好感度（heart）と欠片（shards）の 2 つだけ。`STORY.vars` の変数を HUD に出す仕組み（設計の `WORK.hud.items`）はまだ無い。
