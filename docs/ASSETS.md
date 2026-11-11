# 画像・BGM の差し込み手順

『刻の女神と止まった世界』は、**ファイルを置くだけ**で背景画像と BGM が付くようになっています。
ファイルが無いあいだは従来どおりテキストのみで動き、エラーで止まることはありません。

## 1. いちばん簡単な手順

1. 画像を `assets/images/` に、BGM を `assets/bgm/` に、下の表のファイル名で置く
2. コミットして push する（GitHub Pages に反映されれば完了）

`assets/manifest.json` には、全シーンぶんの推奨ファイル名があらかじめ書いてあります。
**表のファイル名どおりに置くなら、マニフェストの編集は不要です。** 一部のシーンだけ先に置いても構いません（無いシーンはテキストのみになります）。

### 推奨ファイル名

| シーンID | シーン名 | 画像（`assets/images/`） | BGM（`assets/bgm/`） |
| --- | --- | --- | --- |
| `title` | タイトル画面 | `title.jpg` | `title.mp3` |
| `awakening` | 止まった草原 | `awakening.jpg` | `field.mp3` |
| `meet` | 時計塔の少女 | `meet.jpg` | `tower.mp3` |
| `explain` | 時の女神リーネ | `explain.jpg` | `tower.mp3` |
| `village` | 涙の止まった村 | `village.jpg` | `field.mp3` |
| `bakery` | 焼きたての朝（寄り道） | `bakery.jpg` | `field.mp3` |
| `forest` | 囁きの森 | `forest.jpg` | `forest.mp3` |
| `campfire` | 揺れる焚き火 | `campfire.jpg` | `night.mp3` |
| `river` | 硝子の大河 | `river.jpg` | `river.mp3` |
| `boat` | 渡し守の舟（寄り道） | `boat.jpg` | `river.mp3` |
| `mirror` | 水鏡の記憶 | `mirror.jpg` | `river.mp3` |
| `library` | 静寂の図書館 | `library.jpg` | `ruins.mp3` |
| `ruins` | 陽だまりの神殿 | `ruins.jpg` | `ruins.mp3` |
| `night` | 止まった星空 | `night.jpg` | `night.mp3` |
| `melody` | 刻告げの歌（寄り道） | `melody.jpg` | `melody.mp3` |
| `boss` | 時喰いの王 | `boss.jpg` | `boss.mp3` |
| `sacrifice` | 時の歯車 | `sacrifice.jpg` | `gear.mp3` |
| `end_true` | TRUE END | `end_true.jpg` | `ending_true.mp3` |
| `end_normal` | NORMAL END | `end_normal.jpg` | `ending_normal.mp3` |
| `end_bad` | BAD END | `end_bad.jpg` | `ending_bad.mp3` |
| `end_still` | ANOTHER END | `end_still.jpg` | `ending_still.mp3` |

画像は 21 枚、BGM は 13 曲です。BGM は複数のシーンで同じ曲を共有しています（割り当ては自由に変えられます）。

## 2. マニフェストの書き方（`assets/manifest.json`）

```json
{
  "version": 1,
  "basePath": "assets/",
  "defaults": { "image": null, "bgm": null },
  "title": { "image": "images/title.jpg", "bgm": "bgm/title.mp3" },
  "scenes": {
    "awakening": { "image": "images/awakening.jpg", "bgm": "bgm/field.mp3" }
  }
}
```

| キー | 内容 |
| --- | --- |
| `basePath` | ファイルパスの基準フォルダ。通常は `assets/` のまま |
| `defaults` | シーン側に項目が無いときに使う既定値 |
| `title` | タイトル画面の画像と BGM |
| `scenes` | シーンID（`js/story.js` の `scenes` のキー）ごとの設定 |

各シーンに書ける項目：

| 項目 | 値 | 説明 |
| --- | --- | --- |
| `image` | 文字列 / 配列 / `null` | 背景画像。`null` は「このシーンでは画像なし」 |
| `bgm` | 文字列 / 配列 / `null` | BGM。`null` は「このシーンでは無音」 |
| `position` | 文字列（省略可） | ページ背景での画像の見せる位置。CSS の `background-position` と同じ書き方（例 `"center top"`） |
| `volume` | 0〜1 の数値（省略可） | その曲だけ音量を下げたいときの倍率（例 `0.7`） |

