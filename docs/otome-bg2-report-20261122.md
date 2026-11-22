# 報告書：『あの日の声』背景の組み込み（街路・交差点＋夕方バリエーション）（2026-11-22）

- 依頼者：ベル（ヴェルダンディ／Muse）、承認：マスター
- ブランチ：`bell/otome-bg2-20261122`
- PR：[#22](https://github.com/KurokiriChampr/web-game-pilot/pull/22)（マージはしていない）

## 1. 結果の要約

- 生成済みの背景 PNG 3 枚を WebP（quality 90）に変換し、`works/ano-hi-no-koe/assets/images/bg/` に置いた。`street`・`crossing` は manifest の既存キーがそのまま指すパス、`crossing_evening` は manifest に同じ形式で追加した。
- **`js/story.js` は変更していない（夕方へ差し替えたシーンは 0 件）。** `crossing` を使う stage は 5 シーンあるが、朝 3・夜 1・時刻不明 1 で、夕方と判断できるものが無かった（§4）。とくに空ルートの `sora_2`「夜の帰り道」は、依頼の手がかり「帰り道」を含むが題名も theme も **夜** のため、前回（陽太ルートの夜の中庭を昼のままにした）と同じ基準で昼のままにした。**ここはマスターの判断を仰ぎたい（§6 の 1 点目）**。差し替える場合は 1 行の変更で済む。
- そのため `crossing_evening` は manifest に登録済み・素材ありだが、現時点で使うシーンは無い（前回の `corridor`・`courtyard_evening` と同じ状態）。
- 検証はすべて合格（§5）。公開用まとめの「無い素材」は 11 件 → 9 件（`street`・`crossing` が消えた。`crossing_evening` は最初から揃っている）。

## 2. 変更したファイル

- `works/ano-hi-no-koe/assets/images/bg/`（3 枚を追加）：`street.webp`・`crossing.webp`・`crossing_evening.webp`
- `works/ano-hi-no-koe/assets/manifest.json`：`backgrounds` に `crossing_evening` を追加（`courtyard_evening` の次。既存キーは変更なし）
- `docs/otome-bg2-report-20261122.md`：本報告書

エンジン・本編・`works/ano-hi-no-koe/js/`・`works/ano-hi-no-koe/tools/` は変更していない。localStorage のキーにも触れていない。素材フォルダのほかの PNG（`street-2`・`crossing-1`・`crossing-4`・`courtyard-night`・`library-evening`・`council-*` など）は組み込んでいない。

## 3. 変換

- 方式：前回と同じ。Pillow（libwebp）で `quality=90, method=6`、RGB（元の PNG も RGB・透過なし）。サイズは元のまま 1024×576。変換スクリプトは一時の場所（`/tmp/ahk-bg2/convert.py`）で、リポジトリには入れていない。GPU・外部サービスは使っていない。

| 元の PNG | キー | PNG（B） | WebP（B） |
|---|---|---:|---:|
| `street-1.png` | `street` | 929,877 | 115,870 |
| `crossing-3.png` | `crossing` | 1,005,025 | 150,998 |
| `crossing-2.png` | `crossing_evening` | 1,001,726 | 140,086 |
| **合計** | | **2,936,628** | **406,954** |

3 枚とも 300 KB 以下（`docs/ASSETS.md` の目安内）。

## 4. 夕方へ差し替えたシーン

**なし（0 件）。**

### `crossing` を使うシーンと判断（stage の bg）

| シーンID | 題名 | theme | 判断 | 根拠（本文の手がかり） |
|---|---|---|---|---|
| `p_accident` | 交差点 | `morning` | 昼のまま | 序章の事故の朝（「この朝」「信号が青に変わった」の直後） |
| `t_awake` | 目覚め | `true` | 昼のまま（曖昧） | 時刻を示す語が無い（「信号が青から赤へ…」「花束」）。§6 |
| `t_freeze` | 凍った朝 | `true` | 昼のまま | 「四月の風。鈴の音。青に変わった信号。」＝あの朝の再現 |
| `t_rescue` | あの日の声 | `morning` | 昼のまま | あの朝のやり直し |
| `sora_2` | 夜の帰り道 | `night` | 昼のまま（要判断） | 「帰り道」はあるが、題名・theme ともに夜。前回の基準（夜は夕方ではない）に合わせた。§6 |

- `sora_2` の後の `sora_3`・空ルートの結末 3 つは stage の bg を持たず、`sora_2` の背景を引き継ぐ（バッドエンドは途中で `dark` に変わる）。
- `t_fragments` の本文行「――夜の交差点。ショートボブの耳元に…」の行ごとの `bg: "crossing"` は、前回と同じく stage ではないので依頼の範囲外として変えていない（夜の記憶）。

### `street` を使うシーン（参考・差し替えの対象外）

| シーンID | 題名 | theme |
|---|---|---|
| `p_morning` | 転校の朝 | `morning` |
| `end_true` | ありがとう | `morning`（晴樹の立ち絵つき） |

どちらも朝で、`street`（住宅街の朝）と合っている。

## 5. 検証

### 検証コマンド

| コマンド | 結果 |
|---|---|
| `node tools/validate-story.js --work works/ano-hi-no-koe` | OK：誤り 0 件、注意 0 件（シーン 45・結末 14・同時に並ぶ立ち絵 最大 3 人） |
| `node tools/validate-story.js`（本編） | OK：誤り 0 件、注意 0 件 |
| `node tools/test-stage.js` | OK：1,757,181 件の検査に合格（全 20 シーン × 4096 通り） |
| `node tools/verify-text.js` | OK：表示テキスト列・選択肢・シーン属性は基準と完全一致 |
| `node .claude/skills/novel-work/scripts/build-work.js works/ano-hi-no-koe --out /tmp/ahk-build-bg2` | OK：誤り 0・注意 0（35 ファイル）。`assets/images/bg/` に今回の 3 枚が入った（背景は計 10 枚）。無い素材は 11 件 → **9 件**（archive・campfire・council・dark・festival・hospital・infirmary・rooftop・title）で、`street`・`crossing`・`crossing_evening` は一覧に無い |

エンジンと本編は変えていないので、既存の Playwright の e2e（`tools/e2e*.js`）は実行していない。

### Playwright での表示確認（一時の手段・リポジトリには置いていない）

- 前回と同じ方式。`/tmp/ahk-bg2-check/check.js` で、`tools/preview-server.js` の `createServer` に「作品フォルダ → リポジトリ直下」の順で重ね、`js/story.js` だけ「作品の story.js の全文＋末尾に `STORY.start` の差し替え」をメモリ上で渡した（作品のファイルは変えていない）。
- 夕方へ差し替えたシーンが無いため、`crossing_evening` は確認のためだけに一時の story で `sora_2` の stage.bg を差し替えて表示した（表の「(一時)」）。
- 実行：`NODE_PATH=/home/hatch/.pw-node/node_modules node /tmp/ahk-bg2-check/check.js`（PC 1366×768／スマホ 390×844）
- 判定：表示中の背景レイヤーの `background-image` が期待のキーの WebP であること、その WebP が 200 で読み込まれたこと、期待の立ち絵が 832×1216 で表示されていること（立ち絵の無い場面は立ち絵が 0 であること）、ページのエラーが無いこと、未着の `title.webp` 以外に 404 が無いこと。

| 場面 | シーン | 背景 | 立ち絵 | PC | スマホ |
|---|---|---|---|---|---|
| 朝・住宅街 | `p_morning` | `street` | なし | OK | OK |
| 朝・住宅街 | `end_true` | `street` | 晴樹 smile | OK | OK |
| 朝・交差点 | `p_accident` | `crossing` | なし | OK | OK |
| 交差点（夜の帰り道） | `sora_2`（2 ページ目） | `crossing` | 空 sad | OK | OK |
| 夕方・交差点（一時） | `sora_2`（2 ページ目） | `crossing_evening` | 空 sad | OK | OK |

- 結果：**10 画面すべて OK**（1 回目の実行で全 OK）。
- スクリーンショット（`/tmp/ahk-bg2-check/shots/`、一時）を目視：PC の夕方・交差点（一時、西日の交差点に空）、スマホの朝・住宅街（晴樹）。背景は画面全体を覆い、立ち絵は背景の上に正しく重なっている。崩れ・縁のにじみは見当たらない。

## 6. 判断に迷った点

- **`sora_2`「夜の帰り道」を夕方にするか**：依頼の手がかりに「帰り道」が挙がっているが、題名・theme（`night`）とも夜で、前シーン `sora_1` が後夜祭中の放課後（夕方）、結末のバッドも「夜の交差点」。前回は陽太ルートの夜の中庭を「夕方ではない」として昼のままにしたので、同じ基準で昼のまま（`crossing`）にした。ただ、夜の場面に青空の交差点が出るのは不自然で、昼より `crossing_evening`（西日）のほうが近いのは確か。暫定で `crossing_evening` を当てるなら `js/story.js` の空ルートの `bg2: "crossing"` を `bg2: "crossing_evening"` にする 1 行で済む（表示は §5 の「一時」で確認済み）。素材フォルダに `courtyard-night.png` があるので、夜用の交差点（`crossing_night`）を作る予定があるならそれを待つ手もある。
- **`t_awake`（目覚め）の時刻**：本文に時刻の手がかりが無い（theme も `true`）。依頼どおり昼のままにした。事故から日が経った「ある日」の交差点で、昼で不自然ではないと考える。
- **2 枚の交差点の見た目の違い**：`crossing`（crossing-3）は街路樹と戸建ての並ぶ道を正面から見る構図、`crossing_evening`（crossing-2）は歩道の角から斜めに見る構図で、信号・柵・建物も異なり、「同じ交差点の時刻違い」には見えにくい。また `crossing_evening` は右端の歩道に紺の学生鞄が置かれている（事故の暗示とも読めるが、意図したものかは分からない）。
- **`end_true` の「星見学園への坂をのぼった」**：`street`（住宅街の朝）は平坦な道に見える。本文は変えない指示なので、そのままにした。

## 7. 未解決

- **使われていないキー**：`crossing_evening`（今回）、前回からの `corridor`・`courtyard_evening` は、manifest に登録されて素材もあるが、現在の story では表示されない。`validate-story.js` は注意を出していない。§6 の 1 点目と、前回の陽太ルートの夜の中庭の件と合わせて決めてほしい。
- **残りの背景 8 枚とタイトル絵**（archive・campfire・council・dark・festival・hospital・infirmary・rooftop、title）は未着のまま（素材フォルダには `council-*` などが届き始めているが、今回の依頼の範囲外なので組み込んでいない）。
- 上記以外に失敗や保留は無い。
