/*
 * 『あの日の声』（叩き台）物語データ。書式は .claude/skills/novel-work/references/story-format.md。
 *
 * ■ 流れ
 *   序章  p_morning ─next→ p_accident ─next→ p_dark（闇の場面）
 *           p_dark ─「目を開ける」→ 共通ルート
 *                  ─「声のする方へ」（requires flags.true_route）→ 終章（トゥルールート）
 *   共通  c_wake → c_class（空）→ c_council（蓮）→ c_library（司）→ c_courtyard（陽太）
 *           → c_search（誰の所を探すか）→ c_festival（準備を誰とするか）→ c_branch（後夜祭の前、誰の所へ行くか）
 *           c_branch ─ 4 人それぞれ → <id>_1 → <id>_2（山場の選択肢）→ <id>_3 ─next(関数)→ 結末 3 種
 *                    ─「四人のところへ」（requires 4 人全員 aff ≧ HAREM_MIN）→ h_1 → h_2 → end_harem
 *   終章  t_awake → t_fragments → t_hospital → t_plea → t_freeze（時間凍結・プレイヤーだけの選択肢）→ t_rescue → end_true
 *
 * ■ 状態
 *   vars.aff.<ren|tsukasa|yota|sora> … 人物ごとの好感度（0〜9）。エンジンの affection は 1 本だけなので使わない（HUD も隠す）
 *   flags.bad_<id>      … 山場でバッドの選択肢を選んだ
 *   flags.search / flags.festival … 共通ルートで誰を選んだか（本文の出し分けだけに使う）
 *   flags.freeze        … 時間凍結でどう助けたか（"pull"／"shout"）
 *
 * ■ 結末の振り分け（<id>_3 の next）
 *   flags.bad_<id> → end_bad_<id> ／ aff.<id> ≧ GOOD_MIN → end_good_<id> ／ それ以外 → end_normal_<id>
 *
 * ■ 周回をまたぐ解放（STORY.unlocks）
 *   seen_bad_<id> … そのバッドに到達済み（4 件）。4 つ目のバッドの直後の幕間「???」の判定に使う
 *   true_route    … 4 つのバッドすべてに到達済み → 闇の場面に「声のする方へ」
 *   幕間：バッドの結末の本文で、自分の seen_bad が無く、ほかの 3 つの seen_bad がそろっているときだけ、末尾に幕間のページを足す
 *   ※ 分岐の関数にはフラグ名・変数名をそのまま書く（点検ツールは関数のソースの s.flags.名前／s.vars.名前.人物 しか拾えない）
 *
 * ■ 演出ルール
 *   憑依先の女の子の顔は出さない（立ち絵を作らない。主人公の台詞は manifest に無い声だけの話者 yura）。
 *   本文でも顔の造作に触れない。別人の手がかりは髪型・ネイル・小物だけ（GIRLS）。地の文の「私」の声は全ルートで同じ。
 */
