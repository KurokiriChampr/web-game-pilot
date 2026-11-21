# 次期設計 第4弾D：スキル化（`.claude/skills/novel-work/`）報告書（2026-11-21）

- 依頼者：ベル（ヴェルダンディ／Muse）、承認：マスター
- 作業ブランチ：`claude/novel-work-skill-20261121`（`main` の `33e62d4` から分岐）
- 設計：`docs/gui-next-design-report-20261117.md`（ブランチ `claude/novel-game-engine-next-design-hlyv54`）§3
- マスターの決定に従った点：リポジトリ内のプロジェクトスキル、作品は `works/<作品ID>/`、エンジンは複製しない、プラグイン化（第 2 段階）はしない

## 0. 要約

- `.claude/skills/novel-work/` に、手順（SKILL.md）・参照資料 5 本・ひな形 4 ファイル・スクリプト 2 本を置いた。
- 足場スクリプト `new-work.js` で見本の作品 `works/sample-morning/` を作り、点検は**誤り 0・注意 0**。Playwright でプレビューに読み込み、タイトル → 3 シーン → 結末まで遊べて画面のエラーが 0 件であることを確かめた。
- 公開用にまとめる `build-work.js` も作り、まとめた結果だけ（エンジンを重ねない状態）で点検が誤り 0・注意 0、ブラウザでも最後まで遊べた。
- 本編（`index.html`・`js/`・`css/`・`assets/`）と `tools/` は**変えていない**。既存の検査 3 本は従来どおり合格。
- 見本の作品は**消した**（理由は §4）。ひな形がそのまま誤り 0・注意 0 の作品なので、見本の役はひな形が持つ。

## 1. 変更内容

| ファイル | 内容 |
| --- | --- |
| `.claude/skills/novel-work/SKILL.md` | スキルの本体（約 110 行）。定義（`name`・`description`）、作品フォルダの形、してはいけないこと、最初に確かめること、手順 7 段（足場 → work.js → story.js → 素材と配色 → 点検 → プレビュー → 公開用にまとめる）、守ること、参照資料の案内 |
| `.claude/skills/novel-work/references/story-format.md` | 物語データの書式（全体・シーン・ページ・選択肢と状態・`next`・変数・章）。`docs/ENGINE.md` §3・§4 を正本として指し、作品を作る側の一覧に絞った |
| `.claude/skills/novel-work/references/work-config.md` | `js/work.js` の項目（`docs/ENGINE.md` §2 の要点と、`build-work.js` がどの項目を使うか） |
| `.claude/skills/novel-work/references/assets.md` | 素材の置き場所（`--placeholders` が効く並び）、manifest、`css/work.css`（`docs/ASSETS.md` の要点） |
| `.claude/skills/novel-work/references/checks.md` | `validate-story` の誤り・注意の一覧と直し方 |
| `.claude/skills/novel-work/references/pitfalls.md` | 守ること（理由つき）と、公開時に残る本作の部分 |
| `.claude/skills/novel-work/templates/minimal/` | ひな形：`js/work.js`・`js/story.js`・`css/work.css`・`assets/manifest.json`。1 人（ミオ）・3 シーン・結末 1。選択肢（effects・flags）、本文の関数、一本道の `next`、結末を 1 つずつ含む。**このままで点検 誤り 0・注意 0（`--strict` でも合格）** |
| `.claude/skills/novel-work/scripts/new-work.js` | 足場スクリプト（下記） |
| `.claude/skills/novel-work/scripts/build-work.js` | 公開用にまとめるスクリプト（下記） |
| `docs/ENGINE.md` | 末尾に、スキルの場所と使い方を指す 1 段落を足しただけ（2 行） |

### 1-1. `new-work.js`（足場）

```sh
node .claude/skills/novel-work/scripts/new-work.js <作品ID> [--title 題名] [--dry-run]
```

