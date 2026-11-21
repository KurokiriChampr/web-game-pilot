# 新作乙女ゲーム『あの日の声』骨組み（叩き台）報告書（2026-11-21）

依頼者：ベル（ヴェルダンディ／Muse）、承認：マスター
ブランチ：`claude/otome-scaffold-20261121`（main `11f5621` から）
変更：`works/ano-hi-no-koe/`（新規 4 ファイル）と本報告書のみ。エンジン・tools・本編は無変更。

## 1. 作ったもの

`node .claude/skills/novel-work/scripts/new-work.js ano-hi-no-koe --title "あの日の声"` で足場を作り、次の 4 ファイルを書いた。

| ファイル | 内容 |
| --- | --- |
| `js/story.js` | 45 シーン・8 章・結末 14・選択肢 48・本文 約 7,100 字。解放 5 件 |
| `js/work.js` | ID `ano-hi-no-koe`、題名、紹介文。HUD は非表示（理由は §3）。セーブ枠 6 |
| `assets/manifest.json` | 背景 14 種、立ち絵 5 人（男性 4＋晴樹）×`stand`×`normal/smile/sad`。素材ファイルは無し（`--placeholders` で仮絵） |
| `css/work.css` | テーマ 7 種（title／morning／day／evening／night／dark／true） |

### 流れ

```
序章   p_morning（転校の朝）→ p_accident（交差点）→ p_dark（闇）
        p_dark ─「目を開ける」→ 共通ルート
               ─「声のする方へ」（requires flags.true_route）→ 終章
共通   c_wake → c_class（空）→ c_council（蓮）→ c_library（司）→ c_courtyard（陽太）
        → c_search（探す場所）→ c_festival（準備の相手）→ c_branch（後夜祭の前）
        c_branch ─ 4 人それぞれ → <id>_1 → <id>_2（山場）→ <id>_3 ─next(関数)→ ノーマル／バッド／グッド
                 ─「四人のところへ」（4 人全員 aff ≧ 2 のときだけ表示）→ h_1 → h_2 → end_harem
終章   t_awake（自覚）→ t_fragments（四つの断片の再演）→ t_hospital（晴樹）→ t_plea（懇願）
        → t_freeze（時間凍結・プレイヤーだけの選択肢）→ t_rescue（救済）→ end_true（幼馴染エンド・「ありがとう」）
```

岐路（選択肢の直前）には毎回「誰かが一緒に迷ってくれている」一文を置き、終章の懇願で「声＝プレイヤー」と回収する。

## 2. キャラ設定一覧

依頼の叩き台をそのまま使った（変更はなし）。「補足」の列だけ今回足した。

| ID | 名前 | 設定 | 補足（今回足したもの） |
| --- | --- | --- | --- |
| （地の文）／`yura` | 白瀬ゆら | 主人公。転校生。事故で死亡し幽霊に | 7 年ぶりに町へ戻った。鞄に晴樹からもらった小さな鈴。本人は肩までの髪・何も塗っていない爪（終章で対比）。台詞は manifest に無い「声だけの話者」で、立ち絵は無い |
| `ren` | 藤堂蓮 | 生徒会長、完璧で王子様系 | 指先のインクの染み＝完璧の裏の疲れ |
| `tsukasa` | 久遠司 | クールな図書委員の先輩（3 年） | 閉架にあの日の新聞がある |
| `yota` | 朝比奈陽太 | 明るく甘え上手な後輩（1 年） | 兄を事故で亡くしている（置いていかれる怖さ） |
| `sora` | 三島空 | 軽妙な同級生、実は真面目（隣の席） | 事故の朝に現場にいたが動けなかった。信号の改善の署名を集める |
| `haruki` | 相沢晴樹 | 幼馴染。助けてくれた本人（重傷で入院） | 隣の家の男の子。終章までは「顔の見えない同じ制服の男子」としてだけ登場 |
| `unknown` | ？？？ | 幕間の語り手 | 正体はゆら（終章で示唆） |

### 憑依先の女の子（`story.js` 冒頭の `GIRLS` に集約）