(function (root) {
  "use strict";

  var BOYS = ["ren", "tsukasa", "yota", "sora"];
  var GOOD_MIN = 4; // グッドに要る好感度
  var HAREM_MIN = 2; // ハーレムの選択肢に要る好感度（4 人全員）

  // 憑依先の女の子（顔は出さない。差はこの 3 点だけ）
  var GIRLS = {
    ren: { name: "桐谷澪", hair: "背中まで届く黒髪", nail: "透明なトップコート", item: "銀の細いブレスレット" },
    tsukasa: { name: "小野寺詩織", hair: "肩で内巻きにしたセミロング", nail: "淡いピンク", item: "桜の押し花の栞" },
    yota: { name: "早瀬ひなた", hair: "左で結んだサイドポニー", nail: "水色", item: "鞄の星のキーホルダー" },
    sora: { name: "柚木千夏", hair: "耳の下で切りそろえたショートボブ", nail: "赤", item: "黒いヘアピン二本" }
  };

  function say(who, text, o) {
    var p = { text: text, speaker: who };
    if (o) for (var k in o) p[k] = o[k];
    return p;
  }
  function plus(id, n) {
    var a = {};
    a[id] = n;
    return { vars: { aff: a } };
  }

  /**
   * バッドの結末の本文。fourth（4 つ目のバッド）なら末尾に幕間「？？？」を足す。
   * fourth の判定は各ルートの endBad.text の関数に、フラグ名をそのまま書く
   * （点検ツールは関数のソースに書かれた s.flags.名前 しか拾えないため）。
   */
  function withInterlude(pages, fourth) {
    var t = pages.slice();
    if (fourth) {
      t.push(
        { text: "――幕間「？？？」――", bg: "dark", hide: "*" },
        say("unknown", "……ねえ。そこにいるんでしょう。"),
        say("unknown", "四つ目。これで、四つ全部。あなたは最後まで、私の終わりを見てくれたね。"),
        say("unknown", "岐路に立つたび、聞こえていたの。私の代わりに迷ってくれる、あなたの声が。"),
        say("unknown", "だから、もう一度だけ最初から来て。暗いところで、声のする方へ。……待ってるから。"),
        "暗がりの向こうで、誰かがこちらを見ていた。画面の、こちら側を。"
      );
    }
    return t;
  }

  /** 1 人分のルート（<id>_1・<id>_2・<id>_3 と結末 3 つ）を作る */
  function route(scenes, id, R) {
    var g = GIRLS[id];
    scenes[id + "_1"] = {
      title: R.title1,
      chapter: "r_" + id,
      icon: "♡",
      theme: R.theme1,
      stage: { bg: R.bg1, hide: "*" },
      text: R.text1(g),
      choices: [
        { text: R.choice1[0], next: id + "_2", effects: plus(id, 1) },
        { text: R.choice1[1], next: id + "_2" }
      ]
    };
    var bad = {};
    bad["bad_" + id] = true;
    scenes[id + "_2"] = {
      title: R.title2,
      chapter: "r_" + id,
      icon: "♡",
      theme: R.theme2,
      stage: { bg: R.bg2 },
      text: R.text2(g),
      choices: [
        { text: R.choice2[0], next: id + "_3", effects: plus(id, 1) },
        { text: R.choice2[1], next: id + "_3" },
        { text: R.choice2[2], next: id + "_3", effects: { flags: bad } }
      ]
    };
    scenes[id + "_3"] = {
      title: R.title3,
      chapter: "r_" + id,
      icon: "♡",
      theme: R.theme2,
      text: R.text3,
      next: R.next3
    };
    scenes["end_normal_" + id] = {
      title: R.endNormal.title,
      chapter: "r_" + id,
      icon: "☆",
      theme: "evening",
      ending: { id: "normal_" + id, name: R.endNormal.name, kind: "normal" },
      text: R.endNormal.text
    };
    scenes["end_bad_" + id] = {
      title: R.endBad.title,
      chapter: "r_" + id,
      icon: "✕",
      theme: "night",
      fx: "dust",
      ending: { id: "bad_" + id, name: R.endBad.name, kind: "bad" },
      text: R.endBad.text
    };
    scenes["end_good_" + id] = {
      title: R.endGood.title,
      chapter: "r_" + id,
      icon: "♡",
      theme: "evening",
      fx: "petals",
      ending: { id: "good_" + id, name: R.endGood.name, kind: "another" },
      text: R.endGood.text
    };
  }

  // ===================================================================
  //  序章・共通ルート
  // ===================================================================
  var scenes = {
    p_morning: {
      title: "転校の朝",
      chapter: "prologue",
      icon: "◇",
      theme: "morning",
      stage: { bg: "street" },
      text: function (s) {
        var t = [
          "四月の風は、思っていたより冷たかった。",
          "この町に戻ってくるのは七年ぶり。小学校の途中で引っ越して、春から私立星見学園の二年生になる。",
          "新しい制服の袖を引っぱりながら、私は通学路を歩いていた。鞄には、小さな鈴のキーホルダー。昔、隣の家の男の子にもらったものだ。",
          "あの子は、もう私のことなんて覚えていないだろう。それでいい、と思う。新しい町で、新しい私を始めるんだから。"
        ];
        if (s.flags.true_route) t.push("――どうしてだろう。この朝を、前にも歩いた気がする。");
        t.push("交差点の信号が、青に変わった。");
        return t;
      },
      next: "p_accident"
    },
    p_accident: {
      title: "交差点",
      chapter: "prologue",
      icon: "◇",
      theme: "morning",
      enter: "shake",
      stage: { bg: "crossing" },
      text: [
        "横断歩道の真ん中で、鈴が鳴った。",
        { text: "耳をつんざくブレーキの音。振り向いたときには、もう遅かった。", fx: "flash" },
        "誰かの腕が、私の肩をつかんだ。強く引かれて、世界がひっくり返る。",
        "見えたのは、私と同じ星見学園の制服。紺のブレザーの背中と、伸ばされた手。",
        "その人の顔は、見えなかった。",
        "アスファルトの冷たさと、遠ざかる誰かの声。――大丈夫、と言われた気がした。"
      ],
      next: "p_dark"
    },
    p_dark: {
      title: "闇",
      chapter: "prologue",
      icon: "◇",
      theme: "dark",
      fx: "motes",
      stage: { bg: "dark" },
      text: function (s) {
        var t = [
          "暗い。",
          "上も下も分からない暗がりに、私は浮かんでいた。痛くはない。寒くもない。ただ、静かだった。",
          "助けてくれたあの人は、無事だったんだろうか。"
        ];
        if (s.flags.true_route) {
          t.push("遠くで、誰かが呼んでいる。光の届かない、ずっと向こうから。");
          t.push("その声を、私は知っている気がした。何度も、何度も、岐路で聞いた声だ。");
        } else {
          t.push("――目を開けなきゃ。そう思った。");
        }
        return t;
      },
      choices: [
        { text: "目を開ける", next: "c_wake" },
        {
          text: "声のする方へ",
          next: "t_awake",
          requires: function (s) {
            return !!s.flags.true_route;
          }
        }
      ]
    },

    c_wake: {
      title: "保健室",
      chapter: "common",
      icon: "◇",
      theme: "day",
      stage: { bg: "infirmary" },
      text: [
        "目を開けると、白い天井があった。",
        "消毒液のにおい。カーテン越しの光。星見学園の保健室だと、養護の先生が教えてくれた。",
        "怪我はひとつもない、と先生は言った。不思議なくらい、どこも痛くなかった。",
        "でも、助けてくれた人のことを聞いても、先生は首をかしげるばかりだった。",
        "同じ制服の、男の子。顔は見ていない。それだけを頼りに、私は探そうと決めた。――あの人に、お礼を言うために。"
      ],
      next: "c_class"
    },
    c_class: {
      title: "二年B組",
      chapter: "common",
      icon: "◇",
      theme: "day",
      stage: { bg: "classroom" },
      text: [
        "転校の挨拶は、思ったより短く終わった。",
        say("sora", "よっ、転校生。隣の席の三島空。困ったら何でも聞いて。購買の焼きそばパンの確保の仕方とか", { chara: "sora", expr: "smile" }),
        "軽い調子で笑う彼の机には、几帳面に色分けされたノートが積んであった。",
        say("sora", "……で、さっきから廊下ばっかり見てるけど、誰か探してる？", { expr: "normal" }),
        "――どう答えよう。そう迷ったとき、どこかで、誰かが一緒に考えてくれている気がした。"
      ],
      choices: [
        { text: "事故のことを正直に話す", next: "c_council", effects: { vars: { aff: { sora: 1 } }, flags: { told_sora: true } } },
        { text: "「なんでもない」とごまかす", next: "c_council" }
      ]
    },
    c_council: {
      title: "生徒会室",
      chapter: "common",
      icon: "◇",
      theme: "day",
      stage: { bg: "council", hide: "*" },
      text: function (s) {
        var t = [];
        if (s.flags.told_sora) t.push("空くんは笑わずに聞いてくれて、「生徒会なら事故の届けが出てるかも」と教えてくれた。");
        else t.push("転入の書類を出しに、私は放課後の生徒会室を訪ねた。");
        t.push(
          say("ren", "ようこそ、星見学園へ。生徒会長の藤堂蓮です。何でも頼ってくれていいよ", { chara: "ren", expr: "smile" }),
          "絵本から抜け出した王子様みたいな人だった。机の上の書類は一枚の乱れもなく、言葉はどれも丁寧で、隙がない。",
          "でも、差し出された手の指先に、インクの染みが少しだけ残っていた。",
          "――この人に、何を言おう。"
        );
        return t;
      },
      choices: [
        { text: "「無理していませんか」と聞く", next: "c_library", effects: plus("ren", 1) },
        { text: "書類だけ渡して、お礼を言う", next: "c_library" }
      ]
    },
    c_library: {
      title: "図書室",
      chapter: "common",
      icon: "◇",
      theme: "evening",
      stage: { bg: "library_evening", hide: "*" },
      text: [
        "古い新聞なら図書室にある、と聞いて、私は旧校舎の図書室へ向かった。",
        "西日の差す閲覧席に、三年生の先輩がひとり座っていた。",
        say("tsukasa", "……閉館は五時だ。探し物なら手短に", { chara: "tsukasa", expr: "normal" }),
        "久遠司。図書委員の先輩だと、カウンターの名札で知った。冷たい声なのに、本を戻す手つきはやさしかった。",
        say("tsukasa", "新聞なら三日分しか置いていない。それより前は閉架だ。……何を調べたい？"),
        "――答えを、選ばなきゃ。"
      ],
      choices: [
        { text: "「あの日の交差点のことを」と打ち明ける", next: "c_courtyard", effects: plus("tsukasa", 1) },
        { text: "「やっぱりいいです」と引き下がる", next: "c_courtyard" }
      ]
    },
    c_courtyard: {
      title: "中庭",
      chapter: "common",
      icon: "◇",
      theme: "day",
      stage: { bg: "courtyard", hide: "*" },
      text: [
        "翌日の昼休み、中庭のベンチでお弁当を広げていると、一年生の男の子が駆け寄ってきた。",
        say("yota", "先輩、それ玉子焼きですか！？　ひとつだけ……ひとつだけください！", { chara: "yota", expr: "smile" }),
        "朝比奈陽太。人懐っこく笑う彼は、断る間もなく隣に座った。",
        say("yota", "あ、もしかして噂の転校生の先輩？　事故に遭いかけたって。……大丈夫でした？", { expr: "normal" }),
        "急に真剣になった声に、少しだけ驚いた。"
      ],
      choices: [
        { text: "玉子焼きを分けてあげる", next: "c_search", effects: plus("yota", 1) },
        { text: "「自分で食べたいの」と笑う", next: "c_search" }
      ]
    },
    c_search: {
      title: "探しもの",
      chapter: "common",
      icon: "◇",
      theme: "evening",
      stage: { bg: "corridor_evening", hide: "*" },
      text: [
        "四人と知り合って、一週間が過ぎた。",
        "助けてくれた人は、まだ見つからない。名乗り出る人もいないし、事故の届けも出ていなかった。",
        "それでも、手がかりはあの制服だけじゃない。あの人の声。大丈夫、と言った、あの声。",
        "今日の放課後は、どこを探そう。",
        "――耳の奥で、また誰かが迷っている。私の代わりに。"
      ],
      choices: [
        { text: "生徒会室で記録を調べる", next: "c_festival", effects: { vars: { aff: { ren: 1 } }, flags: { search: "ren" } } },
        { text: "図書室で古い記事を探す", next: "c_festival", effects: { vars: { aff: { tsukasa: 1 } }, flags: { search: "tsukasa" } } },
        { text: "中庭で一年生に聞いて回る", next: "c_festival", effects: { vars: { aff: { yota: 1 } }, flags: { search: "yota" } } },
        { text: "教室で空くんに相談する", next: "c_festival", effects: { vars: { aff: { sora: 1 } }, flags: { search: "sora" } } }
      ]
    },
    c_festival: {
      title: "星見祭の準備",
      chapter: "common",
      icon: "◇",
      theme: "evening",
      stage: { bg: "festival" },
      text: function (s) {
        var met = {
          ren: "生徒会室では、蓮先輩が遅くまで書類をめくってくれた。",
          tsukasa: "図書室では、司先輩が黙って閉架の目録を出してくれた。",
          yota: "中庭では、陽太くんが一年生を何人も連れてきてくれた。",
          sora: "教室では、空くんが事故の時間と場所を地図に書き込んでくれた。"
        };
        var t = [met[s.flags.search] || "放課後の校舎を、私はひとりで歩き回った。"];
        t.push(
          "手がかりは増えなかった。けれど、ひとりで探しているわけじゃないことが、少しうれしかった。",
          "五月。学園は星見祭の準備で浮き立っていた。生徒会も、図書委員も、一年生も、二年B組も、誰もが私に手伝ってほしいと言う。",
          "――誰と過ごそう。"
        );
        return t;
      },
      choices: [
        { text: "四人みんなの手伝いを少しずつする", next: "c_branch", effects: { vars: { aff: { ren: 1, tsukasa: 1, yota: 1, sora: 1 } }, flags: { festival: "all" } } },
        { text: "生徒会の看板づくりを手伝う", next: "c_branch", effects: { vars: { aff: { ren: 1 } }, flags: { festival: "ren" } } },
        { text: "図書委員の古本市を手伝う", next: "c_branch", effects: { vars: { aff: { tsukasa: 1 } }, flags: { festival: "tsukasa" } } },
        { text: "一年生の屋台を手伝う", next: "c_branch", effects: { vars: { aff: { yota: 1 } }, flags: { festival: "yota" } } },
        { text: "二年B組の展示を手伝う", next: "c_branch", effects: { vars: { aff: { sora: 1 } }, flags: { festival: "sora" } } }
      ]
    },
    c_branch: {
      title: "後夜祭の前",
      chapter: "common",
      icon: "◇",
      theme: "night",
      fx: "motes",
      stage: { bg: "festival" },
      text: function (s) {
        var t = [
          "星見祭の一日目が終わった。校庭ではキャンプファイヤーの準備が始まっている。",
          "スマートフォンが四回、続けて震えた。四人から、それぞれに。",
          "『少し話せる？』――同じ言葉が、四つ。"
        ];
        if (s.vars.aff.ren >= HAREM_MIN && s.vars.aff.tsukasa >= HAREM_MIN && s.vars.aff.yota >= HAREM_MIN && s.vars.aff.sora >= HAREM_MIN) t.push("誰かひとりを選ぶなんて、今の私にはできない気がした。――四人とも、大切だった。");
        t.push("助けてくれたあの人を探していたはずなのに、気づけば、私の胸は別の名前でいっぱいだった。", "――どこへ行こう。");
        return t;
      },
      choices: [
        { text: "屋上の蓮先輩のところへ", next: "ren_1" },
        { text: "図書室の司先輩のところへ", next: "tsukasa_1" },
        { text: "中庭の陽太くんのところへ", next: "yota_1" },
        { text: "教室の空くんのところへ", next: "sora_1" },
        {
          text: "四人のところへ",
          next: "h_1",
          requires: function (s) {
            return s.vars.aff.ren >= HAREM_MIN && s.vars.aff.tsukasa >= HAREM_MIN && s.vars.aff.yota >= HAREM_MIN && s.vars.aff.sora >= HAREM_MIN;
          }
        }
      ]
    },

    // ===================================================================
    //  ハーレム
    // ===================================================================
    h_1: {
      title: "キャンプファイヤー",
      chapter: "harem",
      icon: "♡",
      theme: "night",
      fx: "embers",
      stage: { bg: "campfire", hide: "*" },
      text: [
        "校庭の真ん中で、炎が高く上がっていた。",
        "私が四人に送った返事は、同じ一言だった。『みんなで話そう』。",
        { text: "「……君らしいね」", speaker: "ren", show: [{ chara: "ren", pos: "left", expr: "smile" }, { chara: "sora", pos: "right", expr: "smile" }] },
        say("sora", "だよな。抜け駆けしようとしたの、全員バレバレ"),
        { text: "「先輩、ずるいです。僕だって二人で話したかったのに」", speaker: "yota", hide: ["ren"], chara: "yota", pos: "left", expr: "sad" },
        { text: "「……静かにしろ。話が始まらない」", speaker: "tsukasa", hide: ["sora"], chara: "tsukasa", pos: "right", expr: "normal" },
        "炎の明かりの中で、四人が笑っていた。忙しすぎて、窓ガラスに映る自分の髪を気にする暇もなかった。"
      ],
      next: "h_2"
    },
    h_2: {
      title: "四つの手",
      chapter: "harem",
      icon: "♡",
      theme: "night",
      fx: "embers",
      text: [
        { text: "フォークダンスの曲が流れ出す。最初に手を差し出したのは、蓮先輩だった。", hide: "*", chara: "ren", pos: "center", expr: "smile" },
        say("ren", "一曲目は僕でいいかな。――二曲目からは、順番に譲るよ"),
        { text: "「二曲目は僕です！」", speaker: "yota", chara: "yota", pos: "left", expr: "smile" },
        { text: "「じゃ、三曲目」", speaker: "sora", chara: "sora", pos: "right", expr: "smile" },
        "司先輩は少し離れたところで腕を組んでいた。",
        { text: "「……最後の曲が、いちばん長い」", speaker: "tsukasa", hide: ["ren"], chara: "tsukasa", pos: "center", expr: "smile" },
        "四人の手は、それぞれ違う温かさだった。"
      ],
      next: "end_harem"
    },
    end_harem: {
      title: "星見祭の夜",
      chapter: "harem",
      icon: "♡",
      theme: "night",
      fx: "petals",
      ending: { id: "harem", name: "HAREM END「四つの星」", kind: "another" },
      text: [
        { text: "曲が終わるたび、私は誰かの手を取った。", show: [{ chara: "ren", pos: "left", expr: "smile" }, { chara: "tsukasa", pos: "center", expr: "smile" }, { chara: "yota", pos: "right", expr: "smile" }] },
        "空くんは「俺は三曲目で満足」と言って、少し離れた所で手を振っていた。",
        "誰かひとりを選ぶ日が、いつか来るのかもしれない。でも、今夜だけは。",
        "炎が星空へ昇っていく。私は、四つの名前を胸の中で順番に呼んだ。",
        "――ねえ。あの日私を助けてくれた人も、この中にいるのかな。",
        "その答えだけは、最後まで分からなかった。"
      ]
    },

    // ===================================================================
    //  終章（トゥルールート）
    // ===================================================================
    t_awake: {
      title: "目覚め",
      chapter: "true",
      icon: "✧",
      theme: "true",
      fx: "motes",
      stage: { bg: "crossing" },
      text: [
        "声を追って、暗がりを抜けた。",
        "立っていたのは、あの交差点だった。信号が青から赤へ、赤から青へ、誰も気にせず変わっていく。",
        "ガードレールの根元に、花束が置かれていた。白い花と、小さな鈴のキーホルダー。",
        "通りかかった女の子が、私の体をすり抜けて歩いていった。",
        "……そうか。",
        "私は、あの朝ここで死んだんだ。"
      ],
      next: "t_fragments"
    },
    t_fragments: {
      title: "四つの断片",
      chapter: "true",
      icon: "✧",
      theme: "true",
      fx: "dust",
      stage: { bg: "dark" },
      text: [
        "胸の奥で、何かがほどけた。四つの記憶が、順番に流れ込んでくる。",
        { text: "――屋上。「あなたがあの人だって言って」とすがった私の手首で、銀の細いブレスレットが鳴った。", bg: "rooftop" },
        { text: "風に流れた黒くて長い髪。透明に光る爪。……私の爪は、あんなふうに塗ったことがない。" },
        { text: "――閉架書庫。開いた新聞を押さえていた指先は、淡いピンクだった。挟んであった桜の押し花の栞。", bg: "archive" },
        { text: "――中庭。「ずっとそばにいる」と約束した私の肩で、サイドポニーが跳ねた。水色の爪と、星のキーホルダー。", bg: "courtyard" },
        { text: "――夜の交差点。ショートボブの耳元に、黒いヘアピンが二本。赤い爪が、冷たい手すりを握っていた。", bg: "crossing" },
        { text: "四人の女の子。桐谷澪さん。小野寺詩織さん。早瀬ひなたさん。柚木千夏さん。", bg: "dark" },
        "私はずっと、あの子たちの体を借りて、恋をしていたんだ。終わるたびに追い出されて、そのたびにひとつずつ、こうして思い出を置いてきた。",
        "四つそろって、ようやく分かった。"
      ],
      next: "t_hospital"
    },
    t_hospital: {
      title: "病室",
      chapter: "true",
      icon: "✧",
      theme: "true",
      stage: { bg: "hospital", hide: "*" },
      text: [
        "最後に、もうひとつだけ確かめたかった。助けてくれた、あの人のこと。",
        "市立病院の四階。名札には、相沢晴樹とあった。",
        "包帯だらけの男の子が、眠っていた。ベッドの脇に、星見学園の紺のブレザーが掛かっている。",
        "相沢、晴樹。――隣の家の、晴樹くん。",
        "あの朝、私の肩をつかんだのは、彼だったんだ。七年ぶりの町で、私に気づいて、走ってきてくれた。",
        say("haruki", "……ゆら……ごめん……間に合わなくて……"),
        "眠ったまま、彼は私の名前を呼んだ。私の声は、もう誰にも届かないのに。"
      ],
      next: "t_plea"
    },
    t_plea: {
      title: "あなたへ",
      chapter: "true",
      icon: "✧",
      theme: "dark",
      fx: "motes",
      stage: { bg: "dark", hide: "*" },
      text: [
        "暗がりに戻って、私はようやく気づいた。",
        "岐路に立つたび、聞こえていた声。私の代わりに迷って、選んでくれた誰か。",
        say("yura", "……あなた、だったんだね。"),
        say("yura", "ずっと、画面の向こうから見ていてくれた。四つの終わりを、全部。"),
        say("yura", "お願い。もう一度だけ、あの朝へ連れていって。私には、もう何も選べないの。"),
        say("yura", "あなたにしか、選べない。")
      ],
      choices: [{ text: "あの朝へ", next: "t_freeze" }]
    },
    t_freeze: {
      title: "凍った朝",
      chapter: "true",
      icon: "✧",
      theme: "true",
      enter: "flash",
      stage: { bg: "crossing", hide: "*" },
      text: function (s) {
        if (s.flags.freeze_wait)
          return ["時間は止まったままだ。トラックも、晴樹くんも、私も。", say("yura", "……大丈夫。待ってる。あなたが選んでくれるまで。")];
        return [
          "四月の風。鈴の音。青に変わった信号。",
          "横断歩道の真ん中で、ブレーキの音が鳴る――その瞬間、すべてが止まった。",
          "宙に浮いたままの桜の花びら。走り出した姿勢のまま固まった、紺のブレザーの男の子。",
          say("yura", "ここから先は、私には選べない。……お願い。"),
          "選択肢が、私ではない誰かの前に現れた。"
        ];
      },
      choices: [
        { text: "ゆらの腕を引いて、歩道へ戻す", next: "t_rescue", effects: { flags: { freeze: "pull" } } },
        { text: "「止まって」と、ゆらに叫ぶ", next: "t_rescue", effects: { flags: { freeze: "shout" } } },
        { text: "まだ選べない", next: "t_freeze", effects: { flags: { freeze_wait: true } } }
      ]
    },
    t_rescue: {
      title: "あの日の声",
      chapter: "true",
      icon: "✧",
      theme: "morning",
      enter: "shake",
      stage: { bg: "crossing" },
      text: function (s) {
        var t = [];
        if (s.flags.freeze === "shout") t.push("――止まって。", "誰かの声が、耳の奥で響いた。私は横断歩道の手前で、足を止めた。");
        else t.push("――見えない手が、私の腕を後ろへ引いた。", "私は一歩下がって、歩道の縁石につまずいた。");
        t.push(
          "目の前を、トラックが走り抜けていった。",
          { text: "「――ゆら！」", speaker: "haruki", chara: "haruki", pos: "center", expr: "normal" },
          "走ってきた男の子が、息を切らして私の前で止まった。紺のブレザー。伸ばしかけた手。",
          "今度は、ちゃんと見えた。",
          say("haruki", "その鈴……やっぱり、ゆらだ。七年ぶりなのに、すぐ分かった", { expr: "smile" })
        );
        return t;
      },
      next: "end_true"
    },
    end_true: {
      title: "ありがとう",
      chapter: "true",
      icon: "✧",
      theme: "morning",
      fx: "petals",
      ending: { id: "true", name: "TRUE END「あの日の声」", kind: "true" },
      stage: { bg: "street", show: [{ chara: "haruki", pos: "center", expr: "smile" }] },
      text: [
        "二人で並んで、星見学園への坂をのぼった。",
        say("haruki", "ずっと会いたかった。引っ越したあの日、言えなかったことがあるんだ"),
        say("haruki", "――好きだよ。あの頃から、ずっと"),
        "私の手は、もう誰の体も借りていない。何も塗っていない、私の爪。肩までの、私の髪。",
        say("yura", "……私も。"),
        "鈴が、小さく鳴った。",
        { text: "ねえ、画面の向こうのあなた。", hide: "*" },
        say("yura", "あの朝を選んでくれて、ありがとう。あなたの声が、私をここまで連れてきてくれた。"),
        say("yura", "――本当に、ありがとう。")
      ]
    }
  };

  // ===================================================================
  //  4 ルート
  // ===================================================================
  route(scenes, "ren", {
    title1: "生徒会室の窓",
    theme1: "evening",
    bg1: "council",
    text1: function (g) {
      return [
        "屋上へ向かう途中、生徒会室の明かりがまだついていた。",
        { text: "蓮先輩は、ひとりで明日の進行表を直していた。", chara: "ren", expr: "normal" },
        say("ren", "ああ、来てくれたんだ。屋上で待つつもりが、つい手が止まらなくてね"),
        "暗くなった窓ガラスに、私の" + g.hair + "が映っていた。",
        "書類を受け取ろうと伸ばした指先で、" + g.nail + "が蛍光灯を跳ね返す。手首では" + g.item + "が小さく鳴った。",
        "いつ塗ったんだっけ。一瞬だけそう思って、すぐに忘れた。",
        say("ren", "完璧な会長でいるのも、楽じゃないよ。……なんて、君にしか言わないけど", { expr: "smile" }),
        "――何と言おう。"
      ];
    },
    choice1: ["「今日はもう休んでください」と書類を取り上げる", "「さすが会長です」と笑う"],
    title2: "屋上の夜",
    theme2: "night",
    bg2: "rooftop",
    text2: function () {
      return [
        "屋上には、キャンプファイヤーの火の粉が届いていた。",
        { text: "「ひとつ、聞いてもいいかな」", speaker: "ren", chara: "ren", expr: "normal" },
        say("ren", "君がずっと探している人。交差点で君を助けた人。……あれは、僕じゃない"),
        say("ren", "朝のあの時間、僕は生徒会室にいた。――残念だな。僕だったら、よかったのに", { expr: "sad" }),
        "完璧な人の声が、ほんの少しだけ揺れていた。",
        "――ここが、岐路だ。耳の奥で、誰かが息をひそめている。"
      ];
    },
    choice2: ["「完璧じゃない先輩が好きです」と伝える", "何も言わず、隣で火を見る", "「あなたがあの人だと言って」とすがる"],
    title3: "火の粉",
    text3: function (s) {
      if (s.flags.bad_ren) return [{ text: "先輩の制服の袖を、私は強くつかんでいた。", chara: "ren", expr: "sad" }];
      return s.vars.aff.ren >= GOOD_MIN ? [{ text: "蓮先輩は目を見開いて、それから、子どもみたいに笑った。", chara: "ren", expr: "smile" }] : [{ text: "火の粉が消えるまで、私たちは黙って並んでいた。", chara: "ren", expr: "normal" }];
    },
    next3: function (s) {
      if (s.flags.bad_ren) return "end_bad_ren";
      return s.vars.aff.ren >= GOOD_MIN ? "end_good_ren" : "end_normal_ren";
    },
    endNormal: {
      title: "生徒会の仲間",
      name: "NORMAL END「会長の隣」",
      text: [
        { text: "星見祭が終わって、私は生徒会の手伝いを続けることになった。", chara: "ren", expr: "smile" },
        say("ren", "君がいると、仕事が早く終わる。……助かってるよ、本当に"),
        "先輩の隣は、居心地がよかった。それ以上の言葉は、どちらからも出なかった。",
        "助けてくれたあの人は、まだ見つからない。"
      ]
    },
    endBad: {
      title: "言わせた言葉",
      name: "BAD END「借りものの王子様」",
      // 4 つ目のバッド：自分は未到達で、ほかの 3 つは到達済み（その周の初期フラグ）
      text: function (s) {
        return withInterlude(
          [
            { text: "「……分かった。僕が、あの人だ」", speaker: "ren", chara: "ren", expr: "sad" },
            "先輩はやさしいから、そう言ってくれた。その声が、あの日の声と少しも似ていないことに、私は気づいていた。",
            { text: "その瞬間、足元がふっと消えた。", hide: "*", fx: "shake" },
            "引きはがされるように、私は何かから外へ落ちていった。",
            "最後に見えたのは、先輩の袖をつかむ自分の手。" + GIRLS.ren.nail + "の爪と、" + GIRLS.ren.item + "。",
            "――私の手、だったろうか。",
            { text: "暗くなる。何もかも。", bg: "dark" }
          ],
          !s.flags.seen_bad_ren && !!s.flags.seen_bad_tsukasa && !!s.flags.seen_bad_yota && !!s.flags.seen_bad_sora
        );
      }
    },
    endGood: {
      title: "王子様の素顔",
      name: "GOOD END「完璧じゃない君へ」",
      text: [
        { text: "「僕の弱いところを、好きだと言ってくれたのは君が初めてだ」", speaker: "ren", chara: "ren", expr: "smile" },
        say("ren", "君を好きになってもいいかな。――いや、もう好きなんだけど"),
        "先輩の指が、私の" + GIRLS.ren.hair + "をそっとすくった。",
        say("ren", "きれいな髪だね。初めて会った日から、ずっと思ってた"),
        "夜風の中で、私はうなずいた。助けてくれたあの人のことは、少しだけ遠くなった。"
      ]
    }
  });

  route(scenes, "tsukasa", {
    title1: "閉館後の図書室",
    theme1: "evening",
    bg1: "library_evening",
    text1: function (g) {
      return [
        "後夜祭の喧騒が嘘みたいに、旧校舎は静かだった。",
        { text: "司先輩は、閉館後の図書室で、返却された本を一冊ずつ棚に戻していた。", chara: "tsukasa", expr: "normal" },
        say("tsukasa", "……来たのか。祭りはいいのか"),
        "ガラス戸に映る私の髪は、" + g.hair + "。本を受け取る指先は、" + g.nail + "だった。",
        "鞄から、" + g.item + "がのぞいていた。いつから持っていたんだろう。気にしたのは、ほんの一瞬だけ。",
        say("tsukasa", "前に、交差点のことを調べたいと言っていたな。……閉架に、あの日の新聞がある"),
        "――どうしよう。"
      ];
    },
    choice1: ["「先輩と一緒に読みたいです」と頼む", "「今日はやめておきます」と首を振る"],
    title2: "閉架の鍵",
    theme2: "night",
    bg2: "archive",
    text2: function () {
      return [
        "閉架書庫の扉の前で、先輩は鍵束を握ったまま立ち止まった。",
        { text: "「ひとつ言っておく。俺は、あの日の朝、交差点にはいなかった」", speaker: "tsukasa", chara: "tsukasa", expr: "normal" },
        say("tsukasa", "君が探しているのが俺じゃないことは分かってる。それでも――君が何を探しているのか、知りたいと思った"),
        "冷たい声の奥で、何かが震えていた。",
        "――ここが、岐路だ。どこかで、誰かが私の代わりに息をのむ。"
      ];
    },
    choice2: ["「探しているのは、先輩かもしれません」と言う", "黙って先輩の隣に立つ", "鍵を取って、ひとりで閉架を開ける"],
    title3: "古い紙のにおい",
    text3: function (s) {
      if (s.flags.bad_tsukasa) return [{ text: "先輩の制止を振り切って、私は暗い書庫へ入った。", hide: "*" }];
      return s.vars.aff.tsukasa >= GOOD_MIN ? [{ text: "先輩は鍵束を下ろして、少しだけ笑った。初めて見る顔だった。", chara: "tsukasa", expr: "smile" }] : [{ text: "結局、私たちは扉を開けずに、閲覧席で並んで本を読んだ。", chara: "tsukasa", expr: "normal" }];
    },
    next3: function (s) {
      if (s.flags.bad_tsukasa) return "end_bad_tsukasa";
      return s.vars.aff.tsukasa >= GOOD_MIN ? "end_good_tsukasa" : "end_normal_tsukasa";
    },
    endNormal: {
      title: "閲覧席",
      name: "NORMAL END「栞のあいだ」",
      text: [
        { text: "それから毎日、閉館までの一時間を、私は図書室で過ごした。", chara: "tsukasa", expr: "normal" },
        say("tsukasa", "……その本、読み終わったら感想を聞かせろ"),
        "それだけの約束が、ページをめくるたびに少しずつ増えていった。",
        "あの日の新聞は、まだ閉架の奥にある。"
      ]
    },
    endBad: {
      title: "閉架の奥",
      name: "BAD END「読んではいけない記事」",
      // 4 つ目のバッド：自分は未到達で、ほかの 3 つは到達済み（その周の初期フラグ）
      text: function (s) {
        return withInterlude(
          [
            "埃をかぶった新聞の束を、私は一枚ずつめくった。",
            "四月の地方版。交差点の事故。――『星見学園に転入予定の女子生徒（16）が』",
            "名前のところだけ、にじんで読めなかった。",
            { text: "息ができない。紙が、指の間からすり抜けていく。", fx: "shake" },
            "新聞を押さえていた指先は、" + GIRLS.tsukasa.nail + "。床に落ちた" + GIRLS.tsukasa.item + "。",
            "――私の、だったろうか。",
            { text: "扉の向こうで、先輩が誰かの名前を呼んでいた。私のじゃない名前を。", bg: "dark" }
          ],
          !s.flags.seen_bad_tsukasa && !!s.flags.seen_bad_ren && !!s.flags.seen_bad_yota && !!s.flags.seen_bad_sora
        );
      }
    },
    endGood: {
      title: "返却期限",
      name: "GOOD END「貸出期限のない恋」",
      text: [
        { text: "「探し物が見つかるまで、ここに通えばいい」", speaker: "tsukasa", chara: "tsukasa", expr: "smile" },
        say("tsukasa", "……見つかったあとも、来てくれるとうれしい"),
        "先輩は、私の" + GIRLS.tsukasa.item + "を本の間から抜いて、手のひらに載せてくれた。",
        say("tsukasa", "落としていた。大事なものなんだろう"),
        "大事なもの。そうだったかな、と思いながら、私はそれを握りしめた。"
      ]
    }
  });

  route(scenes, "yota", {
    title1: "中庭のベンチ",
    theme1: "night",
    bg1: "courtyard_night",
    text1: function (g) {
      return [
        "中庭のベンチで、陽太くんは屋台の残りのりんご飴を二本持って待っていた。",
        { text: "「先輩！　来てくれた！　はい、これ。一本は先輩の」", speaker: "yota", chara: "yota", expr: "smile" },
        "受け取ろうとして、自分の指先が目に入った。" + g.nail + "の爪。",
        "噴水の水面に、" + g.hair + "が揺れている。鞄では" + g.item + "が街灯を映していた。",
        "陽太くんの好きな色だね、と言われて、そうだったかな、と笑った。",
        say("yota", "先輩、明日もここ来てくれます？　来てくれないと、僕、拗ねますよ", { expr: "normal" }),
        "――どうしよう。"
      ];
    },
    choice1: ["「明日も来るね」と笑う", "「考えておく」とはぐらかす"],
    title2: "噴水の前",
    theme2: "night",
    bg2: "courtyard_night",
    text2: function () {
      return [
        { text: "りんご飴を食べ終えたころ、陽太くんが急に黙った。", chara: "yota", expr: "sad" },
        say("yota", "先輩。僕、ほんとは甘えてるふりしてるだけなんです。置いていかれるのが、怖いから"),
        say("yota", "小さいころ、兄ちゃんが事故で……だから先輩が事故に遭いかけたって聞いて、すごく怖かった"),
        "いつも明るい声が、ほんの少しかすれていた。",
        "――ここが、岐路だ。耳の奥で、誰かが答えを待っている。"
      ];
    },
    choice2: ["「怖いなら、怖いって言っていいよ」と手を握る", "黙って頭をなでる", "「ずっとそばにいる」と約束する"],
    title3: "りんご飴の棒",
    text3: function (s) {
      if (s.flags.bad_yota) return [{ text: "「……本当に？」と、陽太くんが小指を差し出した。", chara: "yota", expr: "smile" }];
      return s.vars.aff.yota >= GOOD_MIN ? [{ text: "陽太くんは私の手を握り返して、泣きそうな顔で笑った。", chara: "yota", expr: "smile" }] : [{ text: "陽太くんはくすぐったそうに目を細めて、それ以上は何も言わなかった。", chara: "yota", expr: "normal" }];
    },
    next3: function (s) {
      if (s.flags.bad_yota) return "end_bad_yota";
      return s.vars.aff.yota >= GOOD_MIN ? "end_good_yota" : "end_normal_yota";
    },
    endNormal: {
      title: "かわいい後輩",
      name: "NORMAL END「拗ねる後輩」",
      text: [
        { text: "次の日も、その次の日も、陽太くんは中庭で私を待っていた。", chara: "yota", expr: "smile" },
        say("yota", "先輩、今日の玉子焼きは何味ですか？"),
        "かわいい後輩。今はまだ、それでいいのかもしれない。",
        "助けてくれたあの人のことは、少しずつ思い出さなくなっていた。"
      ]
    },
    endBad: {
      title: "指切り",
      name: "BAD END「守れない約束」",
      // 4 つ目のバッド：自分は未到達で、ほかの 3 つは到達済み（その周の初期フラグ）
      text: function (s) {
        return withInterlude(
          [
            "小指をからめた、その瞬間だった。",
            { text: "からめたはずの指が、ほどけていく。", fx: "shake" },
            { text: "「先輩……？　先輩、どうしたんですか、先輩！」", speaker: "yota", chara: "yota", expr: "sad" },
            "陽太くんの声が遠い。ずっとそばにいる、なんて。私には、最初から言えない約束だったんだ。",
            "最後に見えたのは、ほどけた小指の" + GIRLS.yota.nail + "と、" + GIRLS.yota.item + "。",
            "――私の、だったろうか。",
            { text: "噴水の音だけが、暗がりに残った。", hide: "*", bg: "dark" }
          ],
          !s.flags.seen_bad_yota && !!s.flags.seen_bad_ren && !!s.flags.seen_bad_tsukasa && !!s.flags.seen_bad_sora
        );
      }
    },
    endGood: {
      title: "明日の約束",
      name: "GOOD END「甘えん坊の本音」",
      text: [
        { text: "「先輩。……好きです。甘えたいからじゃなくて、本気で」", speaker: "yota", chara: "yota", expr: "smile" },
        say("yota", "だから、明日のことだけ約束してください。明日も、ここで会うって"),
        "明日のことだけ。それなら、私にも約束できる気がした。",
        "風が吹いて、" + GIRLS.yota.hair + "が揺れた。陽太くんがそれを見て、先輩らしい髪型、と笑った。",
        "私はうなずいて、陽太くんの手を握った。"
      ]
    }
  });

  route(scenes, "sora", {
    title1: "放課後の教室",
    theme1: "evening",
    bg1: "classroom_evening",
    text1: function (g) {
      return [
        "二年B組の教室に、空くんはひとりで残っていた。",
        { text: "「お、来た来た。後夜祭サボって、俺と教室デート？」", speaker: "sora", chara: "sora", expr: "smile" },
        "黒板には、あの交差点の地図が描かれていた。信号の時間、車の流れ、事故の時刻まで、細かく。",
        "チョークを受け取った私の指先は、" + g.nail + "。黒板の脇の鏡に、" + g.hair + "と" + g.item + "が映っていた。",
        "いつもの私だ。――そう思うのに、ほんの少しだけ、引っかかった。",
        say("sora", "あの信号、歩行者用の青が短すぎんだよ。署名集めて、市に出そうと思ってさ", { expr: "normal" }),
        "――どう答えよう。"
      ];
    },
    choice1: ["「手伝わせて」と署名用紙を受け取る", "「空くんって意外と真面目だね」とからかう"],
    title2: "夜の帰り道",
    theme2: "night",
    bg2: "crossing_night",
    text2: function () {
      return [
        "帰り道、空くんは遠回りして、あの交差点の前で立ち止まった。",
        { text: "「白状すると、俺さ。あの朝、ここにいたんだ」", speaker: "sora", chara: "sora", expr: "sad" },
        say("sora", "見てただけ。動けなかった。誰かが走っていって――気づいたら、終わってた"),
        say("sora", "だから、お前を助けたのは俺じゃない。……ごめんな"),
        "軽い声のまま、空くんは手すりを強く握っていた。",
        "――ここが、岐路だ。耳の奥の誰かが、私と一緒に立ちすくむ。"
      ];
    },
    choice2: ["「話してくれてありがとう」と手すりの手に触れる", "黙って信号が変わるのを待つ", "「あの人を探しに行く」と交差点へ駆け出す"],
    title3: "赤信号",
    text3: function (s) {
      if (s.flags.bad_sora) return [{ text: "「おい、待て、赤だぞ！」", speaker: "sora", chara: "sora", expr: "sad" }];
      return s.vars.aff.sora >= GOOD_MIN ? [{ text: "空くんは、ゆっくりと手すりから手を離した。", chara: "sora", expr: "smile" }] : [{ text: "信号が三回変わるまで、私たちはそこに立っていた。", chara: "sora", expr: "normal" }];
    },
    next3: function (s) {
      if (s.flags.bad_sora) return "end_bad_sora";
      return s.vars.aff.sora >= GOOD_MIN ? "end_good_sora" : "end_normal_sora";
    },
    endNormal: {
      title: "署名用紙",
      name: "NORMAL END「隣の席の真面目くん」",
      text: [
        { text: "署名は、一か月で三百人分集まった。", chara: "sora", expr: "smile" },
        say("sora", "お前のおかげ。……なーんて、照れるから言わねえけど"),
        "隣の席の空くんは、相変わらず軽くて、相変わらず真面目だった。",
        "あの交差点の信号は、夏休みの前に少しだけ長くなった。"
      ]
    },
    endBad: {
      title: "夜の交差点",
      name: "BAD END「青を待てない」",
      // 4 つ目のバッド：自分は未到達で、ほかの 3 つは到達済み（その周の初期フラグ）
      text: function (s) {
        return withInterlude(
          [
            "横断歩道の真ん中で、私は振り向いた。",
            { text: "ヘッドライトが、白く膨らむ。", fx: "flash" },
            "――知っている。この光を、私は前にも見た。",
            "最後に見えたのは、手すりから離れた自分の手の" + GIRLS.sora.nail + "い爪。耳元の" + GIRLS.sora.item + "。",
            "――私の、だったろうか。",
            { text: "空くんが私を呼んでいた。私の知らない名前で。", hide: "*", bg: "dark" }
          ],
          !s.flags.seen_bad_sora && !!s.flags.seen_bad_ren && !!s.flags.seen_bad_tsukasa && !!s.flags.seen_bad_yota
        );
      }
    },
    endGood: {
      title: "青信号",
      name: "GOOD END「冗談じゃない言葉」",
      text: [
        { text: "「なあ。冗談に聞こえないように言うの、むずいんだけど」", speaker: "sora", chara: "sora", expr: "normal" },
        say("sora", "好きだ。――はい、今の本気。笑うなよ", { expr: "smile" }),
        "信号が青に変わった。空くんは私の手を取って、ゆっくり横断歩道を渡った。",
        "渡りきったところで、彼は私の" + GIRLS.sora.item + "を直してくれた。",
        say("sora", "ずれてた。……似合ってる、それ"),
        "あの朝のことは、もう怖くなかった。"
      ]
    }
  });

  var STORY = {
    start: "p_morning",
    maxShards: 0,
    maxAffection: 0, // 好感度は人物ごとの vars.aff（HUD には出せないので隠す）
    endingCount: 14,
    vars: {
      aff: { initial: 0, min: 0, max: 9, per: BOYS }
    },
    unlocks: {
      seen_bad_ren: { endings: ["bad_ren"] },
      seen_bad_tsukasa: { endings: ["bad_tsukasa"] },
      seen_bad_yota: { endings: ["bad_yota"] },
      seen_bad_sora: { endings: ["bad_sora"] },
      true_route: { endings: ["bad_ren", "bad_tsukasa", "bad_yota", "bad_sora"] }
    },
    cast: {
      yura: { name: "ゆら", color: "#f6c6d6", chara: "yura" },
      ren: { name: "藤堂蓮", color: "#c9b6ff", chara: "ren" },
      tsukasa: { name: "久遠司", color: "#9fc4ff", chara: "tsukasa" },
      yota: { name: "朝比奈陽太", color: "#ffd27a", chara: "yota" },
      sora: { name: "三島空", color: "#8fe0c0", chara: "sora" },
      haruki: { name: "相沢晴樹", color: "#ffb08a", chara: "haruki" },
      unknown: { name: "？？？", color: "#cccccc", chara: "unknown" }
    },
    chapters: [
      { id: "prologue", title: "序章　あの日の交差点" },
      { id: "common", title: "第一章　探しもの" },
      { id: "r_ren", title: "第二章　蓮" },
      { id: "r_tsukasa", title: "第二章　司" },
      { id: "r_yota", title: "第二章　陽太" },
      { id: "r_sora", title: "第二章　空" },
      { id: "harem", title: "第二章　四つの星" },
      { id: "true", title: "終章　あの日の声" }
    ],
    scenes: scenes
  };
  if (typeof module !== "undefined" && module.exports) module.exports = STORY;
  else root.STORY = STORY;
})(this);
