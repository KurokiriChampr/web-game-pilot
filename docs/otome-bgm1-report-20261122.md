# 報告書：『あの日の声』BGM の組み込み（2026-11-22）

- 依頼者：ベル（ヴェルダンディ／Muse）、承認：マスター
- ブランチ：`bell/otome-bgm1-20261122`
- PR：（作成後に追記）

## 1. 結果の要約

- ループ加工済み FLAC 8 曲を ffmpeg で MP3（192 kbps・48 kHz・ステレオ）に変換し、`works/ano-hi-no-koe/assets/bgm/` に置いた。
- manifest の `title.bgm` と、**全 45 シーンの `scenes.<id>.bgm`** を明示的に設定した（defaults 任せのシーンは無い。`defaults.bgm` は `null` のまま）。
- ついで修正：`t_fragments` の「――閉架書庫。」の行の bg を `archive` → `archive_night` に変更（bg4 報告書 §6 の解消）。本文の文字列は変えていない。
- 検証はすべて合格（§5）。ただし依頼の例外に挙がった **`t_dawn`・`t_rewind` は本作に存在しない**ため、読み替えた（§6、要確認）。

## 2. 変更したファイル

- `works/ano-hi-no-koe/assets/bgm/`（8 ファイルを追加）：`title.mp3`・`day.mp3`・`evening.mp3`・`night.mp3`・`sad.mp3`・`dark.mp3`・`true.mp3`・`happy.mp3`
- `works/ano-hi-no-koe/assets/manifest.json`：`title` に `"bgm": "bgm/title.mp3"` を追加、空だった `scenes` に 45 シーン分の `{ "bgm": ... }` を追加（`backgrounds`・`characters`・`defaults` は変更なし）
- `works/ano-hi-no-koe/js/story.js`：`t_fragments` の本文行 1 か所の `bg` のみ
- `docs/otome-bgm1-report-20261122.md`：本報告書

エンジン・本編は変更していない。localStorage のキーにも触れていない。シーンのエントリは `bgm` だけを持ち、`image` は書いていない（省略時は `defaults.image`＝`null` で、従来どおり背景は story の `stage.bg` で決まる。§5 の確認で背景表示も従来どおり）。

## 3. 変換

- コマンド（1 曲あたり）：`ffmpeg -i <src>.flac -vn -map_metadata -1 -c:a libmp3lame -b:a 192k -ar 48000 <dst>.mp3`
- 素材フォルダの `happy.flac`（旧版）は使っていない（依頼どおり `happy2a.flac` を採用）。

| 元の FLAC | 出力 | 長さ（秒） | MP3（B） |
|---|---|---:|---:|
| `title2.flac` | `bgm/title.mp3` | 87.92 | 2,111,661 |
| `day.flac` | `bgm/day.mp3` | 80.37 | 1,930,221 |
| `evening.flac` | `bgm/evening.mp3` | 85.08 | 2,043,117 |
| `night.flac` | `bgm/night.mp3` | 85.21 | 2,046,573 |
| `sad.flac` | `bgm/sad.mp3` | 83.48 | 2,005,101 |
| `dark.flac` | `bgm/dark.mp3` | 84.96 | 2,040,237 |
| `true.flac` | `bgm/true.mp3` | 84.52 | 2,029,869 |
| `happy2a.flac` | `bgm/happy.mp3` | 88.95 | 2,136,429 |
| **合計** | | | **16,343,208** |

各曲 2 MB 前後（`docs/ASSETS.md` の目安 1〜3 MB の範囲内）。長さは元の FLAC と一致。

## 4. BGM 割り当て表（全 45 シーン＋タイトル）

タイトル画面：`bgm/title.mp3`

