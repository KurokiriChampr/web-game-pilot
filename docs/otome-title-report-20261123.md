# 報告書：『Heart Refrain ～あの日の声～』タイトル絵の組み込み（2026-11-23）

- 依頼者：ベル（ヴェルダンディ／Muse）、承認：マスター
- ブランチ：`bell/otome-title-20261123`
- PR：[#26](https://github.com/KurokiriChampr/web-game-pilot/pull/26)（マージはしていない）

## 1. 結果の要約

- `title-a.png`（1024×576）を WebP（quality 90）に変換し、manifest の `title.image` が指す `works/ano-hi-no-koe/assets/images/bg/title.webp` に置いた。manifest は変更不要（既にこのパスを指していた）。
- 作品の表示名を「Heart Refrain ～あの日の声～」にした（`works/ano-hi-no-koe/js/work.js` の `title`・`titleLines`）。作品 ID `ano-hi-no-koe` と保存キーは変えていない。
- **依頼外の追加**：タイトル絵には題字が描かれているため、そのままだと文字のロゴと二重になり、スマホ縦では絵が横幅の中央しか見えず題字が「art Ref」と切れた。`works/ano-hi-no-koe/css/work.css` だけで対処した（§4、§6 で要確認）。
- 検証はすべて合格。公開用まとめの「無い素材」は 0 件になり、作品の素材はこれでそろった（§5）。

## 2. 変更したファイル

- `works/ano-hi-no-koe/assets/images/bg/title.webp`（新規、158,070 B）
- `works/ano-hi-no-koe/js/work.js`：`title`・`titleLines` とコメント
- `works/ano-hi-no-koe/css/work.css`：タイトル画面の追記（末尾のブロックのみ）
- `docs/otome-title-report-20261123.md`：本報告書

エンジン（`js/`・`css/`・`index.html`）、本編、manifest、`story.js` は変更していない。localStorage のキー体系にも触れていない。

## 3. 変換と表示名

### 変換

- 前回までの背景と同じ方式：Pillow（libwebp）で `quality=90, method=6`、RGB、サイズは元のまま 1024×576。変換スクリプトは一時の場所（`/tmp/ahk-title/convert.py`）で、リポジトリには入れていない。GPU・外部サービスは使っていない。
- `title-b.png` も同じフォルダにあるが、依頼どおり `title-a.png` のみを使った。

### 表示名の箇所

| 箇所 | 変更前 | 変更後 |
|---|---|---|
| `work.js` `title`（タブの題名・設定画面の題名。`build-work.js` が公開用 `index.html` の `<title>` に入れる） | あの日の声 | Heart Refrain ～あの日の声～ |
| `work.js` `titleLines`（タイトル画面の文字のロゴ） | `["あの日の声"]` | `["Heart Refrain", "～あの日の声～"]` |

- **サイト側（リポジトリ直下の `index.html`・`README.md`・`js/`・`tools/` 等）に本作の作品名を表示している箇所は無かった**（作品一覧のページも無い）。サイト側は変更していない。
- `story.js` の「あの日の声」（シーン `t_rescue` の題名、TRUE END の名前、章の題名、本文）は作品名ではなく物語中の言葉なので変えていない。`story.js` 冒頭・`tools/cutout.py` 冒頭のコメントの『あの日の声』も変えていない。
- `subtitle`（「乙女ゲーム（叩き台）」）と `lead`（紹介文）は表示名ではないので変えていない（§6）。

## 4. タイトル画面の表示調整（work.css）

依頼の「表示名を合わせる」だけを入れた状態で撮ると、次の 2 点の問題があった（変更前のスクリーンショットで確認）。

1. 絵の題字の下に、文字のロゴ「乙女ゲーム（叩き台）／あの日の声」（変更後なら「Heart Refrain ～あの日の声～」）が重ねて出て、題名が二重になる。
2. 縦画面ではエンジンの背景が `cover` のため横幅の中央 26% ほどしか見えず、題字が「art Ref」と切れる。manifest の `positionPortrait` は焦点をずらすだけなので、横幅の 54% ほどを占める題字は収められない。

対処（`work.css` の末尾、`body.theme-title` に限定。本編のシーンには効かない）：

- 絵が出ている間（`body.has-bg`）だけ、文字のロゴ（`.title-sub`・`.title-main`）を**見た目だけ**隠す（読み上げには残す）。絵が読めなかったときは従来どおり文字のロゴが出る（絵を外して撮影し、「Heart Refrain／～あの日の声～」の文字ロゴが出ることを確認済み）。
- 縦画面では絵を横幅いっぱい（`background-size: 100% auto`）で表示し、題字が切れないようにした。縦レイアウト（エンジンの縦画面の条件と同じ `max-width: 899px`）では、絵を紋章（文字盤）の下に置き、紹介文を絵の下へ送った。絵の下の余白はテーマ `title` のグラデーション（紫）になる。

元に戻すときは `work.css` 末尾の「タイトル絵（題字入り）」のブロックを消すだけでよい。

## 5. 検証

### 検証コマンド

| コマンド | 結果 |
|---|---|
| `node tools/validate-story.js --work works/ano-hi-no-koe` | OK：誤り 0 件、注意 0 件（シーン 45・結末 14）、exit 0 |
| `node tools/validate-story.js`（本編） | OK：誤り 0 件、注意 0 件、exit 0 |
| `node tools/test-stage.js` | OK：1,757,181 件の検査に合格、exit 0 |
| `node tools/verify-text.js` | OK：表示テキスト列・選択肢・シーン属性は基準と完全一致、exit 0 |
| `node .claude/skills/novel-work/scripts/build-work.js works/ano-hi-no-koe --out /tmp/ahk-build-title2` | OK：誤り 0・注意 0（61 ファイル。前回の 60 から `title.webp` 1 件増）、exit 0。**無い素材の報告は 0 件**（前回まで出ていた `assets/images/bg/title.webp` が解消）。公開用 `index.html` の `<title>` は「Heart Refrain ～あの日の声～」 |

- build の出力にある「残っている本作の部分: タイトル画面の紋章（文字盤の針）、版 3.0-p4」は従来からの案内で、今回の範囲外（§7）。
- エンジンと本編は変えていないので、既存の e2e（`tools/e2e*.js`）は実行していない。

### Playwright でのタイトル画面確認（一時の手段・リポジトリには置いていない）

- 従来と同じ方式。`/tmp/ahk-title/check.js` で `tools/preview-server.js` の `createServer` に「作品フォルダ → リポジトリ直下」の順で重ねて配信し、タイトル画面を開く → 画面の隅をクリック（自動再生制限の解除）→ `GameAssets.info().bgm` が `title.mp3` になるのを待って撮影。
- 判定：`images/bg/title.webp` と `bgm/title.mp3` が 200 で読み込まれたこと、`title.webp` が有効な背景レイヤー（`.bg-img.is-active`）に設定されていること、`GameAssets.info().bgm` が `assets/bgm/title.mp3` であること、400 番台以上の応答・ページのエラー・コンソールのエラーが無いこと。
- 実行：`NODE_PATH=/home/hatch/.pw-node/node_modules node /tmp/ahk-title/check.js final`（Chromium headless）

| 画面 | 大きさ | 結果 |
|---|---|---|
| PC | 1366×768 | OK |
| スマホ | 390×844（モバイル・2x） | OK |
| スマホ（背の低い端末） | 360×640（モバイル・2x） | OK |
| タブレット縦 | 820×1180（モバイル・2x） | OK |
| 縦長の大画面 | 1024×1366 | OK |

- 5 件すべて OK（404 0 件、ページエラー 0 件）。タブの題名は全件「Heart Refrain ～あの日の声～」。
- スクリーンショットを目視で確認：PC は絵の題字の下にメニュー・エンディング一覧が並び、文字ロゴの二重表示は無い。スマホ・タブレット縦は紋章の下に絵全体（題字が切れない）、その下に紹介文とメニュー。360×640 は従来どおり紹介文が省かれ、メニューが 2 列。
- スクリーンショットは `/tmp/ahk-title/`（`final-*.png`、変更前は `before-*.png`）にある（一時の場所）。

## 6. 判断に迷った点

- **文字のロゴを隠したこと（依頼外の見た目の変更）**：依頼は「表示名を合わせる」だったが、そのままでは題名が二重に出るため、絵が出ている間は文字のロゴを隠した。小見出し「乙女ゲーム（叩き台）」も一緒に隠れる。文字のロゴも残したい場合は、`work.css` の該当ルールを消せば戻る（ただし二重表示になる）。
- **縦画面で絵を横幅いっぱいにしたこと**：題字を切らないための判断。代わりに絵の下（画面の下 6〜7 割）は紫のグラデーションになり、横画面のような「絵が全面」の見た目ではなくなる。全面表示を優先するなら、縦画面用に題字の無い絵や縦長のタイトル絵を別に用意する案がある。
- **紋章（文字盤）**：エンジン共通のタイトル画面の要素で、PC では絵の左側（校舎の上）に小さく重なる。作品側で消すことはできるが、今回は依頼範囲外として残した（build も「残っている本作の部分」として案内している）。
- **`subtitle`「乙女ゲーム（叩き台）」**：表示名ではないので変えていない。絵がある間は見えないが、絵が読めないときやスクリーンリーダーでは出る。「叩き台」を外すかは判断を仰ぎたい。
- **`documentTitle`**：設定していない（タブの題名は `title` と同じ）。

## 7. 未解決

- §6 の見た目の判断（文字ロゴを隠す・縦画面の絵の置き方・`subtitle` の文言）の確認をお願いしたい。
- **実機での確認は未実施**（headless の Chromium のみ）。特にノッチのある iPhone のセーフエリア（`--safe-t`）での絵の位置。
- タブレット縦（820×1180）で、画面下の操作説明「タップ / Enter で…」が「読んだシーン」の行と重なる。**絵を外した変更前の状態でも同じように重なっており、今回の変更とは無関係**（エンジン側のレイアウト）。今回は直していない。
- 上記以外に失敗や保留は無い。

## 追記（2026-11-23）：縦長タイトル絵と小見出し

マスターの判断が出た 2 件（縦長タイトル絵の追加、小見出しから「（叩き台）」を外す）を、同じブランチ・同じ PR #26 に追加した。マージはしていない。

### A. 変更内容

| ファイル | 変更 |
|---|---|
| `works/ano-hi-no-koe/assets/images/bg/title-portrait.webp` | 新規（153,680 B、768×1024）。`title-portrait.png` を従来と同じ方式（Pillow、`quality=90, method=6`、RGB、サイズは元のまま）で変換 |
| `works/ano-hi-no-koe/css/work.css` | 末尾の「タイトル絵（題字入り）」のブロックを書き換え（下記） |
| `works/ano-hi-no-koe/js/work.js` | `subtitle` を「乙女ゲーム（叩き台）」→「乙女ゲーム」。表示名（`title`・`titleLines`）は変えていない |
| `docs/otome-title-report-20261123.md` | この追記 |

- **ファイル名**：`title-portrait.webp`。既存の命名（`論理名.webp`、変種は `_evening`・`_night` のように下線でつなぐ）にそろえるなら `title_portrait` も考えたが、元素材の名前 `title-portrait.png` と一致させて取り違えを防ぐことを優先した。気になるなら名前の変更は `work.css` の 1 か所を直すだけで済む。
- エンジン（`js/`・`css/`・`index.html`）、本編、manifest、`story.js` は変更していない。localStorage のキー体系にも触れていない。GPU・外部サービスは使っていない。

### B. 縦画面での差し替えの仕組み（work.css）

- `@media (orientation: portrait)` のとき、タイトル画面（`body.theme-title`）の背景レイヤー `.bg-img` の画像を `url("../assets/images/bg/title-portrait.webp")` に差し替え、`cover` で全面に出す（焦点は上端寄せ `center top`）。横画面・PC では従来どおり manifest の `title.webp`。
- エンジンの `js/assets.js` は背景レイヤーに `style` 属性で画像（`title.webp`）を入れるので、それを上書きするために `!important` を使っている（§D）。
- 「絵が出ている間は文字のロゴを隠す」は従来のルール（`body.theme-title.has-bg` で `.title-sub`・`.title-main` を見た目だけ隠す）がそのまま効く。縦長の絵の場合も同じく文字のロゴは出ない（Playwright で `#title-sub` の表示上の大きさが 1px 以下であることを確認）。
- 縦レイアウト（エンジンの縦画面の条件と同じ `orientation: portrait` かつ `max-width: 899px`）では、絵が画面の高さに合わせて出るため、題字（「～あの日の声～」まで）が画面の高さの上 36% ほどに来る。紹介文を `38dvh` の位置まで下げ、題字に重ならないようにした。
- **前回入れた縦画面用の調整は取り除いた**：横長の絵を横幅いっぱい（`100% auto`）で紋章の下に置く指定と、紹介文を `56.25vw` 下げる指定。縦長の絵を全面に出すので不要になった。

### C. 検証

#### 検証コマンド

| コマンド | 結果 |
|---|---|
| `node tools/validate-story.js --work works/ano-hi-no-koe` | OK：誤り 0 件、注意 0 件、exit 0 |
| `node tools/validate-story.js`（本編） | OK：誤り 0 件、注意 0 件、exit 0 |
| `node tools/test-stage.js` | OK：1,757,181 件の検査に合格、exit 0 |
| `node tools/verify-text.js` | OK：基準と完全一致、exit 0 |
| `node .claude/skills/novel-work/scripts/build-work.js works/ano-hi-no-koe --out /tmp/ahk-build-title3` | OK：誤り 0・注意 0（62 ファイル。前回の 61 から `title-portrait.webp` 1 件増）、exit 0。**無い素材の報告は 0 件のまま**。build は作品の `assets/` を丸ごと写すので、manifest に載っていない `title-portrait.webp` も公開用まとめに入る |

#### Playwright でのタイトル画面確認（一時の手段・リポジトリには置いていない）

- 前回と同じ `/tmp/ahk-title/check.js` を拡張して実行（`NODE_PATH=/home/hatch/.pw-node/node_modules node /tmp/ahk-title/check.js add2`、Chromium headless）。
- 判定に追加した項目：有効な背景レイヤー（`.bg-img.is-active`）の**計算後の**背景画像が、縦画面（高さ＞幅）なら `title-portrait.webp`、横画面なら `title.webp` であること／小見出し `#title-sub` の文字が「乙女ゲーム」であること／文字のロゴが表示上は隠れていること。従来の判定（`title.webp`・`title.mp3` の読み込み、BGM、400 番台以上の応答・ページエラー・コンソールエラーが 0）もそのまま。

| 画面 | 大きさ | 表示された絵 | 結果 |
|---|---|---|---|
| PC | 1366×768 | `title.webp` | OK |
| スマホ | 390×844（モバイル・2x） | `title-portrait.webp` | OK |
| スマホ（背の低い端末） | 360×640（モバイル・2x） | `title-portrait.webp` | OK |
| タブレット縦 | 820×1180（モバイル・2x） | `title-portrait.webp` | OK |
| 縦長の大画面 | 1024×1366 | `title-portrait.webp` | OK |

- 5 件すべて OK（404 0 件、ページエラー 0 件）。
- **公開用まとめ（`/tmp/ahk-build-title3`）だけを配信した場合も同じ 5 件がすべて OK**（`work.css` からの相対パスが公開用でも解決できることの確認）。
- スクリーンショットを目視で確認：
  - スマホ 390×844：縦長の絵が全面に出て、題字「Heart Refrain ～あの日の声～」は左右とも切れない。紹介文は題字のすぐ下、メニュー・エンディング一覧は校舎・校庭の上。文字のロゴの二重表示は無い。
  - 360×640：題字が切れずに出る。紹介文は従来どおり省かれ、メニューは 2 列。
  - タブレット縦・1024×1366：全面に縦長の絵。1024×1366 は幅が 899px を超えるのでエンジンの横レイアウト（紋章と紹介文が左、メニューが右）になり、紹介文は校舎の上に乗るが読める。
  - PC 1366×768：従来どおり横長の絵。小見出しは見えない（絵がある間は文字のロゴごと隠れる）。
- スクリーンショットは `/tmp/ahk-title/add2-*.png`（縦 4 枚を並べたものは `add2-montage.png`、公開用まとめは `build-*.png`）にある（一時の場所）。

### D. 判断に迷った点

- **manifest へのキー追加はしなかった**：エンジンの `js/assets.js` は manifest の各項目のうち `image`・`position`・`positionPortrait` など決まった名前しか読まず、縦画面用の別画像を指定するキーが無い。`title.imagePortrait` のような項目を足してもエンジンは無視するだけで、意味の無い記述になるため入れていない。エンジン本体の変更（縦画面用の画像キーの対応）は依頼どおり行っていない。将来、他の作品でも縦画面用の背景を使うなら、エンジン側に `imagePortrait` を足すのが本筋。
- **`!important` での上書き**：エンジンが背景画像を `style` 属性で入れるため、作品側 CSS から差し替えるには `!important` が要る。タイトル画面（`body.theme-title`）かつ縦画面に限定しているので、本編のシーンには効かない。
- **縦長の絵が読めなかったときの挙動**：文字のロゴを隠す条件 `has-bg` は、エンジンが横長の `title.webp` を読めたときに付く。縦長の絵だけが欠けた場合は、縦画面で絵も文字のロゴも出ず、テーマの色だけになる。build で素材が丸ごと写るので通常は起きないが、エンジンを変えずに CSS だけで防ぐ方法は無い。
- **縦画面の判定**：`orientation: portrait`（高さ≧幅）で切り替えている。iPad の縦（820×1180）や縦長のモニターでも縦長の絵になる。横画面は幅 899px 未満のスマホ横向きでも横長の絵。
- **紋章（文字盤）**：縦レイアウトでは画面上端に出て、題字「Heart」の上の空に少しかかる（文字には重ならない）。前回と同じく依頼範囲外として残した。
- **小見出し「乙女ゲーム」は画面では見えない**：絵が出ている間は文字のロゴ（小見出しを含む）を隠しているため、今回の変更が目に見えるのは、絵が読めなかったとき・設定で画像を切ったとき・読み上げのときのみ。小見出しだけ見せたい場合は `work.css` のルールから `.title-sub` を外せばよいが、絵の題字の上に文字が重なる位置になる。

### E. 未解決

- **実機での確認は未実施**（headless の Chromium のみ）。特にノッチのある iPhone のセーフエリアで、紋章・紹介文と絵の題字の位置関係。
- タブレット縦（820×1180）で画面下の操作説明と「読んだシーン」の行が重なる件は、前回の報告どおりエンジン側の既存の問題で、今回も直していない。
- 上記以外に失敗や保留は無い。
