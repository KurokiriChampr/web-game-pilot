# 検証用のデータ（フィクスチャ）

本作の物語データではない。エンジンの検査（`tools/e2e-p4.js`、`tools/e2e-p5.js`、`tools/test-stage.js`、`tools/validate-story.js`）だけが使う。

| フォルダ／ファイル | 中身 |
| --- | --- |
| `v2.1-localstorage.json` | ver 2.1 で実際に作った保存データ（旧データの互換確認用） |
| `trio/` | **3 人同時表示の検証用の「別作品」**。作品が差し替える 3 ファイル（`js/work.js`・`js/story.js`・`assets/manifest.json`）だけを持ち、エンジンと画像はこのリポジトリのものに重ねて動かす。人物 1 人は本作の立ち絵を流用、残りはサーバがその場で作る単純な図形（ファイルは置かない） |
| `long/gen.js` | **長編規模の検証用データを生成するスクリプト**。既定で 40 章 × 20 シーン＝800 シーン（本作の 40 倍）。生成結果はメモリ上で配信し、リポジトリには置かない。`--linear` を付けると一本道（`scene.next`）を混ぜる（付けないときの出力は従来と同じ） |
| `linear/` | **選択肢なしのシーン遷移（`scene.next`）の検証用の「別作品」**（13 シーン・結末 3）。一本道、関数の `next`、見える選択肢が 0 個のときの `next`、選択肢が優先される併用、章をまたぐ一本道を含む。画像は使わない |

画面で見るには：

```sh
node tools/preview-server.js --work tools/fixtures/trio --placeholders   # 3 人表示
node tools/fixtures/long/gen.js --out /tmp/long && node tools/preview-server.js --work /tmp/long   # 長編
node tools/preview-server.js --work tools/fixtures/linear                  # 一本道（scene.next）
```
