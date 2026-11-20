# エンジンと作品データの境界、別作品へ持ち出す手順

ver 3.0-p4 時点。このリポジトリは「ノベルゲームのエンジン」と「作品『刻の女神と止まった世界』のデータ」が同居している。
どこまでがエンジンで、どこからが作品かを、ここに決めておく。

## 1. 境界

### 作品（別作品では差し替える）

| ファイル | 中身 |
| --- | --- |
| `js/work.js` | 作品設定 `WORK`。作品 ID（保存キーの接頭辞）、題名、タイトル画面の文言、HUD の用語、スロット数、バックログの上限、幕の呼び名 |
| `js/story.js`（＋章のファイル） | 物語データ `STORY`。シーン、本文、舞台指示、選択肢、分岐、登場人物（`cast`）、上限値（`maxShards`・`maxAffection`・`endingCount`） |
| `assets/manifest.json`、`assets/` | 素材の対応表（背景・立ち絵・BGM）と素材そのもの |
| `css/work.css` | 配色。シーンのテーマ（`scene.theme` → `body.theme-xxx`）と、基調色の上書き |

### エンジン（作品に依らない。別作品へそのまま持っていく）

| ファイル | 中身 |
| --- | --- |
| `js/stage.js` | 舞台の計算（ページの正規化、誰がどこにいるか、話者、章） |
| `js/assets.js` | 素材の読み込みと表示（背景のクロスフェード、立ち絵の枠、BGM） |
| `js/game.js` | 進行（文字送り、ページ送り、選択肢）、既読・スキップ、オート、セーブ／ロード、バックログ・巻き戻し、設定、クイックバー、確認ダイアログ、古い画面の検出 |
| `css/style.css` | 画面構成と部品の見た目、立ち絵の並べ方、レスポンシブ対応 |
| `index.html` | 画面の骨組み（部品の id は `js/game.js` の `ELEMENT_IDS` と対応） |
| `tools/` | プレビュー用サーバ、物語データの点検、作品を Node で読む共通処理 |

### まだエンジンの中に残っている「作品寄り」のもの（→ 報告書の見送り一覧）

- **状態の変数が 2 つに固定**（`affection` と `shards`）。HUD の表示・セーブの説明もこの 2 つが前提。隠すことと呼び名の変更はできるが、増やせない。
- **光輪**（`js/assets.js` の `buildHalo` と `css/style.css` の `.chara-halo`）。形が本作の「砕けた文字盤」。manifest に `halo` を書かなければ出ない。
- **タイトル画面の紋章と演出**（`index.html` の文字盤の針、`css/style.css` の `is-timeflow`、縦画面でロゴを顔の上下に分ける配置）。
- **結末の種類ごとの飾り**（`css/style.css` の `.ending-box[data-kind]` の絵文字）。
- **検査の基準データ**（`tools/verify-text.js` と `tools/baseline/` は本作の ver 2.1 が基準。`tools/e2e*.js` も本作の画面が前提）。

## 2. 作品設定（`js/work.js`）

| 項目 | 必須 | 意味 |
| --- | --- | --- |
| `id` | ○ | 保存キーの接頭辞。`<id>-save-v1`・`-slots-v1`・`-endings-v1`・`-settings-v1`・`-read-v1` になる。半角の英小文字・数字・ハイフン。**公開後に変えるとセーブを引き継げない。** 無いとエンジンは始まらない |
| `title` |  | 作品名（設定画面、ブラウザのタブ） |
| `documentTitle` |  | タブの題名を作品名と変えたいとき |
| `titleLines`／`subtitle`／`lead` |  | タイトル画面のロゴ（行ごとの配列）／小見出し／紹介文 |
| `hud.shards`／`hud.heart` |  | `{ label, name }` で呼び名を変える。`false` で隠す（`STORY.maxShards`／`maxAffection` が 0 でも隠れる） |
| `slots` |  | 手動セーブのスロット数（既定 3、1〜30） |
| `limits` |  | バックログの上限 `{ logEntries: 150, logPages: 600, rewindPoints: 40 }`（§4） |
| `stepLabel` |  | 幕の呼び名を返す関数 `({ scene, steps, ending, chapter }) → 文字列` |

書いていない項目は `index.html` の文言とエンジンの既定値のままになる。

## 3. 立ち絵を 3 人まで並べる（舞台指示）

舞台指示の形式は従来のまま。1 人しか出ない作品は何も変えなくてよい。

- 位置は `left`／`center`／`right`。**1 か所に 1 人**なので、同時に並ぶのは最大 3 人。
- `pos` を省いて新しく出た人は、空いている位置に立つ（中央 → 左 → 右の順）。
- すでに人のいる位置へ別の人が立つ（または移る）と、**先にいた人が退場する**。意図しない押し出しは `tools/validate-story.js` が「注意」として知らせる。
- 話者（`speaker`）が舞台にいれば、その人を手前に出して少し大きく見せ、ほかの人を暗くする。地の文と、舞台にいない人の台詞では、全員同じ明るさ。
- 2 人以上が同時に話すときは、`cast` に `charas`（人物 ID の配列）を持つ話者を作る。

```js
cast: {
  aoi: { name: "アオイ", chara: "aoi" },
  beni: { name: "ベニ", chara: "beni" },
  duo: { name: "アオイとベニ", charas: ["aoi", "beni"] }   // 2 人同時
},
scenes: {
  walk: {
    stage: { bg: "path", show: [{ chara: "beni", pos: "left" }, { chara: "aoi", pos: "center" }, { chara: "sui", pos: "right" }] },
    text: [
      { text: "「行こう」", speaker: "aoi", expr: "smile" },   // アオイが手前、ほかの 2 人は暗く
      { text: "「せーの」", speaker: "duo" },                  // アオイとベニが話者
      { text: "ベニが抜けた。", hide: ["beni"] }
    ]
  }
}
```