| シーンID | 題名 | theme | BGM | 根拠 |
|---|---|---|---|---|
| `p_morning` | 転校の朝 | `morning` | `bgm/day.mp3` | theme |
| `p_accident` | 交差点 | `morning` | `bgm/day.mp3` | theme |
| `p_dark` | 闇 | `dark` | `bgm/dark.mp3` | theme |
| `c_wake` | 保健室 | `day` | `bgm/day.mp3` | theme |
| `c_class` | 二年B組 | `day` | `bgm/day.mp3` | theme |
| `c_council` | 生徒会室 | `day` | `bgm/day.mp3` | theme |
| `c_library` | 図書室 | `evening` | `bgm/evening.mp3` | theme |
| `c_courtyard` | 中庭 | `day` | `bgm/day.mp3` | theme |
| `c_search` | 探しもの | `evening` | `bgm/evening.mp3` | theme |
| `c_festival` | 星見祭の準備 | `evening` | `bgm/evening.mp3` | theme |
| `c_branch` | 後夜祭の前 | `night` | `bgm/night.mp3` | theme |
| `h_1` | キャンプファイヤー | `night` | `bgm/night.mp3` | theme |
| `h_2` | 四つの手 | `night` | `bgm/night.mp3` | theme |
| `end_harem` | 星見祭の夜 | `night` | `bgm/night.mp3` | theme |
| `t_awake` | 目覚め | `true` | `bgm/true.mp3` | theme |
| `t_fragments` | 四つの断片 | `true` | `bgm/dark.mp3` | 例外 |
| `t_hospital` | 病室 | `true` | `bgm/sad.mp3` | 例外 |
| `t_plea` | あなたへ | `dark` | `bgm/true.mp3` | 例外 |
| `t_freeze` | 凍った朝 | `true` | `bgm/true.mp3` | 例外 |
| `t_rescue` | あの日の声 | `morning` | `bgm/happy.mp3` | 例外 |
| `end_true` | ありがとう | `morning` | `bgm/happy.mp3` | 例外 |
| `ren_1` | 生徒会室の窓 | `evening` | `bgm/evening.mp3` | theme |
| `ren_2` | 屋上の夜 | `night` | `bgm/night.mp3` | theme |
| `ren_3` | 火の粉 | `night` | `bgm/night.mp3` | theme |
| `end_normal_ren` | 生徒会の仲間 | `evening` | `bgm/evening.mp3` | theme |
| `end_bad_ren` | 言わせた言葉 | `night` | `bgm/sad.mp3` | バッドエンド |
| `end_good_ren` | 王子様の素顔 | `evening` | `bgm/evening.mp3` | theme |
| `tsukasa_1` | 閉館後の図書室 | `evening` | `bgm/evening.mp3` | theme |
| `tsukasa_2` | 閉架の鍵 | `night` | `bgm/night.mp3` | theme |
| `tsukasa_3` | 古い紙のにおい | `night` | `bgm/night.mp3` | theme |
| `end_normal_tsukasa` | 閲覧席 | `evening` | `bgm/evening.mp3` | theme |
| `end_bad_tsukasa` | 閉架の奥 | `night` | `bgm/sad.mp3` | バッドエンド |
| `end_good_tsukasa` | 返却期限 | `evening` | `bgm/evening.mp3` | theme |
| `yota_1` | 中庭のベンチ | `night` | `bgm/night.mp3` | theme |
| `yota_2` | 噴水の前 | `night` | `bgm/night.mp3` | theme |
| `yota_3` | りんご飴の棒 | `night` | `bgm/night.mp3` | theme |
| `end_normal_yota` | かわいい後輩 | `evening` | `bgm/evening.mp3` | theme |
| `end_bad_yota` | 指切り | `night` | `bgm/sad.mp3` | バッドエンド |
| `end_good_yota` | 明日の約束 | `evening` | `bgm/evening.mp3` | theme |
| `sora_1` | 放課後の教室 | `evening` | `bgm/evening.mp3` | theme |
| `sora_2` | 夜の帰り道 | `night` | `bgm/night.mp3` | theme |
| `sora_3` | 赤信号 | `night` | `bgm/night.mp3` | theme |
| `end_normal_sora` | 署名用紙 | `evening` | `bgm/evening.mp3` | theme |
| `end_bad_sora` | 夜の交差点 | `night` | `bgm/sad.mp3` | バッドエンド |
| `end_good_sora` | 青信号 | `evening` | `bgm/evening.mp3` | theme |

内訳（45 シーン）：day 6、evening 14、night 13、dark 2、sad 5、true 3、happy 2。
※ 根拠「theme」は theme 対応ルール、「例外」は依頼の例外指定（`t_rescue`・`t_freeze` は §6 の読み替え）、「バッドエンド」は `end_bad_*`。theme が `true` で例外に当たらず true になったのは `t_awake` のみ。

## 5. 検証

### 検証コマンド

| コマンド | 結果 |
|---|---|
| `node tools/validate-story.js --work works/ano-hi-no-koe` | OK：誤り 0 件、注意 0 件（シーン 45・結末 14） |
| `node tools/validate-story.js`（本編） | OK：誤り 0 件、注意 0 件 |
| `node tools/test-stage.js` | OK：1,757,181 件の検査に合格 |
| `node tools/verify-text.js` | OK：表示テキスト列・選択肢・シーン属性は基準と完全一致 |
| `node .claude/skills/novel-work/scripts/build-work.js works/ano-hi-no-koe --out /tmp/ahk-build-bgm1` | OK：誤り 0・注意 0（60 ファイル。前回の 52 から BGM 8 ファイル増）。`assets/bgm/` に 8 ファイルすべて入った。無い素材は従来どおり `assets/images/bg/title.webp` の 1 件のみ |

エンジンと本編は変えていないので、既存の e2e（`tools/e2e*.js`）は実行していない。

