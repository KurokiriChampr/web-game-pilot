# 素材・manifest・配色

正本は `docs/ASSETS.md`（§2 manifest、§4b 論理名と立ち絵、§5 無いときの動き）。ここは作品を作る側の要点だけ。
素材そのものの制作（絵・音の生成、画風）はこのスキルの範囲外。

## 置き場所

```
works/<作品ID>/assets/
├── manifest.json
├── images/bg/<名前>.webp          背景・一枚絵・タイトルの絵
├── images/chara/<人物>/<ポーズ>_<表情>.webp   立ち絵（表情ごとに全身 1 枚）
└── bgm/<曲>.mp3
```

この並びにしておくと、`--placeholders` が**まだ無い**背景と立ち絵に仮の絵を返す（それ以外の場所には返さない）。

## manifest（`"version": 2`）

```json
{
  "version": 2,
  "basePath": "assets/",
  "defaults": { "image": null, "bgm": null },
  "title": { "image": "images/bg/title.webp", "bgm": "bgm/title.mp3" },
  "backgrounds": {
    "room": { "image": "images/bg/room.webp", "position": "50% 40%" }
  },
  "characters": {
    "mio": {
      "base": "images/chara/mio/",
      "scale": 1,
      "poses": { "stand": { "exprs": { "normal": "stand_normal.webp", "smile": "stand_smile.webp" } } }
    }
  },
  "scenes": {
    "start": { "bgm": "bgm/morning.mp3" }
  }
}
```

- story.js には論理名（`bg: "room"`、`chara: "mio"`, `expr: "smile"`）だけを書き、ファイル名は manifest で決める。
- **story.js で使う背景・人物・ポーズ・表情が manifest に無いと、点検で誤り。** ファイルそのものが無いのは誤りではない（素材なしで表示される）。
- `scenes[シーンID]` には BGM（`bgm`）や、背景の予備（`image`）を書ける。BGM は同じ曲が続くと頭出ししない。
- 光輪（`poses[ポーズ].halo`）は本作の飾り。書かなければ出ない。
- `scale`（0.5〜1.5）で人物ごとの背丈を変えられる。同じポーズの立ち絵は同じ大きさのキャンバスで作る。
- JSON なのでコメントと末尾のカンマは書けない。
- 作品の assets に無いファイルは、プレビューではリポジトリ直下（本作）の `assets/` から読まれる。
  本作の素材を借りるのは見本・試作だけにする（`build-work.js` は借りたものを一覧で知らせる）。

## 配色 `css/work.css`

```css
body.theme-morning { --bg-1: #2a3a5e; --bg-2: #6a8ab8; --bg-3: #e8c9a0; }
body.theme-title   { --bg-1: #10142e; --bg-2: #2a3260; --bg-3: #5a6aa0; }   /* タイトル画面 */
```

- `scene.theme: "morning"` が `body.theme-morning` になる。使うテーマが無いと点検で注意（既定の配色になる）。
- `--bg-1〜3` は背景画像が無いときのグラデーション、`--accent` は強調の色。基調色を変えるなら `:root` の変数を上書きする。
- `css/work.css` を作品に置かないと、本作の配色が使われる（ひな形は置いてある）。
