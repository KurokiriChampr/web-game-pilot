---
name: novel-work
description: このリポジトリのノベルゲームエンジンで、新しい作品を作る・書き足す・点検する・公開用にまとめる。「新しいノベルゲームを作りたい」「works/ に作品を足して」「シーンを足して」「物語データを点検して」「作品を公開用にまとめて」のときに使う。本作（刻の女神と止まった世界）の本文やエンジン自体の改造には使わない。
---

# novel-work：エンジンで新しい作品を作る

このリポジトリは「ノベルゲームのエンジン」と「本作『刻の女神と止まった世界』」が同居している。
新しい作品は **`works/<作品ID>/` に、作品が差し替えるファイルだけ**を置いて作る。エンジンは複製せず、
点検ツールとプレビューが「作品のフォルダ → リポジトリ直下（エンジン）」の順に重ねて読む。

```
works/<作品ID>/
├── js/work.js            作品設定 WORK（ID・題名・タイトル画面・HUD の用語・スロット数）
├── js/story.js           物語データ STORY（登場人物・シーン・選択肢・分岐・変数・章）
├── css/work.css          配色（シーンのテーマ）
└── assets/manifest.json  素材の対応表（＋ assets/images/…、assets/bgm/… に素材そのもの）
```

コマンドはすべてリポジトリ直下で実行する。

## してはいけないこと

- **エンジンと本作のファイルを書き換えない**：`index.html`、`js/`（`game.js`・`state.js`・`stage.js`・`assets.js`・本作の `work.js`・`story.js`）、`css/`、`assets/`（本作の素材）、`tools/`。
  作業の最後に `git status` で、変わったのが `works/<作品ID>/` だけであることを確かめる。
- エンジンに無い機能（HUD に変数を出す、章をファイルに分ける、など）が要るときは、**エンジンを直さずに作業を止めて依頼者に知らせる**。できることの範囲は `references/story-format.md` にある。
- 本作を `works/` へ動かさない。

## 最初に確かめること（依頼者に聞く。決まらなければ仮で進め、報告に書く）

1. 作品 ID（保存キーの接頭辞。半角英小文字・数字・ハイフン。**公開後は変えない**）と題名
2. 登場人物（ID と表示名）、結末の数
3. 好感度（`affection`）・欠片（`shards`）を使うか、作品独自の数値の変数（`vars`）が要るか
4. 素材（背景・立ち絵・BGM）があるか。**無ければ仮の画像で最後まで進める**（`--placeholders`）
5. 物語の中身（プロット・文体）は依頼者が決めること。スキルが受け持つのは書式と点検まで

## 手順

1. **骨組みを作る**
   ```sh
   node .claude/skills/novel-work/scripts/new-work.js <作品ID> --title "題名"
   ```
   ひな形（1 人・3 シーン・結末 1、選択肢と `next` と結末を 1 つずつ）を写し、ID と題名を書き込んで、点検まで済ませる。
   ID の書式、本作・検証用の作品・既存の作品との重複、フォルダの既存は、ここで弾かれる。
2. **`js/work.js` を書く** → `references/work-config.md`
3. **物語データ `js/story.js` を書く** → `references/story-format.md`。
   ひな形のシーン（`start`・`walk`・`fin`）は置き換えてよい。`start`・`cast`・`maxAffection`・`maxShards`・`endingCount` を物語に合わせる。
4. **素材と配色**：`assets/manifest.json`、`css/work.css` → `references/assets.md`。
   story.js で使う背景・人物・ポーズ・表情・テーマは、すべてここに書く（無いと点検で誤り／注意）。
5. **点検する（関門）**
   ```sh
   node tools/validate-story.js --work works/<作品ID>
   ```
   **誤りが 0 件になるまで直す。** 注意は 1 件ずつ、意図どおりか確かめる（意図どおりなら残してよいが、報告に書く）。
   読み方と直し方は `references/checks.md`。書くたびに回す（長い物語ほど、まとめて直すと大変になる）。
6. **画面で確かめる**
   ```sh
   node tools/preview-server.js --work works/<作品ID> --placeholders   # http://localhost:8080/
   ```
   `--placeholders` は、`assets/images/bg/` と `assets/images/chara/` の下の**まだ無い**画像に仮の絵を返す。
   付けないと、素材が無いときの表示（グラデーション背景・立ち絵なし）になる。画面を自分で見られないときは、依頼者に見てもらう。
7. **公開用にまとめる**（頼まれたときだけ）
   ```sh
   node .claude/skills/novel-work/scripts/build-work.js works/<作品ID> --out <リポジトリの外のフォルダ>
   ```
   エンジン＋作品＋素材を 1 つの静的サイトにまとめ、`<title>` と説明文を作品のものにし、まとめた結果を点検する。
   本作の素材を借りたもの・無い素材・残る本作の部分（タイトルの紋章、版）を一覧で出すので、依頼者に伝える。
   出力フォルダをどこへ置くか（GitHub Pages など）は、依頼者の環境しだいなので、手順として決めない。

## 守ること（理由と詳細は `references/pitfalls.md`）

- 作品 ID は公開後に変えない（セーブを引き継げなくなる）。同じサイトに置くほかの作品と重ねない。
- シーン ID に `#` と `>` を使わない（既読の記録の区切り）。
- 同じシーンに同じ本文のページを 2 つ置かない（既読を共有する）。
- 結末でないシーンは、選択肢か `next` で終わる。
- 立ち絵は 1 か所に 1 人・最大 3 人。押し出したくないときは先に `hide` する。
- 公開済みの作品で変数・シーンを消すときは、古いセーブへの影響を考える（宣言から外れた変数はロード時に落ちる）。

## 参照資料（必要になった段で読む。最初から全部は読まない）

| ファイル | 読むとき |
| --- | --- |
| `references/story-format.md` | 物語データを書くとき（シーン・ページ・舞台指示・選択肢・`next`・変数・章） |
| `references/work-config.md` | `js/work.js` を書くとき |
| `references/assets.md` | 素材・manifest・配色を書くとき |
| `references/checks.md` | 点検の誤り・注意が出たとき |
| `references/pitfalls.md` | 公開の前、作品を書き換える前 |

エンジンの仕様の正本は `docs/ENGINE.md`（境界・作品設定・3 人表示・長編・`next`・変数）と `docs/ASSETS.md`（素材）。
参照資料はその要約と、作品を作る側の手順だけを持つ。食い違ったら `docs/` と `tools/validate-story.js` を正とする。
動く見本は `tools/fixtures/`（`trio`＝3 人表示、`linear`＝`next`、`vars`＝変数）。
