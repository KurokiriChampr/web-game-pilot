# 次期設計 第2弾B：状態の計算を js/state.js へ切り出す（報告書 2026-11-21）

- 依頼者：ベル（ヴェルダンディ／Muse）、承認：マスター
- ブランチ：`claude/novel-game-state-js-20261121`（main `f5a035b` から作成）
- 根拠：`docs/gui-next-design-report-20261117.md`（ブランチ `claude/novel-game-engine-next-design-hlyv54`）§1-1 (f)、§1-3 の移行の手順案 1
- 性格：**動作を変えないリファクタリング**。機能の追加はしていない（C の状態変数には触れていない）

## 1. 変更内容

| ファイル | 変更 |
| --- | --- |
| `js/state.js` | **新規**。`GameState` を公開する。状態の計算 8 関数を `js/game.js` から**中身を変えずに**移した。`js/stage.js` と同じ形（即時関数、Node では `module.exports`、ブラウザでは `window.GameState`） |
| `js/game.js` | 移した 8 関数の定義を消し、同じ名前のローカル変数で `GameState` の関数を指すようにした（`var State = window.GameState.create(STORY);` と `var newState = State.newState;` など）。呼び出し側のコードは 1 行も変えていない。冒頭の説明コメントを 2 行直した |
| `index.html` | `<script src="js/state.js?v=3.0-p4">` を `js/stage.js` の直後（`js/assets.js`・`js/game.js` より前）に足した |
| `tools/e2e-p3.js` | `?v=` の数の期待値を 7 → 8 か所に（設計 §1-3 の想定どおり） |
| `tools/e2e-p4.js` | 「0. 境界」（作品固有の語が無いこと）の対象に `state.js` を足した（設計 §1-3 の想定どおり） |
| `docs/ENGINE.md`・`README.md` | ファイル一覧に `js/state.js` を足し、持ち出すファイルの一覧と `?v=` の数（7 → 8 か所）を直した |

変えていないもの：`js/story.js`、`js/work.js`、セーブ形式、localStorage キー（5 件のまま）、版表記（3.0-p4）、`tools/lib/load-work.js`、`tools/preview-server.js`、`tools/fixtures/`。

### `GameState` の形

```js
GameState.create(STORY)  // → { newState, isValidSave, restoreState, applyEffects, resolve, visibleChoices, goesNext, snapshotOf }
GameState.resolve / visibleChoices / goesNext / snapshotOf   // STORY に依らない 4 つは直接も呼べる
```

`STORY` を使う 4 関数（`newState`・`isValidSave`・`restoreState`・`applyEffects`）は、以前は `game.js` の閉包にある `STORY` を読んでいた。これを `create(STORY)` の閉包に移した。`STORY` の中身（`scenes`・`start`・`maxShards`）は呼ばれた時点で読むので、読み込みの順番や章の追加（`GameStage.addChapter`）に対する振る舞いも以前と同じ。

## 2. 切り分けの境界と理由

**判断の基準**：「状態 `s` と物語データだけを受け取り、DOM・localStorage・いまの状態（`game.js` の `state` 変数）・作品設定（`WORK`）・画面用の状態（`pager` 等）を一切読まない関数」を `state.js` へ、それ以外を `game.js` に残す。これは設計 §1-1 (f) の「`js/stage.js` と同じく画面に触れない計算だけを置き、Node からも読めるようにする」に合わせたもの。

### state.js へ移したもの（8 関数）

| 関数 | 分類 | 備考 |
| --- | --- | --- |
| `newState` | 状態の生成 | 設計の列挙どおり |
| `isValidSave` | セーブの検査 | 設計の列挙どおり |
| `restoreState` | 復元（複製と補完） | 設計の列挙どおり。C で `vars` の補完を足す場所 |
| `applyEffects` | effects・onEnter の適用 | 設計の列挙どおり。C で `effects.vars` を足す場所 |
| `snapshotOf` | 巻き戻し用の控え（複製） | 設計の列挙どおり。C で控えに `vars` を足す場所 |
| `visibleChoices` | 選択肢の可視判定 | 設計の列挙どおり |
| `resolve` | 条件・行き先・本文の解決 | 設計の列挙には無いが、依頼の「resolve 系」に当たる。`visibleChoices` と同じく状態を関数に渡すだけの純関数 |
| `goesNext` | next へ進むかの判定 | 設計の列挙には無い（A で後から足された関数）。`visibleChoices` に依存する純関数で、点検ツールが同じ判定を使えるとよいので移した（§3 の 1） |

### game.js に残したもの