- ひな形の 4 ファイルを `works/<作品ID>/` に写し、作品 ID と題名を書き込む。エンジンのファイルは写さない。
- 弾くもの：ID の書式違い（`js/game.js` の `WORK_ID` と同じ規則 `^[a-z0-9][a-z0-9-]*$`）、検証用・ひな形の名前（`fixture-…`・`novel-work-template`）、本作・`tools/fixtures/*`・`works/*` の `js/work.js` で使われている ID、既にあるフォルダ（上書きしない）、題名の `"`・`\`・改行。
- 作ったあとすぐ `tools/validate-story.js` の `validate` で点検し、誤りがあれば失敗（終了コード 1）。最後に次の手順と点検・プレビューのコマンドを出す。

### 1-2. `build-work.js`（公開用にまとめる）

```sh
node .claude/skills/novel-work/scripts/build-work.js works/<作品ID> --out <リポジトリの外のフォルダ> [--description 説明文]
```

- `index.html` の `<script>`・`<link rel="stylesheet">` をたどり、作品 → エンジンの順に探して写す（`preview-server.js --work` と同じ重ね合わせ）。作品の `assets/` は丸ごと、manifest が指していて作品に無い素材は本作から借りて写し、借りたもの・無いものを一覧で出す。
- `index.html` は `<title>` と `<meta name="description">` だけを書き換える。版は変えない（`js/game.js` が `data-app-version` と `VERSION` の一致を見ているため）。
- 出力はリポジトリと重なる場所を拒み、空でないフォルダには書かない。まとめた後、出力フォルダだけで点検し、誤りがあれば失敗。

## 2. スキルの構成

```
.claude/skills/novel-work/
├── SKILL.md
├── references/
│   ├── story-format.md
│   ├── work-config.md
│   ├── assets.md
│   ├── checks.md
│   └── pitfalls.md
├── templates/
│   └── minimal/
│       ├── js/work.js
│       ├── js/story.js
│       ├── css/work.css
│       └── assets/manifest.json
└── scripts/
    ├── new-work.js
    └── build-work.js