人物ごとの背丈は `assets/manifest.json` の `characters[人物].scale`（省略＝1）。

## 4. 長編にするとき

| こと | やり方・決まり |
| --- | --- |
| 章に分ける | 章ごとのファイルで `GameStage.addChapter(STORY, { id, title, scenes })` を呼び、`index.html` で `js/stage.js` のあとに `<script>` を並べる。章のあるシーンでは、幕の呼び名が章の題名になる（「第 n 幕」の代わり） |
| 読み込み | 物語データは起動時にすべて読む（遅延読み込みはしない）。本作の 40 倍（802 シーン・約 15.6 万字・844 KB）で、処理を 4 倍遅くした環境でもタイトル表示まで約 0.3 秒だった。画像はシーンごとに読む |
| 既読 | 形式は従来と同じ（`<id>-read-v1` の配列に、シーン ID／`シーン#指紋`／`シーン>指紋`）。40 倍で約 6,200 要素・93 KB。エンジンは保存文字列が変わらないかぎり読み直さず、新しく読んだときだけ書く |
| バックログとセーブ | バックログはセーブに入るので、行数（150）・ページ数（600）・巻き戻し用の控え（40）の 3 つで抑える。超えたぶんは古い方から落ちる（控えだけが落ちた行は、文面は残り「戻る」が出なくなる） |
| シーン ID | `#` と `>` は使えない（既読の区切り） |
| シーンの終わり | 結末でないシーンは、選択肢か `next` で終わる（下の「選択肢なしのシーン遷移」） |

### 選択肢なしのシーン遷移（`scene.next`）

```js
prologue_1: { title: "雨の朝", text: ["……"], next: "prologue_2" },                              // シーン ID
prologue_2: { title: "駅まで", text: ["……"], next: function (s) { return s.flags.late ? "run" : "walk"; } } // 状態から決める
```

- 最終ページを表示し終えると「シーンを最後まで読んだ」と記録し、送りの印（▼）を出して**待つ**。もう一度送る（タップ／Enter）と次のシーンへ入る。入り方は選択肢を選んだときと同じ（幕の数 +1、行き先の `onEnter`、バックログにシーンの行、オートセーブ、最初のページから）。
- 遷移のときに状態を変えたいときは、行き先のシーンの `onEnter` を使う（`next` 専用の effects は無い）。
- `choices` と併用できる：**見える選択肢が 1 つ以上あれば選択肢、0 個のときだけ `next`**（`requires` で全部隠れたときの行き場になる）。結末のシーンでは使われない。
- オートは送り待ちでもいつもの待ち時間のあとで進む（選択肢と結末では止まる）。既読スキップはシーンの中だけで、最終ページで止まる。
- バックログには選択肢の行が入らない（シーンの行が続く）。巻き戻し（「戻る」「最後の選択肢からやり直す」）は、いちばん近い選択肢まで戻る。一本道の途中へは戻れない。
- セーブに足す項目は無い。送り待ちの状態は保存せず、再開はそのシーンの最初のページから。
- 点検（`tools/validate-story.js`）：行き先の無い `next`、選択肢も `next` も無いシーン、`next` だけで抜けられない輪は**誤り**。結末の `next`、全部に `requires` が付いた選択肢（`next` なし）、関数しだいで抜けられる `next` の輪は**注意**。
- 動く見本は `tools/fixtures/linear/`（`node tools/preview-server.js --work tools/fixtures/linear`）。

## 5. 別作品へ持ち出す手順

1. **コピーするもの（エンジン）**：`index.html`、`css/style.css`、`js/stage.js`、`js/assets.js`、`js/game.js`、`tools/preview-server.js`、`tools/validate-story.js`、`tools/lib/`。
2. **新しく書くもの（作品）**：`js/work.js`、`js/story.js`、`css/work.css`、`assets/manifest.json`、`assets/`。ひな形は `tools/fixtures/trio/`（3 ファイルだけの最小の作品）が使える。
3. **`js/work.js`**：`id` を決める（ほかの作品と重ならない名前）。題名・紹介文・HUD の用語・スロット数を書く。
4. **`js/story.js`**：`start`、`cast`、`scenes`、`maxShards`（使わなければ 0）、`maxAffection`、`endingCount`。
5. **`assets/manifest.json`**：`title`（タイトルの絵）、`backgrounds`、`characters`。光輪を使わない人物には `halo` を書かない。
6. **`css/work.css`**：使うテーマ（`scene.theme`）の配色を書く。基調色を変えるなら `:root` の変数を上書きする。
7. **`index.html` の書き換え**：`<meta name="description">` と `theme-color`、`<title>`（読み込み前に見える分）、タイトル画面の紋章（文字盤の針）が合わなければ差し替えるか外す。長編なら章のファイルの `<script>` を足す。部品の id は変えない。
8. **版**：`index.html` の `data-app-version`・`?v=`（7 か所）と `js/game.js` の `VERSION` を、その作品の版にそろえる。
9. **点検と確認**：`node tools/validate-story.js` で誤り 0 件にする。`node tools/preview-server.js --placeholders` で、素材が届く前でも画面を確かめられる。

エンジンを差し替えずに別作品を動かす確認は、`node tools/preview-server.js --work <作品のフォルダ> --placeholders` でできる（作品のフォルダにあるファイルが優先され、無いものはこのリポジトリのものが使われる）。