- **拡張子が違う場合**は、マニフェスト側のファイル名を書き換えてください（例 `"images/forest.webp"`）。
- **配列**で書くと、先頭から順に試し、最初に読み込めたものを使います。
  例：`"image": ["images/forest.webp", "images/forest.jpg"]`
- 項目そのものを省略すると `defaults` の値が使われます。全シーン共通の BGM を流したいときは `defaults.bgm` に書きます。
- JSON なので、コメントは書けません。最後の項目のあとにカンマを付けないよう注意してください。

## 3. 素材の目安

| 種類 | 形式 | 目安 |
| --- | --- | --- |
| 画像 | JPEG / WebP / PNG | 横長 16:9、1600×900 px 前後、1 枚 300KB 以下だと読み込みが軽い |
| BGM | MP3（推奨）/ M4A / OGG | ループを前提にした曲。1 曲 1〜3MB 程度。OGG は iPhone の Safari で再生できないため MP3 が無難 |

- 画像はシーンカードの上部（16:9）と、ページ全体の背景（薄く暗くして表示）の両方に使われます。主題は中央寄りに置くと、スマホでも切れにくくなります。
- 文字は必ずカードの上に載るので、画像に文字用の余白を作る必要はありません。
- BGM はファイルの頭と末尾がそのままつながります。無音の余白が入っていると、ループのたびに間が空きます。

## 4. 動作のしくみ

- 画像：シーンに入るたびに切り替わります（クロスフェード）。カード上部の画像をタップ、またはメニューの「🖼 背景を見る」で、UI を隠して画像だけを見られます。
- BGM：シーン単位でループ再生します。**次のシーンが同じ曲なら、頭出しせずにそのまま流れ続けます。** 曲が変わるときはフェードで切り替わります。
- 音量とミュートは「⚙ 設定」、またはステータスバーの 🔊 ボタン（キーボードは `M`）で変えられ、ブラウザに記憶されます。
- ブラウザの自動再生制限により、BGM は**最初のタップ／キー操作のあと**に鳴りはじめます（タイトル画面を開いた直後は無音です）。
- タブを裏に回すと BGM は一時停止し、戻ると再開します。
- iPhone / iPad は OS の仕様で、ページ側から音量を変えられません（ミュートは効きます）。音量は本体のボタンで調整してください。

### ファイルが無いとき

| 状況 | 動作 |
| --- | --- |
| マニフェストに書いたファイルが無い | その画像／曲だけを飛ばして、テキストのみで続行 |
| `assets/manifest.json` 自体が無い・壊れている | 画像・BGM なしで、テキストのみで続行 |
| `index.html` をダブルクリックで開いた（`file://`） | ブラウザの制限でマニフェストを読めないため、テキストのみで続行 |

ファイルが無いあいだは、ブラウザの開発者ツールに `404` の読み込み記録が出ますが、これは「まだ置かれていない」という記録で、ゲームの動作には影響しません。同じファイルを取りに行くのは、ページを開いてから 1 回だけです。

## 5. 確認のしかた

画像と BGM は `file://` では確認できません。ローカルで試すときは簡易サーバーを使ってください。

```
python3 -m http.server
```

`http://localhost:8000/` を開き、「⚙ 設定」を開くと、いまの場面に画像と BGM が適用されているかが表示されます（「この場面：背景画像 あり ／ BGM あり」）。

反映されないときは、次の順に確認してください。

1. ファイル名と拡張子が、マニフェストの記述と大文字・小文字まで一致しているか（GitHub Pages は区別します）
2. `assets/manifest.json` が正しい JSON か（カンマの付け忘れ・付けすぎ）
3. 設定の「背景画像を表示する」がオンで、ミュートがオフか
4. ブラウザのキャッシュ（スーパーリロードで再読み込み）

## 6. シーンを追加したとき

`js/story.js` に新しいシーンを足したら、同じ ID で `assets/manifest.json` の `scenes` に 1 行追加します。追加しなくても、そのシーンは `defaults` の設定（既定ではテキストのみ）で動きます。