| ルート | 名前 | 髪型 | ネイル | 小物 |
| --- | --- | --- | --- | --- |
| 蓮 | 桐谷澪 | 背中まで届く黒髪（ロング） | 透明なトップコート | 銀の細いブレスレット |
| 司 | 小野寺詩織 | 肩で内巻きのセミロング | 淡いピンク | 桜の押し花の栞 |
| 陽太 | 早瀬ひなた | 左で結んだサイドポニー | 水色 | 鞄の星のキーホルダー |
| 空 | 柚木千夏 | 耳の下で切りそろえたショートボブ | 赤 | 黒いヘアピン二本 |

- 小差は各ルートの最初のシーン（`<id>_1`）で、窓ガラス・水面・鏡に映る髪と、指先・小物として 1 回ずつ見せる（「いつ塗ったんだっけ」と一瞬引っかかって忘れる）。グッドでは相手がその髪・小物に触れる。バッドの最後に「――私の、だったろうか。」で同じ 3 点が出て、終章の断片で再演する。
- 名前は終章の `t_fragments` で初めて出る。ルート中は攻略対象が女の子を名前で呼ばない（「君」「先輩」「お前」）。
- 演出ルールの確認：女の子の立ち絵は作らない（manifest に無い）。本文の「顔」を全文検索し、出てくるのは男子（助けてくれた人・司・陽太）だけであることを確認した。地の文の「私」は全ルートで同じ文体。

## 3. 状態と結末の条件一覧

### 状態

- 好感度：`vars.aff.<ren|tsukasa|yota|sora>`（人物ごと、0〜9）。エンジンの `affection` は 1 本しか持てないため使わず、`maxAffection: 0`・`hud.heart: false` で HUD も隠した（HUD に変数を出す仕組みはまだ無い）。
- フラグ：`bad_<id>`（山場でバッドの選択肢）、`search`／`festival`（本文の出し分け）、`told_sora`、`freeze`（`pull`／`shout`）、`freeze_wait`。
- 解放（`STORY.unlocks`）：

| フラグ | 条件（到達済みエンディング） | 使い道 |
| --- | --- | --- |
| `seen_bad_ren` ほか 3 件 | そのバッド 1 つ | 4 つ目のバッドの判定 |
| `true_route` | `bad_ren`・`bad_tsukasa`・`bad_yota`・`bad_sora` すべて | 闇の場面の「声のする方へ」、序章の本文が 1 行ずつ増える |

### 好感度が上がる選択（共通ルート）

| 場面 | 選択 | 効果 |
| --- | --- | --- |
| c_class（空） | 事故のことを正直に話す | 空 +1 |
| c_council（蓮） | 「無理していませんか」と聞く | 蓮 +1 |
| c_library（司） | 「あの日の交差点のことを」と打ち明ける | 司 +1 |
| c_courtyard（陽太） | 玉子焼きを分けてあげる | 陽太 +1 |
| c_search | 4 か所から 1 つ | 選んだ相手 +1 |
| c_festival | 「四人みんなの手伝いを少しずつする」／個別 4 つ | 全員 +1 ／ 選んだ相手 +1 |
| `<id>_1` | 1 つ目の選択肢 | その相手 +1 |
| `<id>_2`（山場） | 1 つ目 ／ 2 つ目 ／ 3 つ目 | +1 ／ なし ／ `bad_<id>` |

共通ルートを出る時点の最大は 1 人 3。ルートで最大 +2。

### 結末の振り分け（全 14）

| 結末 ID | 名前 | 条件 |
| --- | --- | --- |
| `bad_<id>` ×4 | BAD END「借りものの王子様」「読んではいけない記事」「守れない約束」「青を待てない」 | 山場で 3 つ目の選択肢（`flags.bad_<id>`）。好感度に関係なく優先 |
| `good_<id>` ×4 | GOOD END「完璧じゃない君へ」「貸出期限のない恋」「甘えん坊の本音」「冗談じゃない言葉」 | バッドでなく、ルート終了時 `aff.<id> ≧ 4`（`GOOD_MIN`） |
| `normal_<id>` ×4 | NORMAL END「会長の隣」「栞のあいだ」「拗ねる後輩」「隣の席の真面目くん」 | それ以外 |
| `harem` | HAREM END「四つの星」 | c_branch で 4 人全員 `aff ≧ 2`（`HAREM_MIN`）のときだけ出る「四人のところへ」を選ぶ。実質「4 人全員の出会いで好意的に答える＋祭りで『四人みんな』」が必要 |
| `true` | TRUE END「あの日の声」 | 新規開始時に `true_route`（バッド 4 つ到達済み）→ 闇で「声のする方へ」 |

