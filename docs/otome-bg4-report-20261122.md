# 報告書：『あの日の声』背景の組み込み（最終回：保健室・書庫・病室・文化祭・キャンプファイヤー・闇＋夜の屋上・夕方の生徒会室）（2026-11-22）

- 依頼者：ベル（ヴェルダンディ／Muse）、承認：マスター
- ブランチ：`bell/otome-bg4-20261122`
- PR：[#24](https://github.com/KurokiriChampr/web-game-pilot/pull/24)（マージはしていない）

## 1. 結果の要約

- 生成済みの背景 PNG 11 枚を WebP（quality 90）に変換し、`works/ano-hi-no-koe/assets/images/bg/` に置いた。`infirmary`・`archive`・`hospital`・`festival`・`campfire`・`dark` は manifest の既存キーが指すパス、`infirmary_evening`・`archive_night`・`hospital_evening`・`rooftop_night`・`council_evening` は manifest に同じ形式で追加した。
- 時刻バリエーションを **stage 3 か所＋`t_fragments` の本文行 3 か所** に適用した（§4）：`ren_1` → `council_evening`、`ren_2` → `rooftop_night`、`tsukasa_2` → `archive_night`（ベルの判断）、`t_fragments` の屋上・中庭・夜の交差点の行 → `rooftop_night`・`courtyard_night`・`crossing_night`。bg3 報告書 §6 の屋上・生徒会室・`t_fragments` の保留はこれで解消。
- `infirmary_evening`・`hospital_evening` は、夕方と判断できるシーンが無いため **登録のみ**（§6）。
- 検証はすべて合格（§5）。公開用まとめの「無い素材」は 7 件 → **1 件（`title.webp` のみ）**。

## 2. 変更したファイル

- `works/ano-hi-no-koe/assets/images/bg/`（11 枚を追加）：`infirmary.webp`・`infirmary_evening.webp`・`archive.webp`・`archive_night.webp`・`hospital.webp`・`hospital_evening.webp`・`festival.webp`・`campfire.webp`・`dark.webp`・`rooftop_night.webp`・`council_evening.webp`
- `works/ano-hi-no-koe/assets/manifest.json`：`backgrounds` の `crossing_night` の次に `infirmary_evening`・`archive_night`・`hospital_evening`・`rooftop_night`・`council_evening` を追加（既存キーは変更なし）
- `works/ano-hi-no-koe/js/story.js`：bg 指定 6 か所のみ（`route()` に渡す ren の `bg1`・`bg2`、tsukasa の `bg2`、`t_fragments` の本文行 3 つの `bg`）。本文の文字列・台詞・選択肢・分岐・数値条件・theme は変更していない
- `docs/otome-bg4-report-20261122.md`：本報告書

エンジン・本編・`works/ano-hi-no-koe/tools/` は変更していない。localStorage のキーにも触れていない。素材フォルダのほかの PNG（festival-1/3、campfire-1/2 など）は組み込んでいない。

## 3. 変換

- 方式：前回と同じ。Pillow（libwebp）で `quality=90, method=6`、RGB（元の PNG も RGB・透過なし）。サイズは元のまま 1024×576。変換スクリプトは一時の場所（`/tmp/ahk-bg4/convert.py`）で、リポジトリには入れていない。GPU・外部サービスは使っていない。
- 変換前に 11 枚を縮小して並べ、内容がキーと合うことを目視した（保健室・昼＝白いベッドとカーテン／夕方＝西日、書庫＝棚と梯子／夜＝天井灯だけの暗い書架、病室・昼／夕方＝夕日の窓、文化祭＝夕暮れの校舎前に屋台と提灯、キャンプファイヤー＝夜の校庭の焚き火、闇＝ほぼ黒、屋上・夜＝星空と校庭の小さな焚き火、生徒会室・夕方＝夕焼けの窓とトロフィー棚・長机）。

| 元の PNG | キー | PNG（B） | WebP（B） |
|---|---|---:|---:|
| `infirmary-1.png` | `infirmary` | 529,341 | 44,682 |
| `infirmary-2.png` | `infirmary_evening` | 626,411 | 51,412 |
| `archive-1.png` | `archive` | 768,080 | 66,098 |
| `archive-2.png` | `archive_night` | 704,706 | 54,116 |
| `hospital-1.png` | `hospital` | 613,837 | 49,220 |
| `hospital-2.png` | `hospital_evening` | 628,189 | 59,000 |
| `festival-2.png` | `festival` | 898,295 | 122,352 |
| `campfire-3.png` | `campfire` | 888,922 | 108,778 |
| `dark-1.png` | `dark` | 353,322 | 3,134 |
| `rooftop-night.png` | `rooftop_night` | 713,323 | 53,000 |
| `council-evening.png` | `council_evening` | 809,053 | 87,528 |
| **合計** | | **7,533,479** | **699,320** |

11 枚とも 300 KB 以下（`docs/ASSETS.md` の目安内）。

## 4. 時刻バリエーションを適用したシーン

| シーンID（題名）／場所 | 元のキー | 新しいキー | 根拠 |
|---|---|---|---|
| `ren_1`（生徒会室の窓） | `council` | `council_evening` | 依頼の指定。theme1 `evening`、「暗くなった窓ガラス」 |
| `ren_2`（屋上の夜） | `rooftop` | `rooftop_night` | 依頼の指定（bg3 報告書 §6 の解消）。theme2 `night`、「キャンプファイヤーの火の粉」。素材にも校庭の焚き火が写っている |
| `tsukasa_2`（閉架の鍵） | `archive` | `archive_night` | **ベルの判断**。題名「閉架の鍵」、theme2 `night`。直前の `tsukasa_1` が「閉館後の図書室」（後夜祭の時間帯）で、時刻は夜と読める |
| `t_fragments`「――屋上。」の行 | `rooftop` | `rooftop_night` | 依頼の指定。本文は変えていない |
| `t_fragments`「――中庭。」の行 | `courtyard` | `courtyard_night` | 依頼の指定 |
| `t_fragments`「――夜の交差点。」の行 | `crossing` | `crossing_night` | 依頼の指定 |

- `ren_*`・`tsukasa_2` は `route(scenes, id, {...})` に渡す `bg1`／`bg2` を変えた。各ルートの `_3` と結末は stage の bg を持たずこの背景を引き継ぐ（蓮ルートは夜の屋上、司ルートは夜の書庫を引き継ぎ、本文の流れと合う）。

### 基本キーのままにしたシーン

| シーンID | キー | 理由 |
|---|---|---|
| `c_wake`（保健室） | `infirmary` | theme `day`、「カーテン越しの光」。昼 |
| `t_hospital`（病室） | `hospital` | theme `true`。本文に時刻の手がかりが無い。§6 |
| `c_festival`（星見祭の準備）・`c_branch`（後夜祭の前） | `festival` | 夕方・夜の区別がある素材は `festival` 1 枚（夕方の絵）のみ。§6 |
| `h_1`（キャンプファイヤー） | `campfire` | 夜の絵で theme `night` と合う |
| `p_dark` ほか闇の場面 | `dark` | — |
| `t_fragments`「――閉架書庫。」の行 | `archive` | 依頼で差し替え対象に挙がっていない行のため変えていない。§6 |

## 5. 検証

### 検証コマンド

| コマンド | 結果 |
|---|---|
| `node tools/validate-story.js --work works/ano-hi-no-koe` | OK：誤り 0 件、注意 0 件（シーン 45・結末 14・同時に並ぶ立ち絵 最大 3 人） |
| `node tools/validate-story.js`（本編） | OK：誤り 0 件、注意 0 件 |
| `node tools/test-stage.js` | OK：1,757,181 件の検査に合格（全 20 シーン × 4096 通り） |
| `node tools/verify-text.js` | OK：表示テキスト列・選択肢・シーン属性は基準と完全一致 |
| `node .claude/skills/novel-work/scripts/build-work.js works/ano-hi-no-koe --out /tmp/ahk-build-bg4` | OK：誤り 0・注意 0（52 ファイル）。`assets/images/bg/` に今回の 11 枚が入った（背景は計 27 枚）。無い素材は **`assets/images/bg/title.webp` の 1 件のみ** |

エンジンと本編は変えていないので、既存の Playwright の e2e（`tools/e2e*.js`）は実行していない。

### Playwright での表示確認（一時の手段・リポジトリには置いていない）

- 前回と同じ方式。`/tmp/ahk-bg4-check/check.js` で、`tools/preview-server.js` の `createServer` に「作品フォルダ → リポジトリ直下」の順で重ね、`js/story.js` だけ「作品の story.js の全文＋末尾に `STORY.start` の差し替え」をメモリ上で渡した（作品のファイルは変えていない）。
- 使うシーンの無い `infirmary_evening`・`hospital_evening` と、`tsukasa_2` から外した昼の `archive` は、確認のためだけに一時の story で stage.bg を差し替えて表示した（表の「(一時)」）。
- 実行：`NODE_PATH=/home/hatch/.pw-node/node_modules node /tmp/ahk-bg4-check/check.js`（PC 1366×768／スマホ 390×844）
- 判定：表示中の背景レイヤーの `background-image` が期待のキーの WebP であること、その WebP が 200 で読み込まれたこと、期待の本文行まで進んでいること、期待の立ち絵が 832×1216 で表示されていること、ページのエラーが無いこと、未着の `title.webp` 以外に 404 が無いこと。

| 場面 | シーン（止めた本文） | 背景 | 立ち絵 | PC | スマホ |
|---|---|---|---|---|---|
| 保健室 | `c_wake`（「保健室だと」） | `infirmary` | なし | OK | OK |
| 保健室・夕方（一時） | `c_wake` | `infirmary_evening` | なし | OK | OK |
| 文化祭 | `c_festival`（1 ページ目） | `festival` | なし | OK | OK |
| 後夜祭の前 | `c_branch`（「キャンプファイヤーの準備」） | `festival` | なし | OK | OK |
| キャンプファイヤー | `h_1`（「君らしいね」） | `campfire` | 蓮 smile・空 smile | OK | OK |
| 闇 | `p_dark`（1 ページ目） | `dark` | なし | OK | OK |
| 夕方の生徒会室 | `ren_1`（「ひとりで明日の進行表」） | `council_evening` | 蓮 normal | OK | OK |
| 夜の屋上 | `ren_2`（「ひとつ、聞いてもいいかな」） | `rooftop_night` | 蓮 normal | OK | OK |
| 夜の書庫 | `tsukasa_2`（「交差点にはいなかった」） | `archive_night` | 司 normal | OK | OK |
| 書庫・昼（一時） | `tsukasa_2` | `archive` | 司 normal | OK | OK |
| 断片・屋上 | `t_fragments`（「――屋上。」） | `rooftop_night` | なし | OK | OK |
| 断片・閉架書庫 | `t_fragments`（「――閉架書庫。」） | `archive` | なし | OK | OK |
| 断片・中庭 | `t_fragments`（「――中庭。」） | `courtyard_night` | なし | OK | OK |
| 断片・夜の交差点 | `t_fragments`（「――夜の交差点。」） | `crossing_night` | なし | OK | OK |
| 病室 | `t_hospital`（「包帯だらけ」） | `hospital` | なし | OK | OK |
| 病室・夕方（一時） | `t_hospital` | `hospital_evening` | なし | OK | OK |

- 結果：**32 画面すべて OK**（1 回目の実行で全 OK）。
- スクリーンショット（`/tmp/ahk-bg4-check/shots/`、一時）を目視：PC の夜の屋上（蓮）、スマホのキャンプファイヤー（蓮・空）、PC の断片・夜の交差点。背景は画面全体を覆い、立ち絵は背景の上に正しく重なっている。崩れ・縁のにじみは見当たらない。

## 6. 判断に迷った点

- **`tsukasa_2`（閉架の鍵）を夜にした**：依頼で指定のないベルの判断。theme2 `night` を根拠にした。屋内の書庫なので昼の `archive` でも不自然ではない。戻すなら `bg2` の 1 行。
- **`t_fragments`「――閉架書庫。」の行は `archive`（昼）のまま**：依頼の差し替え対象に入っていないため変えなかった。この記憶は司ルート（`tsukasa_2`・夜）の場面なので、ほかの 3 行と揃えるなら `archive_night` が合う。変えるなら本文行の `bg` 1 か所。
- **`t_hospital`（病室）の時刻**：theme は `true`、本文に時刻の手がかりが無いので `hospital`（昼）のまま。前後の場面（`t_fragments` は闇、`t_plea` は闇）からも決められなかった。夕方の情感を出すなら `hospital_evening` に差し替えるのは stage の 1 か所（表示は §5 の「一時」で確認済み）。
- **保健室の夕方**：保健室を使う stage は `c_wake`（theme `day`）だけなので `infirmary_evening` は使っていない。
- **`festival` が夕方の絵で、`c_branch`（後夜祭の前、theme `night`）にも使われる**：「一日目が終わった」「キャンプファイヤーの準備が始まっている」で夕暮れとも読めるので不自然さは小さいと判断して変えていない。夜の文化祭の素材は無い。

## 7. 未解決

- **使われていないキー**（manifest に登録され素材もあるが、現在の story では表示されない。`validate-story.js` は注意を出していない）：`library`（昼）、`rooftop`（昼。今回 `ren_2` と `t_fragments` を夜にしたため未使用になった）、`rooftop_evening`、`corridor`、`courtyard_evening`、`crossing_evening`、`infirmary_evening`、`hospital_evening`。残すか、どこかに当てるかはマスターの判断を仰ぎたい。
- **タイトル絵**（`title.webp`）だけが未着。
- 観察のみ（今回の変更とは無関係）：スマホ幅ではキャンプファイヤーの場面で名前札が「藤…」に省略され、章題も末尾が省略される。エンジンの既存の表示で、今回は触れていない。
- 上記以外に失敗や保留は無い。