| 関数 | 残した理由 |
| --- | --- |
| `currentScene`・`inGame` | いまの状態 `state` や DOM を読む |
| `trimLog`・`pushLog`・`logScene`・`scenePages` | バックログの上限は作品設定（`WORK.limits`）から決まり、行の中身は表示用の本文・話者名。`trimLog` 自体はデータだけの処理だが、役割は「バックログの表示と保存量」なので残した（§3 の 2） |
| `canRewindTo`・`lastChoiceIndex`・`rewindTo` | いまの状態 `state` を読み書きし、画面を描き直す |
| `choose`・`followNext`・`enterScene` | 進行の制御（ログ・既読・描画・通知）。中で `restoreState`・`applyEffects`・`resolve` を呼ぶ形はそのまま |
| `stepLabelOf`・既読・記録・セーブスロット | 作品設定や localStorage に依存する |

## 3. 判断に迷った点

1. **`goesNext` と `resolve` を移すか**。設計 §1-1 (f) の列挙（6 関数）には入っていない。ただし依頼文が「条件の解決（resolve 系）」を明示しており、どちらも状態と物語データだけを読む純関数なので移した。`game.js` 側は同じ名前の変数で受けているため、残しても移しても動作は同じ。
2. **`trimLog` を残したこと**。データだけを扱う関数だが、上限値が作品設定（`WORK.limits`）から来ていて、役割がバックログ（表示と保存量）なので残した。C で状態変数を足しても `trimLog` は関係しない見込み。将来セーブ容量の単体検査をしたくなったら、上限を引数で受ける形にして移す選択肢がある。
3. **関数を `game.js` 側でどう受けるか**。呼び出し側を `State.applyEffects(...)` に書き換える案もあったが、差分を最小にして「中身を変えずに移した」ことが読み取りやすいよう、同じ名前のローカル変数に代入する形にした。関数宣言から変数代入に変わったので巻き上げ（hoisting）はなくなるが、これらを使うのは `init()` 以降に呼ばれる関数の中だけで、代入行より前に実行される箇所は無いことを確かめた。
4. **`state.js` が読めなかったときの扱い**。`window.GameState` が無いと `game.js` は読み込み時に止まる。これは `js/stage.js`（`window.GameStage`）が無いときと同じで、既存の方式に合わせて特別な防御は足していない。古い画面が残っている場合は、既存の `data-app-version` と `?v=` による検出（`handleStalePage`）がそのまま働く。
5. **`tools/lib/load-work.js` で `GameState` を返すか**。`state.js` は画面側の扱い（`SCREEN_SCRIPTS`）に入らないので Node の空間で自動的に実行されるが、返り値には足していない。使うのは C（点検ツールの拡張）からなので、今回は変えなかった。
6. **e2e-p3・e2e-p4 の書き換え**。依頼の必須検査は 3 本だが、設計 §1-3 が想定した 2 か所（`?v=` の数、境界の一覧）だけ書き換え、残りは変えずに全部通した。

## 4. 検査結果（2026-11-21、VM 内で実測）

必須の 3 本：

| 検査 | 結果 |
| --- | --- |
| `node tools/verify-text.js` | **OK**：表示テキスト列・選択肢・シーン属性は基準と完全一致（20 シーン × 4096 通り = 81,920 展開） |
| `node tools/validate-story.js` | **OK**：誤り 0 件、注意 0 件（シーン 20／固有のページ 99／本文 4772 字／選択肢 43／結末 4） |
| `node tools/test-stage.js` | **OK**：**1,756,955 件**に合格（A マージ時点と同数。増減なし） |

追加で実行したもの：

| 検査 | 結果 |
| --- | --- |
| `node tools/validate-story.js --work tools/fixtures/linear` | 誤り 0 件、注意 0 件 |
| `node tools/validate-story.js --work tools/fixtures/trio` | 誤り 0 件、注意 2 件（`gather` の押し出し 2 件。main でも同じ 2 件で、今回の変更とは無関係） |
| `tools/e2e.js` | 完走（全 20 シーン通し、4 エンディング到達、スクリプトエラーなし） |
| `tools/e2e-phase2.js` | 83 件合格 |
| `tools/e2e-p3.js` | 完走、異常なし（`?v=` 8 か所、ELEMENT_IDS 85 件） |
| `tools/e2e-p4.js` | 完走、異常なし（0. 境界 8 件に `state.js` を含む。見本作品 `tools/fixtures/`（長編の生成分を含む）を `preview-server` の重ね合わせで動かす確認も含む） |
| `tools/e2e-p5.js` | 66 件合格（next の送り・選択肢優先・オート・バックログ・巻き戻し・セーブ／ロード） |
| Node での読み込み確認 | `require("./js/state.js")` が単体で読めること、`loadWork()` の読み込み順が `work → story → stage → state → assets → game` であること |

e2e は `NODE_PATH=/home/hatch/.pw-node/node_modules` で Playwright を使って実行した。

## 5. 未解決

- なし（今回の範囲では）。実機（スマホ）での確認は、これまでと同じく未実施のまま。
- 次の C（状態変数）で手を入れる場所：`create(STORY)` の中の `newState`・`restoreState`・`applyEffects`、および `snapshotOf`（`vars` を控えに含める）。`snapshotOf` は今は `STORY` に依らない関数として外にも出しているが、`vars` の宣言を読む必要が出たら `create` の中へ移すことになる。
