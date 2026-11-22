# 報告書：『Heart Refrain ～あの日の声～』のサブパス公開（2026-11-23）

依頼者：ベル（ヴェルダンディ／Muse）、承認：マスター
ブランチ：`bell/otome-publish-20261123`
PR：#27（https://github.com/KurokiriChampr/web-game-pilot/pull/27）（マージはしていません）
想定 URL：https://kurokirichampr.github.io/web-game-pilot/ano-hi-no-koe/

## 1. やったこと

1. main（`a1860f3`、PR #26 マージ後）から `node .claude/skills/novel-work/scripts/build-work.js works/ano-hi-no-koe --out /tmp/…/out` を実行。
   - 結果：62 ファイル、**誤り 0 件・注意 0 件**。「無い素材」「本作の素材を借りたもの」の行は出力されず、いずれも **0 件**。
   - 残っている本作の部分（スクリプトの通知どおり）：タイトル画面の紋章（文字盤の針）、版 `3.0-p4`。
2. 出力一式をリポジトリ直下の `ano-hi-no-koe/` にそのまま配置（`diff -r` で一致を確認）。生成物である旨と更新手順を書いた `ano-hi-no-koe/README.md` を追加。
3. 追加したのは `ano-hi-no-koe/`（63 ファイル、約 23 MB）と本報告書のみ。ルートの `index.html` を含む既存ファイルは変更していません。

## 2. 検証結果（Playwright／Chromium）

リポジトリ直下を Pages と同じ形で静的配信し（`/ano-hi-no-koe/` のサブパスで開く。ディレクトリへの末尾スラッシュ補完・Range 応答あり）、PC（1280×800）とスマホ（iPhone 13 相当 390×844、縦画面）で確認。全 24 項目合格。

| 項目 | PC | スマホ |
|---|---|---|
| タイトル画面が出る（`document.title` = Heart Refrain ～あの日の声～） | ✓ | ✓ |
| タイトル絵の読み込み成功（`body.has-bg`） | ✓ | ✓ |
| 表示中の背景 | 横長 `title.webp` ✓ | 縦長 `title-portrait.webp` ✓ |
| 題字入り絵のため文字ロゴは見た目上隠れる | ✓ | ✓ |
| タイトル BGM `assets/bgm/title.mp3` をタイトル画面で要求し、200 で取得（2,111,661 bytes） | ✓ | ✓ |
| 「はじめから」でゲーム画面へ、最初のシーン（序章 あの日の交差点「転校の朝」、1/5）の本文が出る | ✓ | ✓ |
| 404・読み込み失敗なし | ✓ | ✓ |
| ページエラー・console エラーなし | ✓ | ✓ |
| 要求はすべて `/ano-hi-no-koe/` 配下（本編の素材を参照しない） | ✓ | ✓ |
| 保存キーは `ano-hi-no-koe-save-v1` / `ano-hi-no-koe-read-v1` のみ（本編と同一オリジンでもセーブが混ざらない） | ✓ | ✓ |

スクリーンショットでも、PC は横長絵＋右側メニュー、スマホは縦長絵（題字が上部）＋下部メニューで表示されることを目視確認しました。

※ BGM は「要求されて 200 で取れる」までを確認しています。ヘッドレス環境のため実際に音が鳴ることの確認はしていません。

## 3. 判断に迷った点

- **Jekyll（Pages の配信方式）**：Pages は `main` の `/` から legacy（Jekyll）ビルドで配信されており、`.nojekyll` はありません。Jekyll は `_` 始まりのファイル等を除外しますが、生成物にそのようなファイルは無いため影響なしと判断し、`.nojekyll` は追加していません（既存ファイル以外の追加は依頼範囲外のため）。`ano-hi-no-koe/README.md` は Jekyll により `README.html` としても公開されますが、`index.html` が優先されるので害は無いと判断しました。
- **検証用スクリプトの置き場所**：配置先は `ano-hi-no-koe/` と報告書のみという指示に従い、Playwright の確認スクリプトはリポジトリに入れず一時フォルダ（`/tmp/pubcheck/check.js`）で実行しました。再利用したい場合は `tools/` へ追加する別作業になります。
- **スマホのタイトル画面**：縦長絵では左上の紋章（文字盤の針、本作由来）が題字「H」の上に重なって見えます。build-work.js が通知している既知の残り（references/pitfalls.md）で、作品側（`works/`）の見た目の問題のため今回は触れていません。また、スマホ幅では紹介文（lead）は既存 CSS の仕様で非表示です。

## 4. 未解決

- 実際の GitHub Pages 上での表示確認は、PR マージ・Pages の再ビルド後でないとできません。マージ後に想定 URL を開いて確認してください。
- リポジトリに約 23 MB（主に BGM 8 曲・背景絵）が加わります。Pages の容量上限（1 GB）には十分収まります。

## 5. 今後の更新手順

作品（`works/ano-hi-no-koe/`）を直したら：

```sh
node .claude/skills/novel-work/scripts/build-work.js works/ano-hi-no-koe --out /tmp/ano-hi-no-koe-build   # 出力先は無いか空のフォルダ
# 誤り 0・注意 0・無い素材 0 を確認
find ano-hi-no-koe -mindepth 1 ! -name README.md -delete     # README.md 以外を消す
cp -r /tmp/ano-hi-no-koe-build/. ano-hi-no-koe/
git add -A ano-hi-no-koe && git commit
```

差し替え後、`ano-hi-no-koe/` を静的配信して表示を確認してからマージします。作品 ID（`WORK.id`）はセーブキーの接頭辞なので、公開後は変えないでください。