- 幕間「？？？」：各バッドの結末の本文で「自分の `seen_bad_<id>` が無く、ほかの 3 つの `seen_bad_*` がそろっている」ときだけ、本文の末尾（END の札が出る前）に 6 ページを足す。その周の初期フラグで判定するので、5 周目以降に同じバッドを見ても出ない（1 回だけ）。
- 時間凍結：「ゆらの腕を引いて、歩道へ戻す」「『止まって』と、ゆらに叫ぶ」はどちらも救済（本文が少し変わる）。「まだ選べない」は同じ場面に戻る（選択肢の輪なので詰まない）。

## 4. 検証結果

| 検査 | 結果 |
| --- | --- |
| `node tools/validate-story.js --work works/ano-hi-no-koe` | **誤り 0 件、注意 0 件**（`--strict` でも 0）。シーン 45（すべて到達可能）・固有ページ 257・結末 14 |
| `node tools/verify-text.js` | OK：完全一致 |
| `node tools/validate-story.js`（本編） | OK：誤り 0 件、注意 0 件 |
| `node tools/test-stage.js` | OK：1,757,181 件合格 |
| 全経路の総当たり（Node、エンジンの `js/state.js` を使用） | 初回 7,688 経路で 13 結末すべてに到達、トゥルーは 0。バッド 4 つ到達後は 7,692 経路で 14 結末すべて。幕間は「バッド 3 つ到達済み → 4 つ目」の経路だけで出る（640/640）、それ以外では 0 |
| Playwright 通し（`preview-server` の `createServer`＋`--placeholders` 相当、390×844） | **29 件合格**、画面のエラー 0 |

Playwright で確かめたこと：

1. 初回の闇の場面は「目を開ける」だけ → 蓮のバッドに到達、到達記録に `bad_ren`、幕間は出ない。もう一度はじめからでも「声のする方へ」は出ない。
2. バッド 3 つ到達済みで空のバッド → 幕間「？？？」が流れ、到達記録が 4 つに。4 つそろった後にもう一度バッド → 幕間は出ない。
3. 到達記録 4 つで新規開始 → 闇に「目を開ける／声のする方へ」→ 懇願 → 時間凍結（3 択、「まだ選べない」で戻る）→ 救済 → TRUE END、最後に「ありがとう」、到達記録に `true`。
4. グッド：蓮 3 で分岐＋ルート +2 → GOOD。境界：蓮 1＋2＝3 → NORMAL、蓮 2＋2＝4 → GOOD。
5. ハーレム：蓮 3・ほか 2 で「四人のところへ」が出て HAREM END。司だけ 1 だと出ない（4 択のまま）。
6. **同じ画面で**陽太のバッドに到達 → 到達記録に残り 3 つを足す → 結末画面の「もう一度はじめから」→ 闇に「声のする方へ」→ TRUE END。

検証スクリプトは制約（変更は作品と報告書だけ）に従いリポジトリに入れず、`/tmp/ahk-check/`（`sim.js`・`e2e.js`）で動かした。Playwright はリポジトリの `node_modules` に無く、`NODE_PATH=/home/hatch/.pw-node/node_modules` で実行した。

## 5. スキルの使用感（困った点・不足していた点）

