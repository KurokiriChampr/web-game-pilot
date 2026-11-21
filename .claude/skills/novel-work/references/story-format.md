# 物語データ `js/story.js` の書式

正本は `docs/ENGINE.md`（§3 舞台、§4 長編・`next`・変数）と本作 `js/story.js` 冒頭の説明。点検の規則は `tools/validate-story.js` が正。
ここは作品を作る側から見た一覧。

## 全体

```js
(function (root) {
  "use strict";
  var STORY = {
    start: "start",            // 開始シーン ID
    maxShards: 0,              // 欠片の上限（使わなければ 0 → HUD に出ない）
    maxAffection: 3,           // 好感度の上限（使わなければ 0）
    endingCount: 1,            // 結末の数（結末のシーンの数と合わないと注意）
    cast: { mio: { name: "ミオ", color: "#9fd8ff", chara: "mio" } },   // 話者
    vars: { ... },             // 省略可。作品独自の数値の変数（下の「変数」）
    chapters: [ ... ],         // 省略可。章（下の「章」）
    scenes: { start: { ... }, ... }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = STORY;
  else root.STORY = STORY;
})(this);
```

- `cast[話者 ID]`：`name`（名前札）、`color`（名前札の色）、`chara`（舞台の人物 ID。話者を手前に出すのに使う）。
  2 人以上の同時の台詞は `charas: ["aoi", "beni"]`。舞台にいない声は、manifest に無い `chara` でよい。

## シーン

| 項目 | 意味 |
| --- | --- |
| `title`（必須） | シーン名（バナー・バックログ・セーブの表示） |
| `icon` | 絵文字（背景画像が無いときの紋章） |
| `theme` | 配色。`body.theme-<theme>` を `css/work.css` に書く |
| `text`（必須） | ページの配列、または状態 `s` を受け取って配列を返す関数 |
| `stage` | シーン開始時の舞台 `{ bg, cg, halo, show, hide }` |
| `choices` | `[{ text, next, effects, requires }]` |
| `next` | 選択肢なしで次へ進む行き先（シーン ID か、`s` を受け取って ID を返す関数） |
| `onEnter` | シーンに入ったときの effects |
| `ending` | 結末のシーンだけ `{ id, name, kind }`（`kind` は `true`／`normal`／`bad`／`another`。結末画面の絵文字の飾りが変わる。本作向けの飾り） |
| `fx` | 背景の演出 `petals`／`petals-fall`／`motes`／`embers`／`dust` |
| `enter` | 入った瞬間の演出 `shake`／`flash` |
| `chapter` | 章 ID（`STORY.chapters` にあるもの） |

**シーンの終わり**：結末でないシーンは `choices` か `next` が要る。両方あれば、**見える選択肢が 1 つ以上なら選択肢、0 個なら `next`**。

## ページ（`text` の要素）

文字列（地の文。舞台はそのまま）か、次の項目を持つオブジェクト。

| 項目 | 意味 |
| --- | --- |
| `text` | 本文 |
| `speaker` | 話者 ID（`cast` のキー）。省略＝地の文 |
| `chara`／`pose`／`expr`／`pos` | 立ち絵 1 人の指定（出す・表情を変える・移る）。次の指定まで続く |
| `show` | 複数人 `[{ chara, pose, expr, pos }]` |
| `hide` | 退場 `["mio"]`、全員 `"*"` |
| `bg`／`cg` | 背景・一枚絵の切り替え（manifest の `backgrounds` の名前）。次の指定まで続く |
| `halo` | 光輪 `weak`／`flicker`／`strong`／`off`（本作向けの飾り。manifest に `halo` が無い人物には出ない） |
| `fx` | そのページだけの演出 `hop`／`shake`／`flash` |

- 立ち絵の位置は `left`／`center`／`right`、**1 か所に 1 人・最大 3 人**。`pos` を省くと空いている所（中央 → 左 → 右）。
  人のいる位置へ別の人を立たせると、先にいた人が退場する（点検で注意）。
- `pose`／`expr` を省くと直前のもの。初めて出す人は `stand`／`normal` になる（manifest にあるポーズ・表情だけ使える）。
- 話者が舞台にいれば手前に出て、ほかの人は暗くなる。地の文では全員同じ明るさ。