### Playwright での再生確認（一時の手段・リポジトリには置いていない）

- 前回と同じ方式。`/tmp/ahk-bgm1-check/check.js` で `tools/preview-server.js` の `createServer` に「作品フォルダ → リポジトリ直下」の順で重ね、`js/story.js` だけ「作品の story.js の全文＋末尾に `STORY.start` の差し替え」をメモリ上で渡した（作品のファイルは変えていない）。
- 手順：ページを開き manifest の読み込み完了を待つ → タイトルは画面の空き部分をクリック、シーンは「はじめから」をクリック（自動再生制限の解除を兼ねる）→ `GameAssets.info().bgm` が期待の URL になるのを待つ。
- 判定：`GameAssets.info().bgm` が期待の MP3 であること、その MP3 が 200 で読み込まれたこと、400 番台以上の応答（未着の `title.webp` を除く）とページのエラーが無いこと。
- 実行：`NODE_PATH=/home/hatch/.pw-node/node_modules node /tmp/ahk-bgm1-check/check.js`（1366×768、Chromium headless）

| 場面 | 開始シーン | 期待 | 結果 |
|---|---|---|---|
| タイトル | （タイトル画面） | `title.mp3` | OK |
| はじめから（タイトル→昼に切替） | `p_morning` | `day.mp3` | OK |
| 昼 | `c_class` | `day.mp3` | OK |
| 夕方 | `c_search` | `evening.mp3` | OK |
| 夜 | `h_1` | `night.mp3` | OK |
| 闇 | `p_dark` | `dark.mp3` | OK |
| バッドエンド | `end_bad_ren` | `sad.mp3` | OK |
| バッドエンド | `end_bad_sora` | `sad.mp3` | OK |
| 終章・断片 | `t_fragments` | `dark.mp3` | OK |
| 終章・病室 | `t_hospital` | `sad.mp3` | OK |
| 終章・あなたへ | `t_plea` | `true.mp3` | OK |
| 終章・あの日の声 | `t_rescue` | `happy.mp3` | OK |
| TRUE END | `end_true` | `happy.mp3` | OK |

- 結果：**13 件すべて OK**（1 回目の実行で全 OK）。各ケースでタイトル曲 → 期待の曲の順に MP3 が 200 で読み込まれ、クリック後に再生対象が切り替わったことも確認できた。
- 音そのものの聴感（ループのつなぎ目・音量バランス）は headless では確認できないため未確認（§7）。

## 6. 判断に迷った点

- **依頼の例外 `t_dawn`・`t_rewind` は本作に存在しない**。終章のシーンは `t_awake`・`t_fragments`・`t_hospital`・`t_plea`・`t_freeze`・`t_rescue`・`end_true` の 7 つ。内容から次のように読み替えた：
  - `t_rewind` → **`t_freeze`（凍った朝）**：「あの朝へ」連れ戻されて時間が止まる場面。theme が `true` なので、読み替えなくても規則上 true になり、結果は同じ。
  - `t_dawn` → **`t_rescue`（あの日の声）**：ゆらが救われる場面で、そのまま `end_true` へ続く。依頼の曲説明「救済エンド。温かい『ありがとう』の曲」にも合うので **happy** にした。**読み替えずに規則どおりなら theme `morning` → day** になる。day に戻す場合は manifest の `t_rescue` の 1 行を `bgm/day.mp3` にするだけ。happy のままだと `t_rescue` → `end_true` は同じ曲なので頭出しせずに流れ続ける（エンジンの仕様）。
- **`t_plea` の theme は `dark`** だが、依頼の例外指定を優先して true にした（依頼どおり）。
- **バッドエンド以外の結末**：`end_normal_*`・`end_good_*` は theme `evening` → evening、`end_harem` は theme `night` → night。結末専用の曲は割り当てていない（依頼の規則どおり）。
- **MP3 のループ**：MP3 はエンコーダの仕様で頭に短い無音（約 1,100 サンプル＝約 23 ms）と末尾のパディングが入るため、FLAC で継ぎ目なしに加工してあっても、ブラウザの `loop` 再生で継ぎ目にごく短い間が出る可能性がある。依頼の形式（MP3）に従った。気になる場合は M4A（AAC）でも同様の問題があるため、エンジン側のギャップレス対応（Web Audio）が必要になる。

## 7. 未解決

- **`t_rescue` の曲（happy か day か）**：§6 の読み替えの確認をお願いしたい。
- **ループのつなぎ目と音量の聴感確認**は未実施（headless のため）。実機で聴いて、つなぎ目の間や曲ごとの音量差が気になれば、manifest の `volume` で調整できる。
- タイトル絵（`title.webp`）は引き続き未着。
- 上記以外に失敗や保留は無い。