1. **点検ツールは、関数のソースに書かれたフラグ名・変数名しか拾わない**（`s.flags.名前`／`s.vars.名前.人物` を正規表現で抽出）。最初は 4 ルートを共通の組み立て関数で作り、`s.flags["bad_" + id]` のように名前を組み立てたため、誤り 0 のまま注意が 17 件出た（グッド・バッド 8 つが「たどり着けない」、解放フラグ 4 つが「読む関数が無い」「解放できない恐れ」）。分岐の関数だけ名前をそのまま書く形に直して 0 件になった。SKILL.md・`checks.md` には「関数が見ているフラグを試す」とあるだけで、**名前を組み立てると見えない**ことが書かれていない。`checks.md` の注意の表か `pitfalls.md` に一行あると助かる。
2. **3 つ以上のフラグの組合せでだけ出る本文**（今回の幕間：自分は未到達＋ほか 3 つ到達）は点検の試し方（全部なし／全部あり／1 つずつ）の範囲外になりうる（`checks.md` に明記あり）。手元で総当たりと Playwright で確かめた。作品用の「全経路を総当たりするスクリプト」がスキルに付いていると、分岐の多い作品で便利。
3. **作品の画面の通し確認の手段がスキルに無い**。手順 6 は「画面で確かめる（自分で見られなければ依頼者に）」までで、Playwright の見本（`tools/e2e-p7.js`）は検証用作品専用。作品に向けた最小の e2e ひな形（開始・選択肢を文字で選ぶ・結末名を読む・到達記録を仕込む）があると再利用できる。また Playwright がリポジトリの依存に無く、置き場所（`~/.pw-node`）を探す必要があった。
4. **結末の種類 `kind` に「グッド」が無い**（`true`／`normal`／`bad`／`another`）。グッドとハーレムは `another` にした。乙女ゲームでは「グッド」の飾りがほしくなる（エンジン側の話なので今回は触れていない）。
5. **結末のあとに続くシーンが作れない**（結末のシーンで終わる）ため、「バッドの直後の幕間」は結末のシーンの本文の末尾に置くしかなかった。`story-format.md` に「結末のシーンの本文は END の札より前」とあると判断が早い。
6. 良かった点：`new-work.js` は一発で通り、点検込みの足場がすぐ使えた。`unlocks` の書式・見本（`tools/fixtures/unlock/`）・`vars` の `per` は参照資料どおりに動き、エンジンを触る必要は無かった。点検の誤り・注意の文言は具体的で、原因の特定（上の 1）にツールのコードを読めば済んだ。

## 6. 判断に迷った点

1. **幕間の位置**：「4 つ目のバッドを見た直後」だが、結末のシーンの後には何も置けないので、バッド本文の最後（END の札の直前）に「――幕間『？？？』――」の区切りを入れて流した。札の後に出したい場合はエンジン側の仕組みが要る。
2. **好感度の持ち方**：エンジンの `affection` は 1 本なので、人物ごとの変数 `vars.aff` にし、HUD は出さない。HUD に出したい場合は「現在のルートの相手の好感度」を `affection` に写す方式もあるが、二重管理になるので見送った。
3. **数値**：グッド 4、ハーレム 2。グッドは「共通で 2 以上＋ルートで 2 回とも好意的」で届く。ハーレムは 4 人全員への好意的な返事と、祭りで「四人みんな」が要る（経路 8／7,688）。厳しさはマスターと調整したい。
4. **共通ルートとハーレムの「体」**：どの女の子に憑依したかはルートの選択で決まるため、共通ルートでは容姿に触れず、ルート冒頭で初めて髪・ネイル・小物を見せた。ハーレムでは「窓に映る自分の髪を気にする暇もなかった」として、誰の体かを描かずに残した（ハーレムが誰の体か／五人目の子がいるのかは未定）。
5. **名前の扱い**：攻略対象が女の子を名前で呼ぶと別人だと分かるため、ルート中は名前を呼ばせない。一方で、司と空のバッドに「先輩が誰かの名前を呼んでいた。私のじゃない名前を」「私の知らない名前で」という手がかりを入れた（強すぎるならバッドから外す）。
6. **結末の `kind`**：グッドとハーレムは `another`、トゥルーは `true`。
7. **晴樹の過去と鈴**：「7 年前に引っ越した隣の家の男の子」「鈴のキーホルダー」を足し、序章・終章の花束・救済の再会でつないだ。設計メモに無い補足。
8. **攻略対象の背景**：陽太の兄の事故、空が事故の朝に現場にいたことは、各ルートの山場のために足した補足。
9. **時間凍結の選択肢**：救済 2 つ（腕を引く／叫ぶ）＋「まだ選べない」（戻るだけ）の 3 択にした。失敗の選択肢は置いていない。
10. **トゥルー解放時の序章**：事故までは同じだが、`true_route` のときだけ序章に既視感の 1 行、闇の場面に「声がする」2 行を足した（設計の「全く同じ」より少し足している。不要なら外す）。

## 7. 未解決