## 選択肢と状態

```js
choices: [
  { text: "声をかける", next: "walk", effects: { affection: 1, shards: 1, flags: { talked: true } } },
  { text: "鍵を使う", next: "door", requires: function (s) { return !!s.flags.key; } },
  { text: "進む", next: function (s) { return s.affection >= 3 ? "good" : "plain"; } }
]
```

- 状態 `s`：`s.affection`（数値）、`s.shards`（数値）、`s.flags`（何でも入る。真偽・文字列はここ）、`s.vars`（宣言した変数だけ）。
- `effects`／`onEnter`：`affection`・`shards` は加算、`flags` は代入、`vars` は下記。
- `requires` が偽の選択肢は表示されない。全部に `requires` を付けるなら、全部隠れたときの行き先として `next` を足す。
- `text`・`next`・`requires` の関数は、状態を読むだけにする（書き換えない）。

## 一本道（`scene.next`）

```js
a: { title: "雨の朝", text: ["……"], next: "b" },
b: { title: "駅まで", text: ["……"], next: function (s) { return s.flags.late ? "run" : "walk"; } }
```

- 最終ページのあと、もう一度送ると次のシーンへ（入り方は選択肢と同じ。幕の数 +1、`onEnter`、オートセーブ）。
- 遷移で状態を変えたいときは、行き先の `onEnter`。巻き戻しはいちばん近い選択肢まで。
- `next` だけで抜けられない輪は誤り。見本：`tools/fixtures/linear/`。

## 変数（`STORY.vars`）

```js
vars: {
  gold:  { initial: 100, min: 0 },                                     // 作品全体で 1 つ
  trust: { initial: 0, min: 0, max: 10, per: ["aoi", "beni"] }        // 人物ごと（s.vars.trust.aoi）
},
// 更新：数値＝加算、{ set: 値 }＝代入。適用後に min／max へ収まる
effects: { vars: { gold: -30, trust: { aoi: 2, beni: { set: 0 } } } }
// 参照
requires: function (s) { return s.vars.trust.aoi >= 3 && s.vars.gold >= 30; }
```

- 入れられるのは数値だけ。変数名は半角英数字と `_`（先頭は英字、`set` は不可）。
- 宣言していない変数・`per` に無い人物の使用は誤り。HUD には出せない（まだ仕組みが無い）。
- 見本：`tools/fixtures/vars/`。詳細は `docs/ENGINE.md` §4「状態変数」。

## 周回をまたぐ解放（`STORY.unlocks`）

```js
unlocks: {
  true_route: { endings: ["bad_aoi", "bad_beni", "bad_sui", "bad_kuro"] },          // 4 つ全部に到達で
  two_bad:    { endings: ["bad_aoi", "bad_beni", "bad_sui", "bad_kuro"], count: 2 } // 2 つ以上で
},
// 次の周の新規開始で flags.true_route = true になる。参照はふつうのフラグと同じ
requires: function (s) { return !!s.flags.true_route; }
```

- `endings` は結末のシーンの `ending.id`。効くのは新規開始だけ（つづきから・ロード・巻き戻しでは変わらない）。
- 存在しないエンディング ID は誤り。フラグなしでは条件の結末に届かないと注意。見本：`tools/fixtures/unlock/`。詳細は `docs/ENGINE.md` §4「周回をまたぐ解放」。

## 章

`works/` の作品では、**章は `story.js` の中に書く**（ファイルを分けない）。

```js
chapters: [{ id: "ch1", title: "第一章　出会い" }, { id: "ch2", title: "第二章　旅立ち" }],
scenes: {
  meet: { title: "…", chapter: "ch1", ... },
  leave: { title: "…", chapter: "ch2", ... }
}
```

- 章のあるシーンでは、「第 n 幕」の代わりに章の題名が出る。
- 章ごとにファイルを分ける方法（`GameStage.addChapter` と `index.html` の `<script>`）は、作品のフォルダに `index.html` の写しが要るため、
  このスキルの範囲では使わない。1 ファイルが大きくなっても動く（本作の 40 倍・844 KB で確認済み。`docs/ENGINE.md` §4）。
