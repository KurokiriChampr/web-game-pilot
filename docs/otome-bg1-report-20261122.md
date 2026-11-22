# 報告書：『あの日の声』背景の組み込み（学校4か所＋夕方バリエーション）（2026-11-22）

- 依頼者：ベル（ヴェルダンディ／Muse）、承認：マスター
- ブランチ：`bell/otome-bg1-20261122`
- PR：[#21](https://github.com/KurokiriChampr/web-game-pilot/pull/21)（マージはしていない）

## 1. 結果の要約

- 生成済みの背景 PNG 7 枚を WebP（quality 90）に変換し、`works/ano-hi-no-koe/assets/images/bg/` に置いた。昼 4 枚は manifest の既存キー（`classroom`・`library`・`corridor`・`courtyard`）がそのまま指すパス、夕方 3 枚は manifest に新しいキー（`classroom_evening`・`corridor_evening`・`courtyard_evening`）を同じ形式で追加した。
- `js/story.js` の stage の bg 指定を **2 か所** だけ夕方キーに差し替えた（§4）。本文・台詞・選択肢・分岐・数値条件は変えていない。
- 検証はすべて合格（§5）。公開用まとめの「無い素材」は 15 件 → 11 件（昼 4 キーが消えた。夕方 3 キーは最初から揃っている）。
- 注意：差し替えの結果、**昼の `corridor` と 夕方の `courtyard_evening` を使うシーンは現時点で 1 つも無い**（素材と manifest の登録はある）。詳しくは §6。

## 2. 変更したファイル

- `works/ano-hi-no-koe/assets/images/bg/`（7 枚を追加）：`classroom.webp`・`library.webp`・`corridor.webp`・`courtyard.webp`・`classroom_evening.webp`・`corridor_evening.webp`・`courtyard_evening.webp`
- `works/ano-hi-no-koe/assets/manifest.json`：`backgrounds` に夕方 3 キーを追加（既存キーは変更なし）
- `works/ano-hi-no-koe/js/story.js`：stage の bg 2 か所（§4）
- `docs/otome-bg1-report-20261122.md`：本報告書

エンジン・本編・`works/ano-hi-no-koe/tools/` は変更していない。localStorage のキーにも触れていない。`library-2.png` は組み込んでいない（予備のまま）。

## 3. 変換

- 方式：Pillow（libwebp）で `quality=90, method=6`、RGB（元の PNG も RGB・透過なし）。サイズは元のまま 1024×576（本編の背景 `village_plaza.webp` などと同じ大きさ）。`cwebp` は VM に無いため Pillow を使った。変換スクリプトは一時の場所（`/tmp/ahk-bg1/convert.py`）で、リポジトリには入れていない。GPU・外部サービスは使っていない。
- 「本編の背景と同じ条件」の変換設定は文書に残っていなかったため、依頼文の quality 90 に従った（§6）。

| 元の PNG | キー | PNG（B） | WebP（B） |
|---|---|---:|---:|
| `classroom-1.png` | `classroom` | 794,669 | 90,226 |
| `library-1.png` | `library` | 842,755 | 97,624 |
| `corridor-1.png` | `corridor` | 707,980 | 57,730 |
| `courtyard-1.png` | `courtyard` | 1,033,783 | 176,532 |
| `classroom-2.png` | `classroom_evening` | 791,406 | 91,264 |
| `corridor-2.png` | `corridor_evening` | 737,262 | 72,992 |
| `courtyard-2.png` | `courtyard_evening` | 844,270 | 114,850 |
| **合計** | | **5,752,125** | **701,218** |

7 枚とも 300 KB 以下（`docs/ASSETS.md` の目安内）。

## 4. 夕方へ差し替えたシーン

| シーンID | 元のキー | 新しいキー | 判断の根拠（本文の手がかり） |
|---|---|---|---|
| `c_search`（探しもの） | `corridor` | `corridor_evening` | 「今日の放課後は、どこを探そう。」・シーンの theme が `evening` |
| `sora_1`（放課後の教室） | `classroom` | `classroom_evening` | 題名「放課後の教室」、「二年B組の教室に、空くんはひとりで残っていた」「後夜祭サボって」・theme1 が `evening`。次の `sora_2` が「夜の帰り道」なので、その手前の夕方とみなした |

- `sora_1` は `route(scenes, "sora", {...})` の `bg1` を変えた（このルートの stage の bg 指定はここで決まる）。

### 昼のままにしたシーン（classroom／corridor／courtyard を使うもの）

| シーンID | キー | 理由 |
|---|---|---|
| `c_class`（二年B組） | `classroom` | 転校の挨拶の直後（朝〜日中）。theme `day` |
| `c_courtyard`（中庭） | `courtyard` | 「翌日の昼休み」。theme `day` |
| `yota_1`（中庭のベンチ） | `courtyard` | 後夜祭の最中で「街灯」が出る **夜** の場面（theme `night`）。夕方ではないので差し替えず、§6 に記載 |
| `yota_2`（噴水の前） | `courtyard` | 同上（theme `night`） |
| `t_fragments` の 1 行（「――中庭。『ずっとそばにいる』と約束した…」） | `courtyard` | stage ではなく本文の行ごとの bg 指定。依頼の範囲（stage の bg）外であり、場面も陽太ルートの夜の記憶なので変えていない |

stage の bg を持たない結末（`end_*_yota` など）は直前の背景を引き継ぐ。差し替えによる引き継ぎ先の変化は、`sora_1` の後が `sora_2`（`crossing`）で上書きされるため無い。

## 5. 検証

### 検証コマンド

| コマンド | 結果 |
|---|---|
| `node tools/validate-story.js --work works/ano-hi-no-koe` | OK：誤り 0 件、注意 0 件（シーン 45・結末 14・同時に並ぶ立ち絵 最大 3 人） |
| `node tools/validate-story.js`（本編） | OK：誤り 0 件、注意 0 件 |
| `node tools/test-stage.js` | OK：1,757,181 件の検査に合格（全 20 シーン × 4096 通り） |
| `node tools/verify-text.js` | OK：表示テキスト列・選択肢・シーン属性は基準と完全一致 |
| `node .claude/skills/novel-work/scripts/build-work.js works/ano-hi-no-koe --out /tmp/ahk-build-bg1` | OK：誤り 0・注意 0（32 ファイル）。`assets/images/bg/` に背景 7 枚が入った。無い素材は 15 件 → **11 件**（archive・campfire・council・crossing・dark・festival・hospital・infirmary・rooftop・street・title）で、今回の 7 件は一覧に無い |

エンジンと本編は変えていないので、既存の Playwright の e2e（`tools/e2e*.js`）は実行していない。

### Playwright での表示確認（一時の手段・リポジトリには置いていない）

- 前回までと同じ方式。`/tmp/ahk-bg1-check/check.js` で、`tools/preview-server.js` の `createServer` に「作品フォルダ → リポジトリ直下」の順で重ね、`js/story.js` だけ「作品の story.js の全文＋末尾に `STORY.start` の差し替え」をメモリ上で渡した（作品のファイルは変えていない）。
- 使われるシーンが無い 2 キー（`corridor`・`courtyard_evening`）は、確認のためだけに一時の story で `c_search`／`yota_1` の stage.bg を差し替えて表示した（表の「(一時)」）。
- 実行：`NODE_PATH=/home/hatch/.pw-node/node_modules node /tmp/ahk-bg1-check/check.js`（PC 1366×768／スマホ 390×844）
- 判定：表示中の背景レイヤーの `background-image` が期待のキーの WebP であること、その WebP が 200 で読み込まれたこと、期待の立ち絵が 832×1216 で表示されていること、ページのエラーが無いこと、未着の `title.webp` 以外に 404 が無いこと。

| 場面 | シーン | 背景 | 立ち絵 | PC | スマホ |
|---|---|---|---|---|---|
| 昼・教室 | `c_class` | `classroom` | 空 smile | OK | OK |
| 昼・図書室 | `c_library` | `library` | 司 normal | OK | OK |
| 昼・中庭 | `c_courtyard` | `courtyard` | 陽太 smile | OK | OK |
| 昼・廊下（一時） | `c_search` | `corridor` | なし | OK | OK |
| 夕方・廊下 | `c_search` | `corridor_evening` | なし（このシーンは立ち絵を出さない） | OK | OK |
| 夕方・教室 | `sora_1` | `classroom_evening` | 空 smile | OK | OK |
| 夕方・中庭（一時） | `yota_1` | `courtyard_evening` | 陽太 smile | OK | OK |

- 結果：**14 画面すべて OK**。
- 1 回目の実行では 14 画面とも「NG」と出たが、原因はタイトル画面の `title.webp`（未着の素材）の 404 を失敗に数えていたためで、背景・立ち絵の判定はすべて合っていた。未着の `title.webp` だけ除外して再実行し、全 OK。
- スクリーンショット（`/tmp/ahk-bg1-check/shots/`、一時）を目視：PC の夕方・教室（西日の教室に空）、PC の夕方・廊下、PC の夕方・中庭（一時）、スマホの昼・中庭。背景は画面全体を覆い、立ち絵は背景の上に正しく重なっている。崩れ・縁のにじみは見当たらない。

## 6. 判断に迷った点

- **`c_search` の時刻**：本文は「今日の放課後は、どこを探そう。」で、放課後に入る直前とも読める。ただ theme が `evening` で、依頼の手がかり例に「放課後」があるため夕方と判断して差し替えた。昼のほうがよければ 1 行戻すだけでよい。
- **陽太ルートの夜の中庭（`yota_1`・`yota_2`）**：夜の場面（街灯・後夜祭）なので「夕方」ではなく、依頼どおり昼のまま（`courtyard`）にした。ただし昼の青空の中庭が夜の場面に出るのは不自然なので、夜用の中庭（`courtyard_night` など）を用意するか、暫定で `courtyard_evening` を当てるかはマスターの判断を仰ぎたい。
- **`c_library`（図書室）は夕方**（「西日の差す閲覧席」「閉館は五時」、theme `evening`）だが、`library_evening` を作らない指示なので `library` のまま。`library-2.png` を `library_evening` として使う選択肢はある。
- **`courtyard_evening` の構図**：夕方の中庭は校舎の正面と植え込みを見る構図で、昼の `courtyard`（大きな木）と見た目の場所の印象が違う。陽太ルートの本文にある「噴水」「ベンチ」は、確認した範囲では見当たらなかった。
- **WebP の変換条件**：本編の背景の変換条件はリポジトリの文書に残っていなかったため、依頼文の quality 90（`method=6`）で変換した。本編の既存背景も 1024×576・RGB で、大きさは揃っている。

## 7. 未解決

- **使われていない 2 キー**：昼の `corridor`（唯一の廊下シーン `c_search` を夕方にしたため）と `courtyard_evening`（夕方の中庭シーンが無いため）は、manifest に登録されて素材もあるが、現在の story では表示されない。`validate-story.js` は注意を出していない。陽太ルートの夜の中庭に `courtyard_evening` を当てるかどうか（§6）と合わせて決めてほしい。
- **残りの背景 10 枚とタイトル絵**（archive・campfire・council・crossing・dark・festival・hospital・infirmary・rooftop・street、title）は未着のまま。
- 上記以外に失敗や保留は無い。
