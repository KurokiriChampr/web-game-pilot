# 次期設計 第1弾A（scene.next）実装報告（2026-11-21）

- 依頼者：ベル（ヴェルダンディ／Muse）、承認：マスター
- 実施：実装は VM 内 Claude Code セッション bell-scene-next（Opus）。仕上げ（本報告書、コミット、push）はベルが行った（理由は「判断に迷った点」1）。
- 基点：main（3.0-p4、`05d6821`）。ブランチ：`claude/novel-game-scene-next-20261121`。
- 設計の根拠：`docs/gui-next-design-report-20261117.md` §2 と、マスターの決定（選択肢と next の併用可・選択肢優先、next で進んでも幕数 steps を増やす、版表記とセーブ形式は不変）。

## 変更内容

| ファイル | 内容 |
|---|---|
| `js/game.js` | `scene.next` の実装。最終ページを読み終えると送りの印（▼）を出して待ち（`pager.waitNext`、保存しない）、もう一度送ると遷移する。遷移は `enterScene()` として選択肢と共通化（幕数 +1、行き先の `onEnter`、バックログにシーンの行、オートセーブ）。`goesNext()`：結末でなく、next があり、見える選択肢が 0 個のときだけ next（選択肢優先）。next はシーン ID の文字列と状態から決める関数の両対応。オートは送り待ちでも通常の待ち時間で進む |
| `tools/validate-story.js` | next の点検を追加。行き先の無い next、選択肢も next も無いシーン、next だけで抜けられない輪は誤り。結末の next 等は注意 |
| `tools/test-stage.js` | next の検査を追加（+100 行） |
| `tools/fixtures/linear/` | next だけでつながる一本道の見本作品（新規） |
| `tools/fixtures/long/gen.js`、`tools/fixtures/README.md` | 見本と説明の追随 |
| `tools/e2e-p5.js` | next の画面確認用 e2e（新規。Playwright が要るため VM 内では未実行） |
| `docs/ENGINE.md` | 「選択肢なしのシーン遷移（scene.next）」の節を追加 |

変えていないもの：`js/story.js`（本文・分岐条件・選択肢 effects）、localStorage のキーとセーブ形式、版表記（3.0-p4 のまま）。

## 検査結果（ベルが再実行）

- `node tools/verify-text.js`：表示テキスト列・選択肢・シーン属性は基準と完全一致
- `node tools/validate-story.js`：誤り 0 件、注意 0 件
- `node tools/test-stage.js`：1,756,955 件の検査に合格（3.0-p4 時点の 1,756,928 件から next 分が増加）

## 判断に迷った点

1. **仕上げをベルが直接行った**：実装セッションと仕上げセッションが、VM の再起動で 2 回とも中断された（実装は作業ツリーに残っていたが、コミット・push・報告書が無い状態）。3 回目のセッションも同じ目に遭う可能性が高く、残作業が「報告書・コミット・push」の事務的な仕上げだけだったため、ベルが直接行うことにした。実装の中身は変えていない。
2. **e2e-p5.js は未実行**：Playwright が VM 内に無いため（従来の e2e と同じ制約）。検査 3 種はすべて通っているが、画面上での送り印の表示と遷移の実地確認は、実機確認とあわせて未実施のまま残る。

## 未解決

- 実機（iOS Safari／Android Chrome）での表示確認（3.0-p4 以来の残件と同種）。
- e2e-p5.js の実行（Playwright のある環境で別途）。
- 次は第2弾B（`js/state.js` の切り出し）へ進む。

## 追記（2026-11-21、e2e の実測結果）

「未解決」に残していた e2e-p5.js の実行は、メインチャット側で実測済み（Playwright は `NODE_PATH=/home/hatch/.pw-node/node_modules` で使用可能だった）。

- `tools/e2e-p5.js`：OK、66 件合格（送り・最終ページ停止・選択肢優先・オート通過・スキップ停止・バックログ・巻き戻し・セーブ／ロード）
- `tools/e2e.js`：全 20 シーン通し、4 エンディング到達、エラーなし
- `tools/e2e-phase2.js`：83 件合格
- `tools/e2e-p3.js`／`tools/e2e-p4.js`：完走、異常なし

これで本報告書の未解決は、実機（iOS Safari／Android Chrome）での表示確認のみとなった。
