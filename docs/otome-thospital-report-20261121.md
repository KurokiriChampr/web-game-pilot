# 『あの日の声』終章 t_hospital の演出修正 報告書（2026-11-21）

依頼者：ベル（ヴェルダンディ／Muse）、承認：マスター
ブランチ：`bell/otome-thospital-20261121`
PR：[#19](https://github.com/KurokiriChampr/web-game-pilot/pull/19)

## 1. 結論

`t_hospital`（病室）では誰の立ち絵も出なくなった。本文・台詞・選択肢・分岐・数値条件は変更していない。`t_rescue` と `end_true` の晴樹の立ち絵は従来どおり出る。検証はすべて通過。

## 2. 原因と修正

- このシーンはもともと `stage: { bg: "hospital", hide: "*" }` で開始時に舞台を空にしている。晴樹の立ち絵は、3 段落目「包帯だらけの男の子が、眠っていた。…」に付いていた段落単位の指定 `chara: "haruki", pos: "center", expr: "sad"` によって登場していた。
- 修正：その段落から `chara`／`pos`／`expr` を外し、本文だけの文字列にした（`works/ano-hi-no-koe/js/story.js` の 1 行のみ）。本文の文字列は一字も変えていない。
- 以後の `say("haruki", "……ゆら……ごめん……間に合わなくて……")` は `speaker` だけの段落なので、エンジン（`js/stage.js` の `stageAt`）の仕様上、舞台にいない人の声として扱われ、立ち絵は出ない（名前札「相沢晴樹」は出る）。
- シーンの `stage` 指定（`hide: "*"`）はそのまま残しているので、前シーンからの立ち絵の持ち越しも起きない。
- エンジン・本編・素材・manifest・localStorage のキー体系には触れていない。

## 3. 検証

| コマンド | 結果 |
| --- | --- |
| `node tools/validate-story.js --work works/ano-hi-no-koe` | OK：誤り 0 件、注意 0 件（シーン 45・結末 14・同時に並ぶ立ち絵 最大 3 人） |
| `node tools/validate-story.js`（本編） | OK：誤り 0 件、注意 0 件 |
| `node tools/test-stage.js` | OK：1,757,181 件の検査に合格（全 20 シーン × 4096 通り） |
| `node tools/verify-text.js` | OK：表示テキスト列・選択肢・シーン属性は基準と完全一致 |

エンジンと本編は変えていないので、既存の Playwright の e2e（`tools/e2e*.js`）は実行していない。

### Playwright での表示確認（一時の手段・リポジトリには置いていない）

- 前回までの報告書と同じ方式。`/tmp/ahk-hosp-check/overlay/` に、作品の `story.js` を `start: "t_hospital"` に差し替えただけの一時コピーと、背景未着のため `hospital`／`dark`／`crossing` を本編の `images/bg/village_plaza.webp` に向けた確認用 manifest を置き、`tools/preview-server.js` の `createServer` に「一時 overlay → `works/ano-hi-no-koe` → リポジトリ直下」の順で重ねた（作品のファイルは変えていない）。
- 流れ：`t_hospital` を Enter で最後まで送る → `t_plea`「あの朝へ」→ `t_freeze`「ゆらの腕を引いて、歩道へ戻す」→ `t_rescue`。
- 実行：`NODE_PATH=/home/hatch/.pw-node/node_modules node /tmp/ahk-hosp-check/check.js`（PC 1366×768／スマホ 390×844）
- 結果：**OK（2 画面サイズ）**
  - `t_hospital`：7 ページすべてで立ち絵 0（`#char-layer .chara.is-active` が空）。ページ表示 7/7、最終段落「眠ったまま、彼は私の名前を呼んだ。…」まで到達し、次の `t_plea` に進んだ。晴樹の台詞のページは名前札「相沢晴樹」のみで立ち絵なし。
  - `t_rescue`：「――ゆら！」から晴樹の立ち絵が中央に出る（`haruki_normal.png` → 最後の台詞で `haruki_smile.png`）。従来どおり。
  - ページのエラー・`/chars/` の読み込み失敗なし。
- スクリーンショット（`/tmp/ahk-hosp-check/shots/`）を目視：`pc_hospital_1〜3`／`sp_hospital_1〜3` は立ち絵なし、`pc_rescue`／`sp_rescue` は晴樹（制服）が中央に表示。

## 4. 判断に迷った点

- **指定の外し方**：指示の例は「シーンの stage 指定を空にする」だったが、このシーンの stage はすでに `hide: "*"`（舞台を空にする）で、立ち絵は段落単位の `chara` 指定で出ていた。そのため stage はそのままにし、段落の `chara`／`pos`／`expr` を外す方法を選んだ。エンジンの通常の仕組みの範囲で、素材側の細工はしていない。
- **名前札**：晴樹の寝言「……ゆら……ごめん……」のページは、立ち絵は出ないが名前札「相沢晴樹」は出る（話者指定 `say("haruki", …)` は台詞の一部なので変更対象外と判断）。眠っている人の声として名前札が出るのは自然と考えたが、名前札も消したい場合は話者指定を外す変更（台詞の扱いの変更）になるので、マスターの判断が要る。

## 5. 未解決

- なし（背景画像は従来どおり未着。今回の範囲外）。