```

設計 §3-1(b) との違い：

- `templates/chapter.js`（章のファイルのひな形）は**作らなかった**。章をファイルに分けると、`works/<ID>/` に `index.html` の写し（章の `<script>` を足したもの）が要り、マスターの決定「エンジンの複製はしない」に反するため。代わりに、章は `story.js` の中に `STORY.chapters` と `scene.chapter` で書く方法を案内した（エンジンは対応済み。点検も通る）。
- 参照資料の重複を減らすため、仕様の正本は `docs/ENGINE.md`・`docs/ASSETS.md`・`tools/validate-story.js` のままにし、参照資料は要約と「作品を作る側の手順」に絞った。設計 §3-1(e) の 4（スキル側を正とし、ENGINE.md からスキルを指す）は採らず、ENGINE.md からは場所を指す 1 段落だけにした（判断に迷った点 2）。

## 3. 検証結果

### 3-1. 既存の検査（変更後に実行）

| 検査 | 結果 |
| --- | --- |
| `node tools/verify-text.js` | OK: 表示テキスト列・選択肢・シーン属性は基準と完全一致 |
| `node tools/validate-story.js` | OK: 誤り 0 件、注意 0 件（シーン 20・選択肢 43・結末 4） |
| `node tools/test-stage.js` | OK: **1,757,055 件**の検査に合格 |
| `validate-story --work tools/fixtures/{trio,linear,vars}` | いずれも誤り 0（trio の注意 2 件は検証用の意図した押し出しで、従来どおり） |

### 3-2. ひな形・足場スクリプト

| 確認 | 結果 |
| --- | --- |
| `validate-story --work .claude/skills/novel-work/templates/minimal --strict` | 誤り 0・注意 0 |
| `new-work.js sample-morning --title "朝の見本"` | 4 ファイルを作成、内部の点検 誤り 0・注意 0。`work.js` の `id`・`title`・`titleLines` が置き換わる |
| `node tools/validate-story.js --work works/sample-morning` | **OK: 誤り 0 件、注意 0 件**（シーン 3・選択肢 2・結末 1） |
| 弾くもの | ID なし・`Bad_ID`・`chrono-tale`（本作）・`fixture-x`・`--title` の値なし・作成済みの `sample-morning`（works/ との重複）・既存フォルダ `works/other`：すべて終了コード 1 で何も作らない。`--dry-run` は一覧だけ |

### 3-3. プレビュー（Playwright、`NODE_PATH=/home/hatch/.pw-node/node_modules`）

一時的な確認スクリプト（`/tmp` に置き、リポジトリには入れていない）で、`tools/preview-server.js` の `createServer` を使って読み込んだ。

| 構成 | 結果 |
| --- | --- |
| `roots: [works/sample-morning, リポジトリ]`、`--placeholders` 相当 | タブの題名「朝の見本」、タイトル画面に作品の文言。はじまり → 帰り道（`next`）→ おわり（結末）まで進行。保存キーは `sample-morning-endings-v1`・`-read-v1`・`-settings-v1` のみ（本作のキーは出ない）。背景 3 枚・立ち絵 2 枚は仮の絵（SVG）で表示。404 は 0 件、画面のエラー 0 件 |
| `build-work.js` の出力フォルダだけ（エンジンを重ねない） | 同じく結末まで進行、画面のエラー 0 件。素材 5 件は 404（素材が無いときの表示で正常） |

### 3-4. `build-work.js`

| 確認 | 結果 |
| --- | --- |
| `works/sample-morning` をまとめる | 10 ファイル。エンジン 5 ファイルはリポジトリと、作品 4 ファイルは作品と**バイト単位で一致**。`index.html` の差分は `<title>` と `description` の 2 行だけ。出力だけでの点検 誤り 0・注意 0。無い素材 5 件を一覧表示 |
| `tools/fixtures/trio` をまとめる | 本作から借りた素材 6 件（`village_plaza.webp`・`rine` の 4 表情・`forest.jpg`）を写して一覧表示、無い素材（`fx-*` の SVG）を一覧表示 |
| 空でない出力先・リポジトリの中の出力先 | どちらも終了コード 1 で拒否 |

出力は確認後に削除した。

### 3-5. 本編に触れていないこと

`git status`：変更は `.claude/`（新規）、`docs/ENGINE.md`（2 行追加）、本報告書だけ。`index.html`・`js/`・`css/`・`assets/`・`tools/` は変更なし。localStorage のキーと版（3.0-p4）にも触れていない。

## 4. 見本の作品の扱い：消した

- 見本 `works/sample-morning/` は、ひな形を ID と題名だけ置き換えたもので、中身はひな形と同じ。残すと同じ内容が 2 か所になり、ひな形を直すたびに見本も直す必要が出る。
- ひな形そのものが「点検 誤り 0・注意 0」の作品として `--work` で読めるので、見本の役（動く例・回帰確認の対象）はひな形が持てる。
- `works/` は「本当の作品を置く場所」として空けておく方が、`new-work.js` の重複確認（works/ の ID を見る）とも素直。
- 再現は `node .claude/skills/novel-work/scripts/new-work.js sample-morning --title "朝の見本"` の 1 行。

## 5. 判断に迷った点

1. **`build-work.js` を作るか**。依頼の「少なくとも」4 項目には入っていないが、SKILL.md に「公開の手順」を書くよう指示があり、設計 §3-1(b) にもあるので作った。設計の迷った点のとおり、本来はエンジン側の課題（見送り 3）で、スキルにエンジン構成の知識（`index.html` のたどり方、版の一致）が入り込む。`tools/` に置く案もあったが、`tools/` は変えない方針を優先してスキル内に置いた。
2. **参照資料の正本をどちらにするか**。設計 §3-1(e) の 4 は「スキル側を正とし、ENGINE.md からスキルを指す」だが、それには ENGINE.md を大きく書き換える必要がある。依頼の「docs/ENGINE.md への参照を中心に、重複は最小限に」に合わせ、正本は `docs/` のまま、スキルは要約に留めた。その分、エンジンの書式が変わったときは参照資料も直す必要がある（未解決 3）。
3. **章の扱い**。設計にある `templates/chapter.js` を作らず、`story.js` 内に章を書く方式だけを案内した（§2）。長編を章ごとのファイルに分けたい依頼が来たときは、スキルの範囲外として止めて知らせる扱いになる。
4. **ひな形の規模**。設計どおり「1 人・3 シーン・結末 1」にした。変数（`vars`）と章は、ひな形の冒頭のコメントで書き方だけ示し、実データには入れなかった（使わない作品が消す手間を避けるため）。
5. **ID の重複確認の範囲**。`new-work.js` が見るのはこのリポジトリの中だけ。同じドメインの別リポジトリに置いた作品との重複は分からないので、`pitfalls.md` に書いた。
6. **`build-work.js` の出力先**。リポジトリの中（`works/` の下も含む）を全面的に拒んだ。`works/` の下を許すと、写しのエンジンがリポジトリに入るうえ、`new-work.js` がその ID を「使用中」と見なすため。

## 6. 未解決

1. **新しいセッションでスキルが使われるかは試していない**（設計 §3-1(e) の 6）。`description` の文言で「新しいノベルゲームを作りたい」などの依頼に反応するか、手順どおりに進むか、エンジンに触れないかを、何も知らないセッションで 3〜5 通り試す必要がある。
2. **ひな形の点検を `tools/test-stage.js` に組み込んでいない**（設計 §3-1(e) の 7）。組み込むと合格件数が 1,757,055 件から変わり、今回の条件（従来どおり）に反するため見送った。当面は `node tools/validate-story.js --work .claude/skills/novel-work/templates/minimal --strict` を手で回す。エンジンを変えたときにひな形が壊れても、自動では気づけない。
3. **参照資料と `docs/ENGINE.md` の二重保守**。書式（ページの項目・点検の文言など）が変わったら、`references/story-format.md`・`checks.md` も直す必要がある。
4. **公開時に残る本作の部分**：タイトル画面の紋章（文字盤の針）、`theme-color`、結末の飾りの絵文字、版（3.0-p4 のまま）。`build-work.js` は知らせるだけで変えない。作品ごとの版の付け方（設計 §3-3 の 5）も未決のまま。
5. **HUD に変数を出す仕組み（`WORK.hud.items`）は無い**。変数を使う作品でも HUD は好感度・欠片の 2 つだけ。
6. **実機確認**：スマホの実機・実素材での確認はしていない（仮の絵とヘッドレスのブラウザまで）。
7. **プラグイン化（第 2 段階）**はマスターの決定どおり手を付けていない。
