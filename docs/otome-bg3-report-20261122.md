# 報告書：『あの日の声』背景の組み込み（生徒会室・屋上・夜の中庭・夕方の図書室・夜の交差点）（2026-11-22）

- 依頼者：ベル（ヴェルダンディ／Muse）、承認：マスター
- ブランチ：`bell/otome-bg3-20261122`
- PR：[#23](https://github.com/KurokiriChampr/web-game-pilot/pull/23)（マージはしていない）

## 1. 結果の要約

- 生成済みの背景 PNG 6 枚を WebP（quality 90）に変換し、`works/ano-hi-no-koe/assets/images/bg/` に置いた。`council`・`rooftop` は manifest の既存キーが指すパス、`rooftop_evening`・`courtyard_night`・`library_evening`・`crossing_night` は manifest に同じ形式で追加した。
- 時刻バリエーションを **5 シーン** に適用した（§4）：`yota_1`・`yota_2` → `courtyard_night`、`c_library`・`tsukasa_1` → `library_evening`、`sora_2` → `crossing_night`。bg1・bg2 報告書 §6 の保留（陽太ルートの夜の中庭、空ルートの夜の帰り道、夕方の図書室）はこれで解消。
- `rooftop_evening` は、屋上を使う stage が蓮ルートの `ren_2`「屋上の夜」（theme `night`）だけで夕方と判断できるシーンが無いため、**登録のみ**（§6）。
- 検証はすべて合格（§5）。公開用まとめの「無い素材」は 9 件 → **7 件**（`council`・`rooftop` が消えた。追加 4 キーは最初から揃っている）。

## 2. 変更したファイル

- `works/ano-hi-no-koe/assets/images/bg/`（6 枚を追加）：`council.webp`・`rooftop.webp`・`rooftop_evening.webp`・`courtyard_night.webp`・`library_evening.webp`・`crossing_night.webp`
- `works/ano-hi-no-koe/assets/manifest.json`：`backgrounds` の `crossing_evening` の次に `rooftop_evening`・`courtyard_night`・`library_evening`・`crossing_night` を追加（既存キーは変更なし）
- `works/ano-hi-no-koe/js/story.js`：stage の bg 指定 5 か所のみ（`c_library` の `stage.bg`、`route()` に渡す tsukasa の `bg1`、yota の `bg1`・`bg2`、sora の `bg2`）。本文・台詞・選択肢・分岐・数値条件・theme は変更していない
- `docs/otome-bg3-report-20261122.md`：本報告書

エンジン・本編・`works/ano-hi-no-koe/tools/` は変更していない。localStorage のキーにも触れていない。素材フォルダのほかの PNG は組み込んでいない。

## 3. 変換

- 方式：前回と同じ。Pillow（libwebp）で `quality=90, method=6`、RGB（元の PNG も RGB・透過なし）。サイズは元のまま 1024×576。変換スクリプトは一時の場所（`/tmp/ahk-bg3/convert.py`）で、リポジトリには入れていない。GPU・外部サービスは使っていない。
- 変換前に 6 枚を縮小して並べ、内容がキーと合うことを目視した（生徒会室＝トロフィー棚と長机、屋上・昼＝青空とフェンス、屋上・夕方＝夕焼け、中庭・夜＝大樹・噴水・ベンチ・街灯・電飾、図書室・夕方＝西日の閲覧席、交差点・夜＝街灯と横断歩道）。

| 元の PNG | キー | PNG（B） | WebP（B） |
|---|---|---:|---:|
| `council-3.png` | `council` | 783,541 | 74,382 |
| `rooftop-1.png` | `rooftop` | 920,225 | 138,216 |
| `rooftop-2.png` | `rooftop_evening` | 816,346 | 93,948 |
| `courtyard-night.png` | `courtyard_night` | 852,693 | 101,802 |
| `library-evening.png` | `library_evening` | 679,194 | 57,108 |
| `crossing-night.png` | `crossing_night` | 813,793 | 75,120 |
| **合計** | | **4,865,792** | **540,576** |

6 枚とも 300 KB 以下（`docs/ASSETS.md` の目安内）。

## 4. 時刻バリエーションを適用したシーン

| シーンID（題名） | 元のキー | 新しいキー | 根拠 |
|---|---|---|---|
| `yota_1`（中庭のベンチ） | `courtyard` | `courtyard_night` | 依頼の指定（bg1 報告書 §6 の解消）。theme1 `night`、後夜祭・「街灯」 |
| `yota_2`（噴水の前） | `courtyard` | `courtyard_night` | 依頼の指定。theme2 `night`。素材に噴水とベンチがあり本文と合う |
| `c_library`（図書室） | `library` | `library_evening` | 依頼の指定（夕方確定）。「西日の差す閲覧席」「閉館は五時」・theme `evening` |
| `tsukasa_1`（閉館後の図書室） | `library` | `library_evening` | ベルの判断。theme1 `evening`、「後夜祭の喧騒」「閉館後」。同じ後夜祭の時間帯の `sora_1`（theme `evening`）を前回 `classroom_evening` にした基準と揃えた。§6 |
| `sora_2`（夜の帰り道） | `crossing` | `crossing_night` | 依頼の指定（bg2 報告書 §6 の解消）。題名・theme2 とも夜 |

- `yota_*`・`sora_2`・`tsukasa_1` は `route(scenes, id, {...})` に渡す `bg1`／`bg2` を変えた。各ルートの `_3` と結末は stage の bg を持たず、この背景を引き継ぐ（陽太・空ルートは夜の背景を引き継ぐことになり、本文と合う）。

### 適用しなかった屋上・図書室・生徒会室のシーン

| シーンID | キー | 理由 |
|---|---|---|
| `ren_2`（屋上の夜） | `rooftop` | theme2 `night`、「キャンプファイヤーの火の粉」。夜で夕方ではない。§6 |
| `c_council`（生徒会室） | `council` | theme `day`（本文に「放課後の生徒会室」の分岐はある。§6） |
| `ren_1`（生徒会室の窓） | `council` | theme1 `evening`、「暗くなった窓ガラス」。生徒会室の夕方素材が無いので `council` のまま。§6 |
| `t_fragments` の本文行（屋上・中庭・夜の交差点） | `rooftop`・`courtyard`・`crossing` | stage ではなく行ごとの bg 指定で、依頼の範囲（stage の bg）外。前回までと同じく変えていない。§6 |

## 5. 検証

### 検証コマンド

| コマンド | 結果 |
|---|---|
| `node tools/validate-story.js --work works/ano-hi-no-koe` | OK：誤り 0 件、注意 0 件（シーン 45・結末 14・同時に並ぶ立ち絵 最大 3 人） |
| `node tools/validate-story.js`（本編） | OK：誤り 0 件、注意 0 件 |
| `node tools/test-stage.js` | OK：1,757,181 件の検査に合格（全 20 シーン × 4096 通り） |
| `node tools/verify-text.js` | OK：表示テキスト列・選択肢・シーン属性は基準と完全一致 |
| `node .claude/skills/novel-work/scripts/build-work.js works/ano-hi-no-koe --out /tmp/ahk-build-bg3` | OK：誤り 0・注意 0（41 ファイル）。`assets/images/bg/` に今回の 6 枚が入った（背景は計 16 枚）。無い素材は 9 件 → **7 件**（archive・campfire・dark・festival・hospital・infirmary・title）で、今回の 6 キーは一覧に無い |

エンジンと本編は変えていないので、既存の Playwright の e2e（`tools/e2e*.js`）は実行していない。

### Playwright での表示確認（一時の手段・リポジトリには置いていない）

- 前回と同じ方式。`/tmp/ahk-bg3-check/check.js` で、`tools/preview-server.js` の `createServer` に「作品フォルダ → リポジトリ直下」の順で重ね、`js/story.js` だけ「作品の story.js の全文＋末尾に `STORY.start` の差し替え」をメモリ上で渡した（作品のファイルは変えていない）。
- `rooftop_evening` は使うシーンが無いため、確認のためだけに一時の story で `ren_2` の stage.bg を差し替えて表示した（表の「(一時)」）。
- 実行：`NODE_PATH=/home/hatch/.pw-node/node_modules node /tmp/ahk-bg3-check/check.js`（PC 1366×768／スマホ 390×844）
- 判定：表示中の背景レイヤーの `background-image` が期待のキーの WebP であること、その WebP が 200 で読み込まれたこと、期待の立ち絵が 832×1216 で表示されていること、ページのエラーが無いこと、未着の `title.webp` 以外に 404 が無いこと。

| 場面 | シーン | 背景 | 立ち絵 | PC | スマホ |
|---|---|---|---|---|---|
| 夕方・図書室 | `c_library`（3 ページ目） | `library_evening` | 司 normal | OK | OK |
| 夕方・図書室（閉館後） | `tsukasa_1`（2 ページ目） | `library_evening` | 司 normal | OK | OK |
| 夜・中庭 | `yota_1`（2 ページ目） | `courtyard_night` | 陽太 smile | OK | OK |
| 夜・中庭（噴水） | `yota_2`（1 ページ目） | `courtyard_night` | 陽太 sad | OK | OK |
| 夜・交差点 | `sora_2`（2 ページ目） | `crossing_night` | 空 sad | OK | OK |
| 生徒会室 | `c_council`（2 ページ目） | `council` | 蓮 smile | OK | OK |
| 生徒会室（夕方の場面） | `ren_1`（2 ページ目） | `council` | 蓮 normal | OK | OK |
| 屋上（夜の場面） | `ren_2`（2 ページ目） | `rooftop` | 蓮 normal | OK | OK |
| 夕方・屋上（一時） | `ren_2`（2 ページ目） | `rooftop_evening` | 蓮 normal | OK | OK |

- 結果：**18 画面すべて OK**（1 回目の実行で全 OK）。
- スクリーンショット（`/tmp/ahk-bg3-check/shots/`、一時）を目視：PC の夜の中庭（噴水の前に陽太）、夜の交差点（空）、夕方の図書室（司）、スマホの生徒会室（蓮）。背景は画面全体を覆い、立ち絵は背景の上に正しく重なっている。崩れ・縁のにじみは見当たらない。

## 6. 判断に迷った点

- **`tsukasa_1`（閉館後の図書室）を夕方にした**：theme1 は `evening` で、後夜祭の時間帯。同じ時間帯の `sora_1` を前回 `classroom_evening` にしたのと揃えた。ただ「閉館後」（閉館は五時）・「ガラス戸に映る私の髪」はやや暗い時刻を思わせ、直後の `tsukasa_2`（閉架の鍵）は `night`。夜寄りと見るなら `library` に戻すのは `bg1` の 1 行。
- **`ren_2`（屋上の夜）は昼の `rooftop` のまま**：夜（キャンプファイヤーの火の粉、theme `night`）なので依頼どおり夕方にしなかった。ただ青空の屋上が夜の場面に出るのは、前回までの中庭・交差点と同じく不自然。`rooftop_evening`（夕焼け）のほうが近いので暫定で当てるか、夜の屋上（`rooftop_night`）を作るかはマスターの判断を仰ぎたい（`rooftop_evening` での表示は §5 の「一時」で確認済み）。
- **生徒会室の時刻**：`council`（council-3）は窓の外が明るい昼の絵。`ren_1`（theme `evening`、「暗くなった窓ガラス」）と、`c_council` の分岐の一方（「放課後の生徒会室を訪ねた」、theme は `day`）には夕方の絵のほうが合う。夕方の生徒会室の素材は今回の範囲に無いので `council` のまま。
- **`t_fragments` の行ごとの bg**：「――中庭。」（陽太ルートの夜の記憶）、「――夜の交差点。」（空ルート）、「――屋上。」（蓮ルート）は、今回の夜用素材があれば `courtyard_night`・`crossing_night` のほうが本文と合う。ただし stage ではなく本文行の指定なので、依頼の範囲外として変えていない。
- **昼の `library` が使われなくなった**：図書室の stage は `c_library` と `tsukasa_1` の 2 つで、両方とも夕方にしたため。

## 7. 未解決

- **使われていないキー**：今回の `library`（昼）・`rooftop_evening`、前回からの `corridor`・`courtyard_evening`・`crossing_evening` は、manifest に登録されて素材もあるが、現在の story では表示されない。`validate-story.js` は注意を出していない。§6 の屋上・`t_fragments` の件と合わせて決めてほしい。
- **残りの背景 6 枚とタイトル絵**（archive・campfire・dark・festival・hospital・infirmary、title）は未着のまま。
- 上記以外に失敗や保留は無い。