- 素材（背景・立ち絵・BGM・タイトル絵）は無い。プレビューは `--placeholders` の仮絵。公開用のまとめ（`build-work.js`）はしていない。
- 本文は叩き台（各シーン 5〜10 ページ）。マスターと直す前提。
- 検証スクリプト（`/tmp/ahk-check/sim.js`・`e2e.js`）はリポジトリ外にあり、一時的なもの。残すなら置き場所（例：`works/ano-hi-no-koe/tools/`）を決めてほしい。下に付録として全文を載せる。
- 憑依先の女の子が 4 人とも「ゆらの声」で話す点（声優をつける場合の扱い）は未検討。
- スキルへの追記（§5 の 1・3・5）は今回の範囲外として手を入れていない。

---

## 付録 A：全経路の総当たり `sim.js`

```js
// 全経路の総当たり：到達できる結末・幕間の出方・ハーレム条件を確かめる（作品外の検証用スクリプト）
var R = "/home/hatch/workspace/web-game-pilot/";
var STORY = require(R + "works/ano-hi-no-koe/js/story.js");
var St = require(R + "js/state.js").create(STORY);
function enter(s, id) { s.scene = id; var sc = STORY.scenes[id]; if (sc.onEnter) St.applyEffects(s, sc.onEnter); }
function pages(s) { var t = St.resolve(STORY.scenes[s.scene].text, s); return t.map(function (p) { return typeof p === "string" ? p : p.text; }); }
function walk(reached, out) {
  var stack = [St.newState(reached)];
  while (stack.length) {
    var s = stack.pop(), guard = 0;
    for (;;) {
      if (++guard > 200) throw new Error("loop");
      var sc = STORY.scenes[s.scene];
      var txt = pages(s);
      if (sc.ending) { out.push({ end: sc.ending.id, interlude: txt.some(function (x) { return /幕間/.test(x); }), aff: JSON.stringify(s.vars.aff), flags: s.flags, path: s.path || [] }); break; }
      var vis = St.visibleChoices(sc, s);
      if (vis.length) {
        vis.forEach(function (c) {
          if (c.next === "t_freeze" && s.scene === "t_freeze" && s.flags.freeze_wait) return; // 待つ を 1 回だけ
          var n = JSON.parse(JSON.stringify(s)); n.path = (s.path || []).concat(St.resolve(c.text, s));
          St.applyEffects(n, c.effects); enter(n, St.resolve(c.next, n)); stack.push(n);
        });
        break;
      }
      enter(s, St.resolve(sc.next, s));
    }
  }
}
var BADS = ["bad_ren", "bad_tsukasa", "bad_yota", "bad_sora"];
function summary(label, reached) {
  var out = []; walk(reached, out);
  var by = {}; out.forEach(function (o) { by[o.end] = by[o.end] || { n: 0, inter: 0 }; by[o.end].n++; if (o.interlude) by[o.end].inter++; });
  console.log("== " + label + "（到達済み: " + (reached.join(",") || "なし") + "）経路 " + out.length);
  Object.keys(by).sort().forEach(function (k) { console.log("  " + k + ": " + by[k].n + " 経路" + (by[k].inter ? "、幕間あり " + by[k].inter : "")); });
  return out;
}
var o0 = summary("初回", []);
// ハーレムの条件の確認：h へ行った経路の最低値
var h = o0.filter(function (o) { return o.end === "harem"; });
console.log("  ハーレム経路の例:", h[0].path.join(" → "));
summary("バッド3つ到達（蓮・司・陽太）", BADS.slice(0, 3));
summary("バッド4つ到達", BADS);
summary("バッド4つ＋他の結末", BADS.concat(["good_ren", "harem"]));
```

## 付録 B：Playwright 通し `e2e.js`（実行：`NODE_PATH=/home/hatch/.pw-node/node_modules node e2e.js`）

```js
// 『あの日の声』画面の通し確認（作品外の検証用スクリプト）
"use strict";
var R = "/home/hatch/workspace/web-game-pilot/";
var path = require("path");
var assert = require("assert");
var playwright = require("playwright");
var createServer = require(R + "tools/preview-server.js").createServer;
var P = "ano-hi-no-koe-";
var checks = 0;
function ok(c, m) { checks++; assert.ok(c, m); console.log("    ✓ " + m); }

async function open(browser, url, storage) {
  var ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  var page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", function (e) { page.errors.push(e.message); });
  page.on("console", function (m) { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  var data = Object.assign({}, storage || {});
  data[P + "settings-v1"] = { textSpeed: 3, autoSpeed: 2 };
  await page.addInitScript(function (d) {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    Object.keys(d).forEach(function (k) { localStorage.setItem(k, JSON.stringify(d[k])); });
  }, data);
  await page.goto(url);
  await page.waitForSelector("#title-screen:not([hidden])");
  await page.click("#start-btn");
  await page.waitForSelector("#game-screen:not([hidden])");
  page.seen = [];
  return page;
}
async function state(page) {
  return page.evaluate(function () {
    var c = document.getElementById("choice-overlay"), e = document.getElementById("ending-overlay");
    return {
      title: document.getElementById("scene-title").textContent,
      text: document.getElementById("scene-text").textContent,
      choice: !c.hidden && !c.classList.contains("is-locked"),
      ending: !e.hidden && !e.classList.contains("is-locked"),
      choices: Array.prototype.map.call(document.querySelectorAll("#choices .choice-text"), function (n) { return n.textContent; }),
      endName: document.getElementById("ending-name").textContent
    };
  });
}
/** 選択肢か結末が出るまで送る。通った本文を page.seen にためる */
async function until(page) {
  for (var g = 0; g < 400; g++) {
    var v = await state(page);
    if (page.seen[page.seen.length - 1] !== v.text) page.seen.push(v.text);
    if (v.choice || v.ending) return v;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(40);
  }
  throw new Error("進まない");
}
async function pick(page, text) {
  var v = await until(page);
  var i = v.choices.indexOf(text);
  assert.ok(i !== -1, "選択肢「" + text + "」が無い：" + v.choices.join("／") + "（" + v.title + "）");
  await page.keyboard.press(String(i + 1));
  await page.waitForTimeout(120);
}
async function play(page, list) { for (var i = 0; i < list.length; i++) await pick(page, list[i]); return until(page); }
async function endings(page) { return page.evaluate(function (k) { return JSON.parse(localStorage.getItem(k) || "[]"); }, P + "endings-v1"); }

var COMMON_REN = ["目を開ける", "事故のことを正直に話す", "「無理していませんか」と聞く", "「あの日の交差点のことを」と打ち明ける", "玉子焼きを分けてあげる", "生徒会室で記録を調べる"];
(async function () {
  var server = createServer({ roots: [path.join(R, "works/ano-hi-no-koe"), R], placeholders: true });
  var url = await new Promise(function (r) { server.listen(0, "127.0.0.1", function () { r("http://127.0.0.1:" + server.address().port + "/"); }); });
  var browser = await playwright.chromium.launch();
  try {
    console.log("1. 初回：闇の場面に「声のする方へ」が無い → 蓮のバッド");
    var p = await open(browser, url);
    var v = await until(p);
    ok(v.title === "闇" && v.choices.join("／") === "目を開ける", "初回の闇の場面は「目を開ける」だけ（" + v.choices.join("／") + "）");
    v = await play(p, COMMON_REN.concat(["生徒会の看板づくりを手伝う", "屋上の蓮先輩のところへ", "「今日はもう休んでください」と書類を取り上げる", "「あなたがあの人だと言って」とすがる"]));
    ok(v.ending && /借りものの王子様/.test(v.endName), "BAD END（蓮）に到達：" + v.endName);
    ok(!p.seen.some(function (t) { return /幕間/.test(t); }), "1 つ目のバッドでは幕間は出ない");
    ok(JSON.stringify(await endings(p)) === JSON.stringify(["bad_ren"]), "到達記録に bad_ren");
    // もう一度はじめから（同じブラウザの到達記録のまま）→ まだ「声のする方へ」は出ない
    await p.click("#ending-restart").catch(async function () { await p.click("text=もう一度はじめから"); });
    await p.waitForTimeout(300);
    v = await until(p);
    ok(v.title === "闇" && v.choices.indexOf("声のする方へ") === -1, "バッド 1 つでは「声のする方へ」は出ない");
    ok(p.errors.length === 0, "画面のエラーなし"); await p.context().close();

    console.log("2. バッド 3 つ到達済み → 4 つ目（空）のバッドの直後に幕間「？？？」");
    p = await open(browser, url, { [P + "endings-v1"]: ["bad_ren", "bad_tsukasa", "bad_yota"] });
    v = await play(p, ["目を開ける", "「なんでもない」とごまかす", "書類だけ渡して、お礼を言う", "「やっぱりいいです」と引き下がる", "「自分で食べたいの」と笑う", "教室で空くんに相談する", "二年B組の展示を手伝う", "教室の空くんのところへ", "「空くんって意外と真面目だね」とからかう", "「あの人を探しに行く」と交差点へ駆け出す"]);
    ok(v.ending && /青を待てない/.test(v.endName), "BAD END（空）に到達：" + v.endName);
    ok(p.seen.some(function (t) { return /幕間「？？？」/.test(t); }) && p.seen.some(function (t) { return /声のする方へ/.test(t); }), "幕間「？？？」が流れた");
    ok((await endings(p)).length === 4, "到達記録にバッド 4 つ");
    ok(p.errors.length === 0, "画面のエラーなし"); await p.context().close();

    console.log("2b. バッド 4 つ到達済みで、もう一度バッド → 幕間は出ない（1 回だけ）");
    p = await open(browser, url, { [P + "endings-v1"]: ["bad_ren", "bad_tsukasa", "bad_yota", "bad_sora"] });
    v = await play(p, ["目を開ける", "「なんでもない」とごまかす", "書類だけ渡して、お礼を言う", "「やっぱりいいです」と引き下がる", "「自分で食べたいの」と笑う", "教室で空くんに相談する", "二年B組の展示を手伝う", "教室の空くんのところへ", "「空くんって意外と真面目だね」とからかう", "「あの人を探しに行く」と交差点へ駆け出す"]);
    ok(v.ending && !p.seen.some(function (t) { return /幕間/.test(t); }), "2 回目以降のバッドでは幕間は出ない");
    await p.context().close();

    console.log("3. 到達記録をそろえて新規開始 → 「声のする方へ」→ トゥルーエンド");
    p = await open(browser, url, { [P + "endings-v1"]: ["bad_ren", "bad_tsukasa", "bad_yota", "bad_sora"] });
    v = await until(p);
    ok(v.title === "闇" && v.choices.join("／") === "目を開ける／声のする方へ", "闇の場面に「声のする方へ」が出る（" + v.choices.join("／") + "）");
    await pick(p, "声のする方へ");
    await pick(p, "あの朝へ");
    v = await until(p);
    ok(v.title === "凍った朝" && v.choices.length === 3, "時間凍結の選択肢：" + v.choices.join("／"));
    await pick(p, "まだ選べない");
    v = await until(p);
    ok(v.title === "凍った朝", "「まだ選べない」→ 凍った朝に戻る");
    await pick(p, "ゆらの腕を引いて、歩道へ戻す");
    v = await until(p);
    ok(v.ending && /TRUE END/.test(v.endName), "トゥルーエンドに到達：" + v.endName);
    ok(p.seen.some(function (t) { return /ありがとう/.test(t); }), "最後に「ありがとう」");
    ok((await endings(p)).indexOf("true") !== -1, "到達記録に true");
    ok(p.errors.length === 0, "画面のエラーなし"); await p.context().close();

    console.log("4. グッド（蓮）：蓮の好感度 3 で分岐 → ルートで +2 → 5 ≧ 4");
    p = await open(browser, url);
    v = await play(p, COMMON_REN.concat(["生徒会の看板づくりを手伝う", "屋上の蓮先輩のところへ", "「今日はもう休んでください」と書類を取り上げる", "「完璧じゃない先輩が好きです」と伝える"]));
    ok(v.ending && /GOOD END/.test(v.endName), "GOOD END（蓮）：" + v.endName);
    await p.context().close();
    console.log("4b. 境界：蓮の好感度 1 で分岐 → ルートで +2 → 3 ＜ 4 はノーマル");
    p = await open(browser, url);
    v = await play(p, ["目を開ける", "「なんでもない」とごまかす", "「無理していませんか」と聞く", "「やっぱりいいです」と引き下がる", "「自分で食べたいの」と笑う", "教室で空くんに相談する", "二年B組の展示を手伝う", "屋上の蓮先輩のところへ", "「今日はもう休んでください」と書類を取り上げる", "「完璧じゃない先輩が好きです」と伝える"]);
    ok(v.ending && /NORMAL END/.test(v.endName), "NORMAL END（蓮）：" + v.endName);
    await p.context().close();
    console.log("4c. 境界：蓮の好感度 2 で分岐 → ルートで +2 → 4 はグッド");
    p = await open(browser, url);
    v = await play(p, ["目を開ける", "「なんでもない」とごまかす", "「無理していませんか」と聞く", "「やっぱりいいです」と引き下がる", "「自分で食べたいの」と笑う", "生徒会室で記録を調べる", "二年B組の展示を手伝う", "屋上の蓮先輩のところへ", "「今日はもう休んでください」と書類を取り上げる", "「完璧じゃない先輩が好きです」と伝える"]);
    ok(v.ending && /GOOD END/.test(v.endName), "GOOD END（蓮）：" + v.endName);
    await p.context().close();

    console.log("5. ハーレム：4 人全員 2 以上で「四人のところへ」が出る／1 人でも足りないと出ない");
    p = await open(browser, url);
    await play(p, COMMON_REN.concat(["四人みんなの手伝いを少しずつする"]));
    v = await until(p);
    ok(v.title === "後夜祭の前" && v.choices.indexOf("四人のところへ") !== -1, "全員 ≧ 2（蓮 3・司 2・陽太 2・空 2）で出る：" + v.choices.join("／"));
    await pick(p, "四人のところへ");
    v = await until(p);
    ok(v.ending && /HAREM END/.test(v.endName), "HAREM END：" + v.endName);
    ok(p.errors.length === 0, "画面のエラーなし"); await p.context().close();
    p = await open(browser, url);
    await play(p, ["目を開ける", "事故のことを正直に話す", "「無理していませんか」と聞く", "「やっぱりいいです」と引き下がる", "玉子焼きを分けてあげる", "生徒会室で記録を調べる", "四人みんなの手伝いを少しずつする"]);
    v = await until(p);
    ok(v.title === "後夜祭の前" && v.choices.indexOf("四人のところへ") === -1 && v.choices.length === 4, "司だけ 1 では出ない：" + v.choices.join("／"));
    await p.context().close();

    console.log("6. 同じ画面で：陽太のバッドに到達 → 到達記録に残り 3 つを足す → 「もう一度はじめから」→ トゥルーエンド");
    p = await open(browser, url);
    v = await play(p, ["目を開ける", "「なんでもない」とごまかす", "書類だけ渡して、お礼を言う", "「やっぱりいいです」と引き下がる", "玉子焼きを分けてあげる", "中庭で一年生に聞いて回る", "一年生の屋台を手伝う", "中庭の陽太くんのところへ", "「明日も来るね」と笑う", "「ずっとそばにいる」と約束する"]);
    ok(v.ending && /守れない約束/.test(v.endName), "BAD END（陽太）に到達：" + v.endName);
    await p.screenshot({ path: "/tmp/ahk-check/shot-bad-yota.png" });
    await p.evaluate(function (k) { var a = JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(a.concat(["bad_ren", "bad_tsukasa", "bad_sora"]))); }, P + "endings-v1");
    await p.click("#ending-restart");
    await p.waitForTimeout(300);
    v = await until(p);
    ok(v.title === "闇" && v.choices.indexOf("声のする方へ") !== -1, "もう一度はじめから → 闇の場面に「声のする方へ」");
    await p.screenshot({ path: "/tmp/ahk-check/shot-dark.png" });
    await pick(p, "声のする方へ");
    await pick(p, "あの朝へ");
    await until(p);
    await p.screenshot({ path: "/tmp/ahk-check/shot-freeze.png" });
    await pick(p, "「止まって」と、ゆらに叫ぶ");
    v = await until(p);
    ok(v.ending && /TRUE END/.test(v.endName), "トゥルーエンドに到達：" + v.endName);
    await p.screenshot({ path: "/tmp/ahk-check/shot-true.png" });
    ok(p.errors.length === 0, "画面のエラーなし"); await p.context().close();
    console.log("合計 " + checks + " 件合格");
  } finally {
    await browser.close(); server.close();
  }
})().catch(function (e) { console.error(e); process.exit(1); });
```
