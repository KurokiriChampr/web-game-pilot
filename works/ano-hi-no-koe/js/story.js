/*
 * 『Heart Refrain ～あの日の声～』物語データ。書式は .claude/skills/novel-work/references/story-format.md。
 * 構成はプロット案 v2（2026-11-25）。第1便で構造と共通編を作り直した。個別イベント（<id>_1〜_3）と結末の本文は
 * 第2便・第3便で書き直す前提の仮の本文（旧版の流用を最小限つなぎ直したもの）。
 *
 * ■ 流れ
 *   序章    p_morning ─next→ p_accident ─next→ p_dark（闇の場面）
 *             p_dark ─「目を開ける」→ 第1章
 *                    ─「声のする方へ」（requires flags.true_route）→ トゥルールート
 *   第1章   c_wake → c_class → c_courtyard（陽太）→ c_courtyard_after → c_council（蓮）→ c_council_after
 *             → c_library（司）→ c_library_after → c_homeward（空）→ c_homeward_after
 *   第2章   c_search（ハブ。入るたびに vars.day +1。3 回）
 *             ─ 人物を選ぶ → その人の次のイベント（<id>_1 → <id>_1_after、2 回目は <id>_2 → <id>_2_after）
 *             ─「ひとりで探す」→ c_search_alone
 *             各イベントの最後：vars.day ≧ 3 なら c_festival、それ以外は c_search へ戻る
 *             1 人のイベントは 2 つまで（3 回の放課後で、誰かのイベントは必ず見逃す）
 *   第3章   c_festival（準備・誰を手伝うか）→ c_festival_after（反応＋当日）→ c_branch（キャンプファイヤー）
 *             c_branch ─ aff ≧ LINE の人物だけ → <id>_3（祭りの親密エピソード）→ h_2
 *                      ─「ひとりで炎を見る」→ h_2
 *   第4章   h_2（祭りの夜・全員を思う）→ c_afterfest → c_clue（鈴の持ち主は入院中の生徒）→ c_final（5 択）
 *             c_final ─ 人物 → fin_<id>（反応）─next→ 結末（下の振り分け）
 *                     ─「恩人を探し続ける」→ fin_onjin（別れ）─next→ 結末
 *   トゥルー t_awake → t_fragments → t_hospital → t_plea → t_freeze → t_rescue → end_true（変更なし）
 *
 * ■ 状態
 *   vars.aff.<ren|tsukasa|yota|sora> … 人物ごとの好感度（0〜9）。エンジンの affection は 1 本だけなので使わない（HUD も隠す）
 *   vars.day                         … 第2章の放課後の回数（c_search の onEnter で +1）
 *   flags.done_<id>1／done_<id>2     … 個別イベントを見た（ハブの行き先と、2 つ見た人物を隠すのに使う）
 *   flags.prep_<id>                  … 星見祭の準備で手伝った相手（恩人を選んだときの同点の決め手）
 *   flags.fest_<id>                  … キャンプファイヤーの夜に会いに行った相手（本文の出し分け）
 *   そのほかのフラグ（yota_share など）は、選択肢の直後の反応の出し分けだけに使う
 *   ※ 分岐の関数にはフラグ名・変数名をそのまま書く（点検ツールは関数のソースの s.flags.名前／s.vars.名前.人物 しか拾えない）。
 *      そのため振り分けの式は補助関数にまとめず、各関数に書き下している
 *
 * ■ 結末の振り分け（数値は LINE＝3、GOOD_MIN＝5）
 *   最終選択の時点で 4 人とも aff < LINE                 → end_alone（一人エンド。どれを選んでも）
 *   人物 X を選ぶ：aff.X ≧ GOOD_MIN → end_good_X ／ それ以外 → end_normal_X
 *   恩人を探し続ける：aff がいちばん高い人物 Y → end_bad_Y
 *                     （同点は星見祭の準備で手伝った相手 → 蓮・司・陽太・空の順）
 *   祭りの親密エピソード（<id>_3）は、c_branch の時点で aff ≧ LINE の人物だけ選べる
 *
 * ■ 周回をまたぐ解放（STORY.unlocks）
 *   seen_bad_<id> … そのバッド（別れ）に到達済み（4 件）。4 つ目のバッドの直後の幕間「???」の判定に使う
 *   true_route    … 4 つのバッドすべてに到達済み → 闇の場面に「声のする方へ」。一人エンドは数えない
 *
 * ■ 演出ルール
 *   憑依先の女の子の顔は出さない（立ち絵を作らない。主人公の台詞は manifest に無い声だけの話者 yura）。
 *   本文で主人公の名前を呼ばせない。憑依先 4 人の小差（GIRLS）は本文では触れない（旧版の結末にだけ残っている。第3便で整理）。
 *   地の文の「私」の声は全編で同じ。岐路の「耳の奥の誰か」は一人エンドまで言葉を話さない。
 */
(function (root) {
  "use strict";

  var BOYS = ["ren", "tsukasa", "yota", "sora"];
  var LINE = 3; // 祭りの親密エピソードに要る好感度。最終選択で全員がこれ未満なら一人エンド
  var GOOD_MIN = 5; // グッドに要る好感度（最終選択の時点）
  var DAYS = 3; // 第2章の放課後の回数

  // 憑依先の女の子（顔は出さない。旧版の結末の本文が参照している。第3便で扱いを決める）
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
  /** 好感度の加算とフラグをまとめた effects */
  function eff(id, n, flags) {
    var e = {};
    if (id && n) {
      var a = {};
      a[id] = n;
      e.vars = { aff: a };
    }
    if (flags) e.flags = flags;
    return e;
  }
  function flag(name) {
    var f = {};
    f[name] = true;
    return f;
  }
  /** 第2章のイベントのあと：放課後が残っていればハブへ、終わっていれば星見祭へ */
  function afterEvent(s) {
    return s.vars.day >= DAYS ? "c_festival" : "c_search";
  }

  /**
   * バッドの結末の本文。fourth（4 つ目のバッド）なら末尾に幕間「？？？」を足す。
   * fourth の判定は各結末の text の関数に、フラグ名をそのまま書く。
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

  var scenes = {
    // ===================================================================
    //  序章
    // ===================================================================
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
        "しゃらん、と、すぐそばでもう一度鈴が鳴った。私の鞄からじゃない。私の肩をつかんだ、その手のほうから。",
        "伸ばされた手と、紺の袖。その人の顔は、見えなかった。",
        "アスファルトの冷たさと、遠ざかる足音。――大丈夫、と言われた気がした。"
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

    // ===================================================================
    //  第1章　転校初日
    // ===================================================================
    c_wake: {
      title: "保健室",
      chapter: "ch1",
      icon: "◇",
      theme: "day",
      stage: { bg: "infirmary", hide: "*" },
      text: [
        "目を開けると、白い天井があった。",
        "消毒液のにおい。カーテン越しの、やわらかい昼前の光。",
        "「気がついた？」と、カーテンの向こうから養護の先生が顔を出した。ここは星見学園の保健室だという。",
        "交差点のそばで座りこんでいた私を、通りがかった先生が車で連れてきてくれたらしい。怪我はひとつもない。不思議なくらい、どこも痛くなかった。",
        say("yura", "助けてくれた人がいたんです。男の子で……私の肩をつかんで、引っぱってくれて"),
        "先生は首をかしげた。「先生が見つけたときは、あなたひとりだったそうよ」",
        "ひとりだった。そんなはずはない。肩をつかまれた感触が、まだここに残っているのに。",
        "顔は見ていない。名前も知らない。あの時間にあの交差点を通るのは、星見学園の生徒くらいだけど、と先生は言った。",
        "ベッドの脇には、私の鞄が置かれていた。持ち手の鈴のキーホルダーを、指でそっと揺らしてみる。",
        "ちりん、と小さな音。――似ている。でも、あのときの音は、もっと低くて、もっと近かった。",
        "手がかりと呼べるのは、あの鈴の音だけ。それでも、探そうと決めた。あの人に、ちゃんとお礼を言うために。",
        "三時間目の終わりのチャイムが鳴った。私の転校初日は、保健室のベッドから始まった。"
      ],
      next: "c_class"
    },
    c_class: {
      title: "二年B組",
      chapter: "ch1",
      icon: "◇",
      theme: "day",
      stage: { bg: "classroom", hide: "*" },
      text: [
        "担任の先生に連れられて二年B組の教室に入ったのは、四時間目の前だった。",
        "黒板に名前を書いて、頭を下げる。拍手はまばらで、でも温かかった。",
        "「席は窓際の、三島の隣な。……三島は今日、休みだけど」",
        "示された席の隣は、空っぽだった。机の中には、色分けされたノートが几帳面に並んでいる。",
        "休み時間になると、何人かが机のまわりに集まってきた。前の学校のこと、この町に戻ってきた理由。それから、今朝のこと。",
        "「交差点で事故に遭いかけたって、ほんと？」",
        "助けてくれた人のことを聞いてみたけれど、誰も知らなかった。知らないというより、そんな話は初めて聞いた、という顔だった。",
        "窓の外で、桜が散っていた。この学校のどこかに、あの人がいる。そう思うと、校舎がさっきより少しだけ広く見えた。"
      ],
      next: "c_courtyard"
    },
    c_courtyard: {
      title: "中庭",
      chapter: "ch1",
      icon: "◇",
      theme: "day",
      stage: { bg: "courtyard", hide: "*" },
      text: [
        "昼休み。教室の輪から少しだけ逃げて、私は中庭のベンチでお弁当を広げた。",
        "噴水の水音。花壇のチューリップ。膝の上の鞄で、鈴が風に小さく鳴った。",
        say("yota", "――あ", { chara: "yota", expr: "normal" }),
        "振り向くと、一年生のネクタイをした男の子が、植え込みの向こうで固まっていた。",
        say("yota", "すみません、今の音……鈴ですか？"),
        "鞄を持ち上げてみせると、彼はほっとしたように息を吐いた。",
        say("yota", "びっくりした。前にもどこかで、同じ音を聞いた気がして", { expr: "smile" }),
        "朝比奈陽太、と彼は名乗った。一年生。人懐っこく笑うと、断る間もなく隣に座った。",
        say("yota", "で、先輩。それ、玉子焼きですよね？　ひとつだけ……ひとつだけください！"),
        "さっきの、何かを探すみたいな目は、もうどこにもなかった。"
      ],
      choices: [
        { text: "玉子焼きを分けてあげる", next: "c_courtyard_after", effects: eff("yota", 1, flag("yota_share")) },
        { text: "「自分で食べたいの」と笑う", next: "c_courtyard_after" }
      ]
    },
    c_courtyard_after: {
      title: "予鈴",
      chapter: "ch1",
      icon: "◇",
      theme: "day",
      text: function (s) {
        var t;
        if (s.flags.yota_share) {
          t = [
            say("yota", "やった！　……んっ、甘い。先輩んちの玉子焼き、甘い派なんですね", { chara: "yota", expr: "smile" }),
            "大げさなくらい幸せそうに食べる彼を見ていたら、私まで笑ってしまった。",
            say("yota", "お礼に、困ったことがあったら何でも言ってください。一年の情報網、なめないでくださいね")
          ];
        } else {
          t = [
            say("yota", "えー、ケチ！　……なんて、うそです", { chara: "yota", expr: "normal" }),
            say("yota", "先輩、いま笑いましたよね。じゃあ、それでいいです。玉子焼きより得した気がする", { expr: "smile" }),
            "拗ねた顔は、一秒ももたなかった。"
          ];
        }
        t.push(
          "予鈴が鳴った。立ち上がった陽太くんは、少しだけ声を落とした。",
          say("yota", "そういえば先輩、今朝の交差点の……噂になってますよ。大丈夫でした？", { expr: "normal" }),
          "急に真剣になった声に、少しだけ驚いた。私がうなずくと、彼は「よかった」とだけ言って、校舎へ走っていった。",
          { text: "――前にもどこかで、同じ音を聞いた気がする。その言葉が、午後の授業のあいだ、ずっと耳に残っていた。", hide: "*" }
        );
        return t;
      },
      next: "c_council"
    },
    c_council: {
      title: "生徒会室",
      chapter: "ch1",
      icon: "◇",
      theme: "day",
      stage: { bg: "council", hide: "*" },
      text: [
        "放課後。転入の書類を出しに、私は生徒会室を訪ねた。",
        "ノックをすると、すぐに「どうぞ」と澄んだ声が返ってきた。",
        say("ren", "ようこそ、星見学園へ。生徒会長の藤堂蓮です。書類はこちらで預かるよ", { chara: "ren", expr: "smile" }),
        "絵本から抜け出した王子様みたいな人だった。机の上の書類は一枚の乱れもなく、言葉はどれも丁寧で、隙がない。",
        say("ren", "今朝のこと、聞いているよ。交差点で事故に遭いかけたって。……怪我がなくて、本当によかった", { expr: "normal" }),
        "事故の届けが出ていないか、聞いてみた。先輩は少し考えてから、首を振った。",
        say("ren", "生徒会には、まだ何も。ただ、今朝は職員室の電話がずいぶん鳴っていたみたいだ。何か分かったら、知らせるよ"),
        "そう言って書類を受け取った先輩の指先に、インクの染みが少しだけ残っていた。机の端には、栄養ドリンクの空き瓶が二本。",
        "――この人に、何を言おう。"
      ],
      choices: [
        { text: "「無理していませんか」と聞く", next: "c_council_after", effects: eff("ren", 1, flag("ren_ask")) },
        { text: "書類を渡して、お礼だけ言う", next: "c_council_after" }
      ]
    },
    c_council_after: {
      title: "インクの染み",
      chapter: "ch1",
      icon: "◇",
      theme: "day",
      text: function (s) {
        var t;
        if (s.flags.ren_ask) {
          t = [
            { text: "先輩の手が、一瞬だけ止まった。", chara: "ren", expr: "normal" },
            say("ren", "……顔に出ていたかな"),
            "指にインクが、と言うと、先輩は自分の指先を見下ろして、困ったように笑った。",
            say("ren", "参ったな。初対面の人に見抜かれたのは初めてだ", { expr: "smile" }),
            say("ren", "大丈夫。……と言いたいところだけど、ありがとう。少しだけ、肩の力が抜けた")
          ];
        } else {
          t = [
            say("ren", "どういたしまして。困ったことがあったら、いつでもおいで", { chara: "ren", expr: "smile" }),
            "完璧な笑顔だった。完璧すぎて、どこにも手をかける場所がないみたいだった。",
            "扉を閉める前に振り返ると、先輩はもう次の書類に向かっていた。"
          ];
        }
        t.push(
          { text: "廊下に出ると、窓の向こうで運動部の掛け声が響いていた。", hide: "*" },
          "今朝、職員室で何本も鳴っていたという電話。――あの人のことも、誰かがどこかへ知らせたんだろうか。"
        );
        return t;
      },
      next: "c_library"
    },
    c_library: {
      title: "図書室",
      chapter: "ch1",
      icon: "◇",
      theme: "day",
      stage: { bg: "library", hide: "*" },
      text: [
        "古い新聞なら図書室にある、と廊下ですれ違った先生が教えてくれた。私は渡り廊下を抜けて、旧校舎の図書室へ向かった。",
        "高い窓から光が差しこむ閲覧席に、三年生の先輩がひとり座っていた。",
        say("tsukasa", "……閉館は五時だ。探し物なら手短に", { chara: "tsukasa", expr: "normal" }),
        "久遠司。図書委員の先輩だと、カウンターの名札で知った。冷たい声なのに、本を棚に戻す手つきはやさしかった。",
        say("tsukasa", "新聞か。今朝の事故のことなら、載るとしても明日以降の地方版だ"),
        "どうして事故のことを、と聞くより先に、先輩は窓の外へ目をやった。",
        say("tsukasa", "あの交差点は、春になると事故の記事が増える。歩行者の青が短い。……ここに三年いれば、嫌でも覚える"),
        say("tsukasa", "新聞は三日分しか開架に置いていない。それより前は閉架だ。――で、何を調べたい？"),
        "――答えを、選ばなきゃ。"
      ],
      choices: [
        { text: "「今朝、助けてくれた人を探していて」と打ち明ける", next: "c_library_after", effects: eff("tsukasa", 1, flag("tsukasa_told")) },
        { text: "「やっぱりいいです」と引き下がる", next: "c_library_after" }
      ]
    },
    c_library_after: {
      title: "閲覧席",
      chapter: "ch1",
      icon: "◇",
      theme: "day",
      text: function (s) {
        var t;
        if (s.flags.tsukasa_told) {
          t = [
            { text: "先輩は黙って最後まで聞いてくれた。相づちもなく、でも、一度も目をそらさずに。", chara: "tsukasa", expr: "normal" },
            say("tsukasa", "……顔も名前も分からない相手を、礼を言うためだけに探す、か"),
            say("tsukasa", "非効率だな。――嫌いじゃない", { expr: "smile" }),
            say("tsukasa", "記事が出たら、取っておく。三日過ぎたら閉架に回るから、そのときは俺に声をかけろ", { expr: "normal" })
          ];
        } else {
          t = [
            say("tsukasa", "そうか", { chara: "tsukasa", expr: "normal" }),
            "それだけ言って、先輩はまた本に目を落とした。引き下がったのは私なのに、なんだか置いていかれた気がした。",
            "カウンターの前を通り過ぎるとき、小さな声が背中に届いた。",
            say("tsukasa", "……新聞は、逃げない。調べたくなったら、また来ればいい")
          ];
        }
        t.push({ text: "図書室を出ると、廊下の窓の光が、少しずつ色を変えはじめていた。", hide: "*" });
        return t;
      },
      next: "c_homeward"
    },
    c_homeward: {
      title: "帰り道の交差点",
      chapter: "ch1",
      icon: "◇",
      theme: "evening",
      stage: { bg: "crossing_evening", hide: "*" },
      text: [
        "帰り道。気づくと私は、あの交差点の前に立っていた。",
        "夕焼けが、横断歩道の白い線を赤く染めている。今朝ここで何があったのか、もう誰も気にしていないみたいに、車が流れていく。",
        "信号待ちの人の中に、ひとりだけ、星見学園の制服の男子がいた。",
        "鞄を肩にかけたまま、信号を見上げている。青に変わっても、渡らない。赤になって、また青になっても。",
        say("sora", "……ん？", { chara: "sora", expr: "normal" }),
        "目が合った。彼は私の制服を見て、それから鞄の鈴を見て、ほんの少しだけ眉を寄せた。",
        say("sora", "あんた、もしかして転校生？　二年B組の"),
        "うなずくと、彼はぱっと表情を崩した。",
        say("sora", "やっぱり。俺、三島空。隣の席。今日はちょっと……サボった", { expr: "smile" }),
        say("sora", "初日から隣が空席とか、さみしかったっしょ。明日はちゃんと行くから。購買の焼きそばパンの取り方とか、教えるわ"),
        "軽い調子なのに、彼の目は、まだ信号のほうを向いていた。",
        say("sora", "……ここ、歩行者の青が短いんだよ。今朝も、さ", { expr: "normal" }),
        "言いかけて、彼は口をつぐんだ。",
        say("sora", "……つか、あんたこそ。さっきからずっと、横断歩道ばっか見てるけど"),
        "――今朝のことを、話そうか。耳の奥で、誰かが私と一緒に迷っている気がした。"
      ],
      choices: [
        { text: "「今朝、ここで事故に遭いかけたの」と話す", next: "c_homeward_after", effects: eff("sora", 1, flag("told_sora")) },
        { text: "「なんでもない」と笑ってごまかす", next: "c_homeward_after" }
      ]
    },
    c_homeward_after: {
      title: "青の短い信号",
      chapter: "ch1",
      icon: "◇",
      theme: "evening",
      text: function (s) {
        var t;
        if (s.flags.told_sora) {
          t = [
            { text: "空くんは、笑わなかった。", chara: "sora", expr: "normal" },
            say("sora", "……そっか。怪我、ないんだな"),
            "それだけ確かめるみたいに言って、彼は大きく息を吐いた。",
            say("sora", "助けてくれたやつ、探してんの？　……なら、俺も手伝う。隣の席のよしみってことで", { expr: "smile" }),
            "どうしてそこまで、と聞く前に、信号が青に変わった。",
            say("sora", "ほら、青。渡るぞ。――ここの青、短いから")
          ];
        } else {
          t = [
            say("sora", "ふーん。ま、言いたくないなら聞かねえけど", { chara: "sora", expr: "normal" }),
            "空くんは肩をすくめて、それから少しだけ真面目な声になった。",
            say("sora", "でも、ここで立ち止まるなら、歩道の内側な。……この交差点、あんまり好きじゃないんだ"),
            "信号が青に変わる。彼は、私が渡りきるまで、何も言わずに後ろを歩いてくれた。"
          ];
        }
        t.push(
          { text: "家に着いて、鞄から鈴のキーホルダーを外し、手のひらに載せた。", hide: "*" },
          "顔も知らない。名前も知らない。分かっているのは、同じ学校の男子らしいことと、あの鈴の音だけ。",
          "それでも、明日から探そう。――私の転校初日は、そうして終わった。"
        );
        return t;
      },
      next: "c_search"
    },

    // ===================================================================
    //  第2章　恩人探し（ハブ）
    // ===================================================================
    c_search: {
      title: "放課後の探しもの",
      chapter: "ch2",
      icon: "◇",
      theme: "day",
      stage: { bg: "corridor", hide: "*" },
      onEnter: { vars: { day: 1 } },
      text: function (s) {
        if (s.vars.day >= 3) {
          return [
            "四月の終わり。校舎は、星見祭の準備でざわつきはじめていた。",
            "準備が始まれば、放課後はきっと慌ただしくなる。ゆっくり探せるのは、たぶん今日が最後だ。",
            "――今日は、誰のところへ行こう。"
          ];
        }
        if (s.vars.day === 2) {
          return [
            "次の週。廊下の掲示板に、星見祭のポスターが貼り出された。",
            "鈴の音は、まだ見つからない。昇降口で、渡り廊下で、誰かの鞄が鳴るたびに振り向いてしまう。",
            "今日の放課後は、どこを探そう。"
          ];
        }
        return [
          "転校して数日。新しい教室にも、少しずつ慣れてきた。",
          "助けてくれた人は、まだ見つからない。名乗り出る人もいないし、生徒会にも事故の届けは出ていないらしい。",
          "それでも、ひとりきりで探さなくてもいい気がした。この学校には、話を聞いてくれる人たちがいる。",
          "今日の放課後は、誰のところへ行こう。",
          "――耳の奥で、また誰かが迷っている。私と一緒に。"
        ];
      },
      choices: [
        {
          text: "生徒会室の蓮先輩をたずねる",
          next: function (s) {
            return s.flags.done_ren1 ? "ren_2" : "ren_1";
          },
          requires: function (s) {
            return !s.flags.done_ren2;
          }
        },
        {
          text: "図書室の司先輩をたずねる",
          next: function (s) {
            return s.flags.done_tsukasa1 ? "tsukasa_2" : "tsukasa_1";
          },
          requires: function (s) {
            return !s.flags.done_tsukasa2;
          }
        },
        {
          text: "中庭の陽太くんをたずねる",
          next: function (s) {
            return s.flags.done_yota1 ? "yota_2" : "yota_1";
          },
          requires: function (s) {
            return !s.flags.done_yota2;
          }
        },
        {
          text: "教室に残っている空くんに声をかける",
          next: function (s) {
            return s.flags.done_sora1 ? "sora_2" : "sora_1";
          },
          requires: function (s) {
            return !s.flags.done_sora2;
          }
        },
        { text: "ひとりで校内を探す", next: "c_search_alone" }
      ]
    },
    c_search_alone: {
      title: "ひとりの放課後",
      chapter: "ch2",
      icon: "◇",
      theme: "day",
      stage: { bg: "corridor", hide: "*" },
      text: [
        "誰かに頼るのは、なんだか違う気がした。私は鞄を持って、ひとりで校舎を歩いた。",
        "職員室の前。昇降口の落とし物の箱。運動部の部室が並ぶ、渡り廊下の先。",
        "鈴のキーホルダーを付けた鞄は、思っていたより多かった。そのたびに耳を澄ませて、そのたびに、違う、と思った。",
        "下校のチャイムが鳴るころには、足が棒みたいになっていた。",
        "見つからなかった。でも、探すのをやめようとは思わなかった。"
      ],
      next: afterEvent
    },

    // ---------- 蓮（仮の本文。第2便で書き直す） ----------
    ren_1: {
      title: "資料の山",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      stage: { bg: "council", hide: "*" },
      onEnter: { flags: { done_ren1: true } },
      text: [
        "生徒会室の扉は、半分開いたままだった。",
        { text: "蓮先輩は、ひとりで段ボール箱の山と向き合っていた。去年の星見祭の資料だという。", chara: "ren", expr: "normal" },
        say("ren", "ああ、来てくれたんだ。ごめん、散らかっていて。……事故の記録、もう一度調べてみようと思ってね"),
        "ファイルの背表紙は年度ごとにきれいにそろっているのに、先輩の机の上だけは、付箋とメモで埋まっていた。",
        say("ren", "完璧な会長でいるのも、楽じゃないよ。……なんて、君にしか言わないけど", { expr: "smile" }),
        "――何と言おう。"
      ],
      choices: [
        { text: "「今日はもう休んでください」とファイルを取り上げる", next: "ren_1_after", effects: eff("ren", 1, flag("ren1_rest")) },
        { text: "「さすが会長です」と笑う", next: "ren_1_after" }
      ]
    },
    ren_1_after: {
      title: "半分ずつ",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      text: function (s) {
        var t;
        if (s.flags.ren1_rest) {
          t = [
            { text: "先輩は目を丸くして、取り上げられたファイルと私を見比べた。", chara: "ren", expr: "normal" },
            say("ren", "……強引だな、君は", { expr: "smile" }),
            say("ren", "でも、悪くない。じゃあ、半分ずつにしよう。君が読み上げて、僕が仕分ける"),
            "結局、その日は箱を三つ片付けた。先輩は一度も「完璧」という言葉を使わなかった。"
          ];
        } else {
          t = [
            say("ren", "ありがとう。期待に応えられるように、がんばるよ", { chara: "ren", expr: "smile" }),
            "先輩はいつもの笑顔に戻って、また付箋を一枚はがした。",
            "さっきの一言は、聞かなかったことになったみたいだった。"
          ];
        }
        t.push({ text: "事故の記録は、見つからなかった。帰りぎわ、先輩は窓から屋上を見上げて、「星見祭の進行表、まだ白紙なんだ」と小さく笑った。", hide: "*" });
        return t;
      },
      next: afterEvent
    },
    ren_2: {
      title: "屋上の進行表",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      stage: { bg: "rooftop", hide: "*" },
      onEnter: { flags: { done_ren2: true } },
      text: [
        "屋上には、春の風が吹いていた。",
        { text: "蓮先輩は、手すりにもたれて星見祭の進行表を広げていた。", chara: "ren", expr: "normal" },
        say("ren", "ここなら、誰にも見られずに書き直せるからね。……人前に立つのは、実はあまり得意じゃないんだ"),
        say("ren", "それと、君に話しておきたいことがある。あの朝のことだ"),
        say("ren", "あの時間、僕は生徒会室にいた。そこへ職員室から連絡が回ってきたんだ。交差点に救急車が来ている、うちの生徒かもしれない、って"),
        say("ren", "だから――君を助けたのは、僕じゃない。……残念だな。僕だったら、よかったのに", { expr: "sad" }),
        "完璧な人の声が、ほんの少しだけ揺れていた。",
        "救急車。あの朝、誰かが運ばれていた。",
        "――何と言おう。耳の奥で、誰かが息をひそめている。"
      ],
      choices: [
        { text: "「完璧じゃなくていいと思います」と伝える", next: "ren_2_after", effects: eff("ren", 2, flag("ren2_honest")) },
        { text: "何も言わず、隣で進行表をのぞきこむ", next: "ren_2_after", effects: eff("ren", 1) }
      ]
    },
    ren_2_after: {
      title: "白い紙",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      text: function (s) {
        var t;
        if (s.flags.ren2_honest) {
          t = [
            { text: "先輩は、しばらく黙っていた。風が進行表をめくって、白い紙がぱたぱたと鳴った。", chara: "ren", expr: "normal" },
            say("ren", "……そんなことを言われたら、困るな", { expr: "smile" }),
            say("ren", "完璧じゃない僕を、君には見せたくなってしまう")
          ];
        } else {
          t = [
            { text: "私は手すりにもたれて、先輩の手元をのぞきこんだ。", chara: "ren", expr: "normal" },
            say("ren", "……ここ、時間が足りないと思う？"),
            "初めて、先輩が私に意見を聞いた。二人で、進行表の空白をひとつずつ埋めていった。"
          ];
        }
        t.push({ text: "救急車で運ばれた生徒のことは、先輩も知らなかった。職員室も、それ以上は教えてくれなかったという。", hide: "*" });
        return t;
      },
      next: afterEvent
    },

    // ---------- 司（仮の本文。第2便で書き直す） ----------
    tsukasa_1: {
      title: "放課後の図書室",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      stage: { bg: "library", hide: "*" },
      onEnter: { flags: { done_tsukasa1: true } },
      text: [
        "放課後の図書室は、今日も静かだった。",
        { text: "司先輩は、返却された本を一冊ずつ棚に戻していた。", chara: "tsukasa", expr: "normal" },
        say("tsukasa", "……来たのか"),
        "それだけ言って、先輩は本の山の半分を、黙って私のほうへ押した。手伝え、ということらしい。",
        "背の順に並べて、番号をそろえる。先輩は口をきかないのに、私が迷うと、ちょうどいいところで棚を指さしてくれた。",
        say("tsukasa", "前に、交差点のことを調べたいと言っていたな。……あの日の新聞は、もう閉架に回った"),
        "――どうしよう。"
      ],
      choices: [
        { text: "「先輩と一緒に読みたいです」と頼む", next: "tsukasa_1_after", effects: eff("tsukasa", 1, flag("tsukasa1_ask")) },
        { text: "「今日は整理を手伝います」と首を振る", next: "tsukasa_1_after" }
      ]
    },
    tsukasa_1_after: {
      title: "手帳の約束",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      text: function (s) {
        var t;
        if (s.flags.tsukasa1_ask) {
          t = [
            { text: "先輩は、少しだけ眉を上げた。", chara: "tsukasa", expr: "normal" },
            say("tsukasa", "一緒に、か"),
            say("tsukasa", "……閉架の鍵は、委員しか持てない。次に来たとき、開けてやる"),
            "ぶっきらぼうな約束だった。でも、先輩はそれを手帳に書きとめていた。"
          ];
        } else {
          t = [
            say("tsukasa", "……そうか。助かる", { chara: "tsukasa", expr: "normal" }),
            "それきり、会話はなかった。けれど、閉館まで二人で並べた棚は、いつもよりまっすぐに見えた。"
          ];
        }
        t.push({ text: "帰りぎわ、カウンターの貸出カードの束が目に入った。先輩の字は、意外なくらい丸かった。", hide: "*" });
        return t;
      },
      next: afterEvent
    },
    tsukasa_2: {
      title: "閉架の鍵",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      stage: { bg: "archive", hide: "*" },
      onEnter: { flags: { done_tsukasa2: true } },
      text: [
        "閉架書庫の扉の前で、先輩は鍵束を握ったまま立ち止まった。",
        say("tsukasa", "ひとつ言っておく。俺は、あの日の朝、交差点にはいなかった", { chara: "tsukasa", expr: "normal" }),
        say("tsukasa", "君が探しているのが俺じゃないことは分かってる。それでも――君が何を探しているのか、知りたいと思った"),
        "冷たい声の奥で、何かが震えていた。",
        "鍵が回る。古い紙のにおいがした。",
        "四月の地方版。小さな、小さな記事だった。『交差点で事故　けが人あり』。それだけ。名前も、学校名もない。",
        say("tsukasa", "……顔色が悪い。今日はここまでにしておけ"),
        "――何と言おう。"
      ],
      choices: [
        { text: "「一緒に探してくれて、うれしかったです」と言う", next: "tsukasa_2_after", effects: eff("tsukasa", 2, flag("tsukasa2_thanks")) },
        { text: "黙って、先輩の隣に立つ", next: "tsukasa_2_after", effects: eff("tsukasa", 1) }
      ]
    },
    tsukasa_2_after: {
      title: "けが人あり",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      text: function (s) {
        var t;
        if (s.flags.tsukasa2_thanks) {
          t = [
            { text: "先輩は、新聞をたたむ手を止めた。", chara: "tsukasa", expr: "normal" },
            say("tsukasa", "……礼を言われるようなことはしていない"),
            "そう言いながら、先輩の耳は少しだけ赤かった。",
            say("tsukasa", "けが人あり、か。……その『けが人』が、君の探している相手かもしれないな")
          ];
        } else {
          t = [
            { text: "先輩は何も言わなかった。私も、何も言わなかった。", chara: "tsukasa", expr: "normal" },
            "閉架の小さな窓から、運動部の声が遠く聞こえる。並んで立っているだけなのに、不思議と息がしやすかった。",
            say("tsukasa", "……君は無事だった。なら、この『けが人』は誰だ")
          ];
        }
        t.push({ text: "記事を写したメモを、私は生徒手帳に挟んだ。", hide: "*" });
        return t;
      },
      next: afterEvent
    },

    // ---------- 陽太（仮の本文。第2便で書き直す） ----------
    yota_1: {
      title: "中庭の落とし物",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      stage: { bg: "courtyard", hide: "*" },
      onEnter: { flags: { done_yota1: true } },
      text: [
        "中庭に出ると、陽太くんが植え込みの前にしゃがみこんでいた。",
        say("yota", "あ、先輩！　ちょうどよかった。友だちが家の鍵を落としたって言うから、探してるんです", { chara: "yota", expr: "normal" }),
        "二人で花壇の縁をのぞきこむ。噴水の水音に混じって、私の鞄の鈴が鳴った。",
        "陽太くんの肩が、びくりと跳ねた。",
        say("yota", "……あ、すみません。その音、なんか、だめなんです。前にも同じ音を聞いた気がして"),
        "笑ってごまかす声が、少しだけ震えていた。",
        "鍵は、噴水の裏で見つかった。陽太くんは自分のことみたいに喜んで、それから私の隣に腰を下ろした。",
        say("yota", "先輩、明日もここ来てくれます？　来てくれないと、僕、拗ねますよ", { expr: "smile" }),
        "――どうしよう。"
      ],
      choices: [
        { text: "「明日も来るね」と笑う", next: "yota_1_after", effects: eff("yota", 1, flag("yota1_promise")) },
        { text: "「考えておく」とはぐらかす", next: "yota_1_after" }
      ]
    },
    yota_1_after: {
      title: "立てかけた小指",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      text: function (s) {
        var t;
        if (s.flags.yota1_promise) {
          t = [
            say("yota", "ほんとですか！　やった、約束ですよ", { chara: "yota", expr: "smile" }),
            "陽太くんは小指を立てかけて、途中でやめた。",
            say("yota", "……指切りは、また今度。重いって思われたら困るんで")
          ];
        } else {
          t = [
            say("yota", "えー、ずるい。……でも、考えてくれるなら、待ってます", { chara: "yota", expr: "normal" }),
            "陽太くんは口をとがらせて、すぐに笑った。その笑顔が、さっきの震えた声を上から塗りつぶしたように見えた。"
          ];
        }
        t.push({ text: "前にも同じ音を聞いた気がする。――どこで聞いたのか、今日も聞きそびれてしまった。", hide: "*" });
        return t;
      },
      next: afterEvent
    },
    yota_2: {
      title: "噴水の前",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      stage: { bg: "courtyard", hide: "*" },
      onEnter: { flags: { done_yota2: true } },
      text: [
        "放課後の噴水の前で、陽太くんは珍しく、ひとりで黙って座っていた。",
        say("yota", "先輩。僕、ほんとは甘えてるふりしてるだけなんです。置いていかれるのが、怖いから", { chara: "yota", expr: "sad" }),
        say("yota", "小さいころ、兄ちゃんが事故で……。だから、先輩が事故に遭いかけたって聞いたとき、すごく怖かった"),
        "いつも明るい声が、ほんの少しかすれていた。",
        "噴水の水が、陽の光を跳ね返してきらきらしている。こんなにまぶしい場所で、彼はずっとひとりで笑っていたんだろうか。",
        "――何と言おう。耳の奥で、誰かが答えを待っている。"
      ],
      choices: [
        { text: "「怖いなら、怖いって言っていいよ」と手を握る", next: "yota_2_after", effects: eff("yota", 2, flag("yota2_hold")) },
        { text: "黙って、頭をなでる", next: "yota_2_after", effects: eff("yota", 1) }
      ]
    },
    yota_2_after: {
      title: "水の音",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      text: function (s) {
        var t;
        if (s.flags.yota2_hold) {
          t = [
            { text: "陽太くんは、握られた手をじっと見て、それから、ぎゅっと握り返してきた。", chara: "yota", expr: "sad" },
            say("yota", "……怖いです。先輩がいなくなるの、たぶん、すごく怖い"),
            say("yota", "言っちゃった。……でも、ちょっと楽になりました", { expr: "smile" })
          ];
        } else {
          t = [
            { text: "陽太くんは、くすぐったそうに目を細めた。", chara: "yota", expr: "normal" },
            say("yota", "先輩、それ、子ども扱いですよね？　……今日だけ、許します", { expr: "smile" }),
            "それきり、彼はお兄さんの話をしなかった。"
          ];
        }
        t.push({ text: "下校のチャイムが鳴るまで、噴水の水音だけを聞いていた。", hide: "*" });
        return t;
      },
      next: afterEvent
    },

    // ---------- 空（仮の本文。第2便で書き直す） ----------
    sora_1: {
      title: "放課後の教室",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      stage: { bg: "classroom", hide: "*" },
      onEnter: { flags: { done_sora1: true } },
      text: [
        "放課後の二年B組に、空くんはひとりで残っていた。",
        say("sora", "お、来た来た。放課後の教室で二人きりとか、青春っぽくね？", { chara: "sora", expr: "smile" }),
        "黒板には、あの交差点の地図が描かれていた。信号の時間、車の流れ、朝の人通りまで、細かく。",
        say("sora", "あの信号、歩行者用の青が短すぎんだよ。署名集めて、市に出そうと思ってさ", { expr: "normal" }),
        "机の上には、手書きの署名用紙が束になっていた。まだ、空欄のほうがずっと多い。",
        say("sora", "クラスのやつらには、真面目かよって笑われたけど。……笑われても、やるって決めたんだ"),
        "――どう答えよう。"
      ],
      choices: [
        { text: "「手伝わせて」と署名用紙を受け取る", next: "sora_1_after", effects: eff("sora", 1, flag("sora1_help")) },
        { text: "「空くんって意外と真面目だね」とからかう", next: "sora_1_after" }
      ]
    },
    sora_1_after: {
      title: "署名用紙",
      chapter: "ch2",
      icon: "♡",
      theme: "day",
      text: function (s) {
        var t;
        if (s.flags.sora1_help) {
          t = [
            { text: "空くんは一瞬きょとんとして、それから照れたように頭をかいた。", chara: "sora", expr: "normal" },
            say("sora", "……マジで？　言っとくけど、地味だぞ。一枚ずつ頭下げて回るんだからな", { expr: "smile" }),
            "その日のうちに、二人で十二人分の署名が集まった。最後の一枚を数え終わると、空くんは小さく「よし」と言った。"
          ];
        } else {
          t = [
            say("sora", "うっせ。意外とは余計だろ", { chara: "sora", expr: "smile" }),
            "空くんは笑って、黒板の地図に目を戻した。",
            say("sora", "……ま、真面目にもなるって。あそこは", { expr: "normal" })
          ];
        }
        t.push({ text: "どうしてそこまで、とは聞けなかった。黒板の地図の、横断歩道の真ん中に、小さくバツ印が付いていた。", hide: "*" });
        return t;
      },
      next: afterEvent
    },
    sora_2: {
      title: "夜の帰り道",
      chapter: "ch2",
      icon: "♡",
      theme: "night",
      stage: { bg: "crossing_night", hide: "*" },
      onEnter: { flags: { done_sora2: true } },
      text: [
        "署名を集めて回った帰り道は、もうすっかり夜になっていた。",
        "空くんは遠回りをして、あの交差点の前で立ち止まった。",
        say("sora", "白状すると、俺さ。あの朝、ここにいたんだ", { chara: "sora", expr: "sad" }),
        say("sora", "向こうの歩道で、信号待ってた。トラックが来て、誰かが走っていって……俺は、見てただけ。動けなかった"),
        say("sora", "走ってったやつ、星見の制服だった。たぶん二年か三年。……顔は、見えなかった"),
        say("sora", "だから、お前を助けたのは俺じゃない。……ごめんな。初日にサボったのも、ここ、通れなくてさ"),
        "軽い声のまま、空くんは手すりを強く握っていた。",
        "――何と言おう。耳の奥の誰かが、私と一緒に立ちすくむ。"
      ],
      choices: [
        { text: "「話してくれてありがとう」と手すりの手に触れる", next: "sora_2_after", effects: eff("sora", 2, flag("sora2_thanks")) },
        { text: "黙って、信号が変わるのを待つ", next: "sora_2_after", effects: eff("sora", 1) }
      ]
    },
    sora_2_after: {
      title: "三回目の青",
      chapter: "ch2",
      icon: "♡",
      theme: "night",
      text: function (s) {
        var t;
        if (s.flags.sora2_thanks) {
          t = [
            { text: "空くんの手は、夜の手すりと同じくらい冷たかった。", chara: "sora", expr: "normal" },
            say("sora", "……礼言われることじゃねえよ"),
            "そう言いながら、彼はゆっくりと手すりから手を離した。",
            say("sora", "でも、言えてよかった。ずっと、誰かに言いたかったんだと思う", { expr: "smile" })
          ];
        } else {
          t = [
            { text: "信号が青に変わった。赤になって、また青になった。", chara: "sora", expr: "sad" },
            "三回目の青で、空くんが小さく息を吐いた。",
            say("sora", "……サンキュ。黙っててくれて", { expr: "normal" })
          ];
        }
        t.push(
          say("sora", "そいつ、あのあと救急車に乗せられてた気がする。……それしか分かんなくて、ごめん", { expr: "normal" }),
          { text: "救急車。顔の見えない、星見の制服の男子。――少しずつ、あの人の輪郭が浮かんでくる。", hide: "*" }
        );
        return t;
      },
      next: afterEvent
    },

    // ===================================================================
    //  第3章　星見祭
    // ===================================================================
    c_festival: {
      title: "星見祭の準備",
      chapter: "ch3",
      icon: "◇",
      theme: "day",
      stage: { bg: "festival", hide: "*" },
      text: [
        "五月。学園は、星見祭の準備一色になった。",
        "校門には手作りのアーチ。廊下にはペンキのにおい。放課後になると、どこの教室からも金づちの音が聞こえてくる。",
        "恩人探しは、少しだけお休み。生徒会も、図書委員も、一年生も、二年B組も、手が足りないから手伝ってほしいと言ってくれた。",
        "――どこを手伝おう。"
      ],
      choices: [
        { text: "生徒会の看板づくりを手伝う", next: "c_festival_after", effects: eff("ren", 1, flag("prep_ren")) },
        { text: "図書委員の古本市を手伝う", next: "c_festival_after", effects: eff("tsukasa", 1, flag("prep_tsukasa")) },
        { text: "一年生の屋台を手伝う", next: "c_festival_after", effects: eff("yota", 1, flag("prep_yota")) },
        { text: "二年B組の展示を手伝う", next: "c_festival_after", effects: eff("sora", 1, flag("prep_sora")) }
      ]
    },
    c_festival_after: {
      title: "星見祭",
      chapter: "ch3",
      icon: "◇",
      theme: "day",
      text: function (s) {
        var t;
        if (s.flags.prep_ren) {
          t = [
            say("ren", "その角、もう少し右。……うん、完璧だ", { chara: "ren", expr: "smile" }),
            "看板の文字を塗りながら、蓮先輩は何度も「完璧」と言った。けれど、その声は前よりずっとやわらかかった。",
            say("ren", "君がいると、完璧じゃなくても平気な気がする。……変なことを言ったね。忘れて", { expr: "normal" })
          ];
        } else if (s.flags.prep_tsukasa) {
          t = [
            { text: "古本市の値札を、司先輩と二人で一冊ずつ付けていった。", chara: "tsukasa", expr: "normal" },
            say("tsukasa", "その本は百円だ。……いや、君が気に入ったなら、持っていけ"),
            "先輩はそっぽを向いたまま、私の手に文庫本を一冊のせた。表紙には、星座の絵が描かれていた。"
          ];
        } else if (s.flags.prep_yota) {
          t = [
            say("yota", "先輩、焼きそば、味見してください！　僕が焼いたやつ！", { chara: "yota", expr: "smile" }),
            "鉄板の前で汗だくになりながら、陽太くんはずっと笑っていた。",
            say("yota", "先輩が来てくれたから、一年の屋台、いちばん繁盛しますよ。絶対")
          ];
        } else if (s.flags.prep_sora) {
          t = [
            say("sora", "そっち持って。せーの！", { chara: "sora", expr: "smile" }),
            "展示用の大きなパネルを、空くんと二人で運んだ。重さで腕が震えるたびに、彼は「あと三歩」と言って笑った。",
            say("sora", "クラス展示、町の地図にしたんだ。あの交差点の信号のことも、ちゃんと載せた", { expr: "normal" })
          ];
        } else {
          t = ["準備の日々は、あっという間に過ぎた。"];
        }
        t.push(
          { text: "そして、星見祭の当日。", hide: "*" },
          "校庭には屋台が並び、渡り廊下には人があふれた。どこへ行っても、誰かが笑っていた。",
          "鞄に鈴を付けた人とも、何人かすれ違った。そのたびに振り向いて、そのたびに、違う、と思った。",
          "日が傾いて、校庭の真ん中に、キャンプファイヤーの薪が組まれはじめた。"
        );
        return t;
      },
      next: "c_branch"
    },
    c_branch: {
      title: "キャンプファイヤー",
      chapter: "ch3",
      icon: "◇",
      theme: "night",
      fx: "embers",
      stage: { bg: "campfire", hide: "*" },
      text: function (s) {
        var t = [
          "日が落ちて、校庭の真ん中で炎が上がった。",
          "フォークダンスの曲が流れはじめる。火の粉が、星の出はじめた空へ昇っていく。"
        ];
        var any = false;
        if (s.vars.aff.ren >= LINE) {
          any = true;
          t.push("スマートフォンが震えた。『屋上にいる。少し話せる？』――蓮先輩から。");
        }
        if (s.vars.aff.tsukasa >= LINE) {
          any = true;
          t.push("『図書室の鍵を開けてある』――司先輩からの、短いメッセージ。");
        }
        if (s.vars.aff.yota >= LINE) {
          any = true;
          t.push("『先輩！　中庭で待ってます！』――陽太くんから、りんご飴の絵文字つきで。");
        }
        if (s.vars.aff.sora >= LINE) {
          any = true;
          t.push("『薪運び終わった。ちょっと休憩つきあって』――空くんから。");
        }
        if (any) t.push("――誰のところへ行こう。");
        else t.push("スマートフォンは、静かなままだった。輪の外で炎を見ていよう、と思った。");
        return t;
      },
      choices: [
        {
          text: "屋上の蓮先輩のところへ",
          next: "ren_3",
          effects: eff("ren", 1, flag("fest_ren")),
          requires: function (s) {
            return s.vars.aff.ren >= LINE;
          }
        },
        {
          text: "図書室の司先輩のところへ",
          next: "tsukasa_3",
          effects: eff("tsukasa", 1, flag("fest_tsukasa")),
          requires: function (s) {
            return s.vars.aff.tsukasa >= LINE;
          }
        },
        {
          text: "中庭の陽太くんのところへ",
          next: "yota_3",
          effects: eff("yota", 1, flag("fest_yota")),
          requires: function (s) {
            return s.vars.aff.yota >= LINE;
          }
        },
        {
          text: "炎のそばの空くんのところへ",
          next: "sora_3",
          effects: eff("sora", 1, flag("fest_sora")),
          requires: function (s) {
            return s.vars.aff.sora >= LINE;
          }
        },
        { text: "ひとりで炎を見ている", next: "h_2" }
      ]
    },

    // ---------- 祭りの親密エピソード（仮の本文。第2便で書き直す） ----------
    ren_3: {
      title: "屋上の火の粉",
      chapter: "ch3",
      icon: "♡",
      theme: "night",
      fx: "embers",
      stage: { bg: "rooftop_night", hide: "*" },
      text: [
        "屋上からは、校庭の炎がよく見えた。",
        say("ren", "進行表どおり。……ここから見ると、全部うまくいっているように見えるね", { chara: "ren", expr: "normal" }),
        say("ren", "本当は、下で挨拶をするはずだったんだ。でも、マイクの前に立ったら、手が震えて。副会長に代わってもらった", { expr: "sad" }),
        "完璧な会長の、誰も知らない顔だった。",
        say("ren", "君にだけは、見られてもいいと思った", { expr: "smile" }),
        "火の粉が消えるまで、私たちは並んで校庭を見下ろしていた。"
      ],
      next: "h_2"
    },
    tsukasa_3: {
      title: "星の図鑑",
      chapter: "ch3",
      icon: "♡",
      theme: "night",
      stage: { bg: "archive_night", hide: "*" },
      text: [
        "旧校舎は、祭りの喧騒が嘘みたいに静かだった。",
        { text: "司先輩は、閉館後の書庫の奥で、古い星の図鑑を広げていた。", chara: "tsukasa", expr: "normal" },
        say("tsukasa", "……来たのか。祭りはいいのか"),
        say("tsukasa", "今夜は、こと座が見える。この本の、このページだ"),
        "先輩の指が、図鑑の星座をなぞる。窓の外の本物の星より、その指先のほうを、私は見ていた。",
        say("tsukasa", "外は騒がしい。……ここにいろ。閉館時間は、今夜だけ忘れてやる", { expr: "smile" })
      ],
      next: "h_2"
    },
    yota_3: {
      title: "りんご飴の棒",
      chapter: "ch3",
      icon: "♡",
      theme: "night",
      stage: { bg: "courtyard_night", hide: "*" },
      text: [
        "中庭のベンチで、陽太くんは屋台の残りのりんご飴を二本持って待っていた。",
        say("yota", "先輩！　来てくれた！　はい、これ。一本は先輩の", { chara: "yota", expr: "smile" }),
        "噴水の水面に、遠くの炎が揺れている。",
        say("yota", "……先輩。指切り、してもいいですか。明日も、ここで会うって", { expr: "normal" }),
        "差し出された小指は、少しだけ震えていた。",
        "私が小指をからめると、陽太くんは、泣きそうな顔で笑った。"
      ],
      next: "h_2"
    },
    sora_3: {
      title: "青信号の約束",
      chapter: "ch3",
      icon: "♡",
      theme: "night",
      fx: "embers",
      stage: { bg: "campfire", hide: "*" },
      text: [
        "薪を運び終えた空くんは、炎から少し離れた芝生に座りこんでいた。",
        say("sora", "あー、腕が上がんねえ。あの薪、ほぼ俺らで組んだんだぜ", { chara: "sora", expr: "smile" }),
        say("sora", "なあ。署名、市に出したら、あの交差点の青、長くなるかもしれないんだって", { expr: "normal" }),
        say("sora", "そしたらさ。いちばん最初の長い青、一緒に渡ってくんない？"),
        "冗談みたいな口調なのに、彼は炎じゃなく、私のほうをまっすぐ見ていた。",
        "うなずくと、空くんは「約束な」と言って、芝生に寝転がった。"
      ],
      next: "h_2"
    },

    // 旧版のハーレムの場面（四つの手）を、祭りの夜に全員を思う共通の場面に転用（ID は維持）
    h_2: {
      title: "祭りの夜",
      chapter: "ch3",
      icon: "◇",
      theme: "night",
      fx: "embers",
      stage: { bg: "campfire", hide: "*" },
      text: function (s) {
        var t = ["曲が変わる。炎の輪のまわりで、誰かと誰かが手を取り合っている。"];
        if (s.flags.fest_ren) t.push("屋上で見た、蓮先輩の震えた手を思い出す。誰にも見せない顔を、私にだけ見せてくれた。");
        else if (s.flags.fest_tsukasa) t.push("書庫の窓から見た星を思い出す。図鑑をなぞる、司先輩の指先も。");
        else if (s.flags.fest_yota) t.push("小指に、まだ陽太くんの体温が残っている。明日も、ここで。");
        else if (s.flags.fest_sora) t.push("いちばん最初の長い青。空くんの声が、まだ耳に残っている。");
        else t.push("私は輪の外で、ひとりで炎を見ていた。");
        t.push(
          "四人の顔が、順番に浮かんだ。生徒会室の窓。図書室の静けさ。中庭の噴水。夕焼けの交差点。",
          "この学校に来てから、私はずっと、あの人を探していたはずだった。",
          "なのに今、胸の中にあるのは、顔も知らないあの人じゃない。",
          "鞄の鈴を、ぎゅっと握った。――本当に好きなのは、誰なんだろう。"
        );
        return t;
      },
      next: "c_afterfest"
    },

    // ===================================================================
    //  第4章　葛藤
    // ===================================================================
    c_afterfest: {
      title: "祭りのあと",
      chapter: "ch4",
      icon: "◇",
      theme: "day",
      stage: { bg: "classroom", hide: "*" },
      text: function (s) {
        var t = [
          "星見祭が終わって、学校はいつもの顔に戻った。",
          "片付けの終わった教室。ポスターをはがしたあとの、壁のテープの跡。窓の外は、もう葉桜だった。",
          "恩人探しのノートを開く。書いてあるのは、手がかりと呼ぶには頼りない言葉ばかりだった。"
        ];
        var n = 0;
        if (s.flags.done_ren2) {
          n += 1;
          t.push("――あの朝、交差点に救急車が来ていた。（蓮先輩）");
        }
        if (s.flags.done_tsukasa2) {
          n += 1;
          t.push("――四月の地方版。『けが人あり』。名前はない。（司先輩と、閉架で）");
        }
        if (s.flags.done_sora2) {
          n += 1;
          t.push("――走っていったのは、星見の制服の男子。救急車に乗せられていた。（空くん）");
        }
        if (s.flags.done_yota1) {
          n += 1;
          t.push("――同じ鈴の音を、前にも聞いた気がする。（陽太くん）");
        }
        if (!n) t.push("――鈴の音。それだけ。");
        t.push(
          "ページの余白に、気づけば、別の名前を書きかけていた。",
          "慌てて消しゴムをかける。紙からは消えても、胸の中からは消えなかった。",
          "――私は、何を探しているんだろう。"
        );
        return t;
      },
      next: "c_clue"
    },
    c_clue: {
      title: "鈴の持ち主",
      chapter: "ch4",
      icon: "◇",
      theme: "day",
      stage: { bg: "infirmary", hide: "*" },
      text: [
        "その日の昼休み、廊下で保健室の先生に呼び止められた。",
        "「転校初日の朝のこと、まだ気にしてるでしょう」",
        "保健室の椅子に私を座らせて、先生は少し迷うように、窓のほうへ目をそらした。",
        "「あの朝、同じ交差点から救急車で運ばれた生徒がいたの。うちの二年生。……あなたが見つかる、少し前に」",
        "「救急隊の人が言っていたそうよ。その子の鞄で、鈴のキーホルダーがずっと鳴っていたって」",
        "息が、止まりそうになった。",
        "「今も、市立病院に入院してる。名前は……ごめんなさい、私からは言えないの」",
        "鈴の音。紺の袖。救急車。――ばらばらだった手がかりが、ひとつにつながった。",
        "あの人は、私を助けて、怪我をしたんだ。そして今も、病院のベッドにいる。",
        "なのに私は、お礼も言えないまま、誰かに恋をしていた。"
      ],
      next: "c_final"
    },
    c_final: {
      title: "あなたか、あの人か",
      chapter: "ch4",
      icon: "◇",
      theme: "evening",
      stage: { bg: "rooftop_evening", hide: "*" },
      text: function (s) {
        var t = [
          "放課後、私は屋上に上がった。",
          "日が傾いて、町が橙色に染まっていく。ずっと向こうに、市立病院の白い建物が見えた。",
          "会いに行かなきゃ、と思う。あの人にありがとうを言うために、私はこの学校で探しつづけてきたんだから。"
        ];
        var any = false;
        if (s.vars.aff.ren >= LINE) {
          any = true;
          t.push("生徒会室の窓。今日も蓮先輩は、ひとりで書類を直しているだろうか。");
        }
        if (s.vars.aff.tsukasa >= LINE) {
          any = true;
          t.push("閉館前の図書室。司先輩の、丸い字の貸出カード。");
        }
        if (s.vars.aff.yota >= LINE) {
          any = true;
          t.push("中庭のベンチ。明日もここで、と言った陽太くんの小指。");
        }
        if (s.vars.aff.sora >= LINE) {
          any = true;
          t.push("夕焼けの交差点。青が短い、と言った空くんの横顔。");
        }
        if (any) t.push("でも、会いたい人は、ほかにもいた。どちらかを選べば、どちらかには、もう戻れない気がした。");
        else t.push("ほかにも、会いたい人がいた――はずだった。名前を思い浮かべようとして、どの顔も、少しだけ遠かった。");
        t.push(
          "――耳の奥で、誰かが息をひそめている。ずっと、私と一緒に迷ってきた誰かが。",
          "夕焼けが、いちばん赤くなった。"
        );
        return t;
      },
      choices: [
        { text: "蓮先輩に会いに行く", next: "fin_ren" },
        { text: "司先輩に会いに行く", next: "fin_tsukasa" },
        { text: "陽太くんに会いに行く", next: "fin_yota" },
        { text: "空くんに会いに行く", next: "fin_sora" },
        { text: "恩人を探し続ける（病院へ向かう）", next: "fin_onjin" }
      ]
    },

    // ---------- 最終選択の直後（反応と、結末への振り分け） ----------
    fin_ren: {
      title: "生徒会室の明かり",
      chapter: "ch4",
      icon: "♡",
      theme: "evening",
      stage: { bg: "council_evening", hide: "*" },
      text: function (s) {
        var t = ["生徒会室の明かりは、まだついていた。"];
        if (s.vars.aff.ren < LINE && s.vars.aff.tsukasa < LINE && s.vars.aff.yota < LINE && s.vars.aff.sora < LINE) {
          t.push(
            say("ren", "やあ。どうしたの？　何か用だった？", { chara: "ren", expr: "smile" }),
            "いつもの、完璧な笑顔だった。私が言葉を探しているあいだに、先輩の目は机の書類へ戻っていく。",
            say("ren", "急ぎじゃないなら、また今度でいいかな。今日中に片付けないといけなくて", { expr: "normal" }),
            "はい、と言うしかなかった。扉は、やさしく閉まった。"
          );
        } else if (s.vars.aff.ren >= GOOD_MIN) {
          t.push(
            say("ren", "……来てくれたんだ。君が来なかったら、屋上まで探しに行くつもりだった", { chara: "ren", expr: "smile" }),
            "先輩は書類を伏せて、立ち上がった。夕焼けの窓を背にして、少しだけ、指先が震えていた。"
          );
        } else {
          t.push(
            say("ren", "ああ、ちょうどよかった。少し手伝ってもらえるかな", { chara: "ren", expr: "normal" }),
            "差し出された書類を受け取る。先輩の隣は、相変わらず居心地がよかった。"
          );
        }
        return t;
      },
      next: function (s) {
        if (s.vars.aff.ren < LINE && s.vars.aff.tsukasa < LINE && s.vars.aff.yota < LINE && s.vars.aff.sora < LINE) return "end_alone";
        return s.vars.aff.ren >= GOOD_MIN ? "end_good_ren" : "end_normal_ren";
      }
    },
    fin_tsukasa: {
      title: "閉館前",
      chapter: "ch4",
      icon: "♡",
      theme: "evening",
      stage: { bg: "library_evening", hide: "*" },
      text: function (s) {
        var t = ["西日の差す図書室で、司先輩は返却された本を棚に戻していた。"];
        if (s.vars.aff.ren < LINE && s.vars.aff.tsukasa < LINE && s.vars.aff.yota < LINE && s.vars.aff.sora < LINE) {
          t.push(
            say("tsukasa", "……閉館は五時だ。用がないなら", { chara: "tsukasa", expr: "normal" }),
            "用は、あった。なのに、何も言えなかった。先輩はそれ以上、何も聞かなかった。"
          );
        } else if (s.vars.aff.tsukasa >= GOOD_MIN) {
          t.push(
            say("tsukasa", "遅い。……閉館時間は、とっくに過ぎてる", { chara: "tsukasa", expr: "smile" }),
            "そう言いながら、先輩はカウンターの鍵を、まだ閉めていなかった。"
          );
        } else {
          t.push(
            say("tsukasa", "……来たのか。座れ。今日の分の本がある", { chara: "tsukasa", expr: "normal" }),
            "差し出された本を受け取って、私はいつもの閲覧席に座った。"
          );
        }
        return t;
      },
      next: function (s) {
        if (s.vars.aff.ren < LINE && s.vars.aff.tsukasa < LINE && s.vars.aff.yota < LINE && s.vars.aff.sora < LINE) return "end_alone";
        return s.vars.aff.tsukasa >= GOOD_MIN ? "end_good_tsukasa" : "end_normal_tsukasa";
      }
    },
    fin_yota: {
      title: "夕方の中庭",
      chapter: "ch4",
      icon: "♡",
      theme: "evening",
      stage: { bg: "courtyard_evening", hide: "*" },
      text: function (s) {
        var t = ["夕方の中庭に、噴水の音だけが響いていた。"];
        if (s.vars.aff.ren < LINE && s.vars.aff.tsukasa < LINE && s.vars.aff.yota < LINE && s.vars.aff.sora < LINE) {
          t.push(
            "陽太くんは、ベンチの向こうで友だちとふざけ合っていた。",
            say("yota", "あ、先輩！　お疲れさまでーす！", { chara: "yota", expr: "smile" }),
            "手を振って、彼はすぐに友だちの輪へ戻っていった。その輪の中に、私の入る隙間はなかった。"
          );
        } else if (s.vars.aff.yota >= GOOD_MIN) {
          t.push(
            say("yota", "先輩！　……来てくれた。来てくれないかと思って、ずっとここにいました", { chara: "yota", expr: "smile" }),
            "ベンチから立ち上がった陽太くんの目は、少しだけ赤かった。"
          );
        } else {
          t.push(
            say("yota", "先輩、今日のおやつ、半分こしましょう！", { chara: "yota", expr: "smile" }),
            "陽太くんは、いつもの調子で笑った。"
          );
        }
        return t;
      },
      next: function (s) {
        if (s.vars.aff.ren < LINE && s.vars.aff.tsukasa < LINE && s.vars.aff.yota < LINE && s.vars.aff.sora < LINE) return "end_alone";
        return s.vars.aff.yota >= GOOD_MIN ? "end_good_yota" : "end_normal_yota";
      }
    },
    fin_sora: {
      title: "夕焼けの交差点",
      chapter: "ch4",
      icon: "♡",
      theme: "evening",
      stage: { bg: "crossing_evening", hide: "*" },
      text: function (s) {
        var t = ["夕焼けの交差点に、空くんがいた。"];
        if (s.vars.aff.ren < LINE && s.vars.aff.tsukasa < LINE && s.vars.aff.yota < LINE && s.vars.aff.sora < LINE) {
          t.push(
            "友だちと笑いながら、信号を待っている。",
            say("sora", "おー、転校生。また明日なー", { chara: "sora", expr: "smile" }),
            "青に変わる。空くんは、振り返らずに渡っていった。"
          );
        } else if (s.vars.aff.sora >= GOOD_MIN) {
          t.push(
            say("sora", "……来ると思った", { chara: "sora", expr: "smile" }),
            "空くんは手すりから背中を離して、まっすぐこっちを見た。"
          );
        } else {
          t.push(
            say("sora", "お、奇遇。一緒に帰る？", { chara: "sora", expr: "normal" }),
            "いつもの軽い調子に、私は少しだけほっとした。"
          );
        }
        return t;
      },
      next: function (s) {
        if (s.vars.aff.ren < LINE && s.vars.aff.tsukasa < LINE && s.vars.aff.yota < LINE && s.vars.aff.sora < LINE) return "end_alone";
        return s.vars.aff.sora >= GOOD_MIN ? "end_good_sora" : "end_normal_sora";
      }
    },
    fin_onjin: {
      title: "別れ",
      chapter: "ch4",
      icon: "◇",
      theme: "evening",
      stage: { bg: "corridor_evening", hide: "*" },
      text: function (s) {
        var a = s.vars.aff;
        if (a.ren < LINE && a.tsukasa < LINE && a.yota < LINE && a.sora < LINE) {
          return [
            "誰にも何も言わずに、私は学校を出た。",
            { text: "市立病院の受付で、私は言葉に詰まった。", bg: "hospital_evening" },
            "「どなたのお見舞いですか」――名前を、知らなかった。",
            "「ご家族の方以外は……」と、受付の人は申し訳なさそうに首を振った。",
            "病院を出る。振り返っても、誰も待っていなかった。お別れを言わなきゃいけない人も、引き止めてくれる人も。"
          ];
        }
        var t = ["病院へ向かう前に、どうしても会っておきたい人がいた。"];
        var top = pickTop(s);
        if (top === "ren") {
          t.push(
            { text: "生徒会室の扉を開けると、蓮先輩が顔を上げた。", bg: "council_evening" },
            say("ren", "……行くんだね。あの人のところへ", { chara: "ren", expr: "normal" }),
            "先輩は、引き止めなかった。完璧な笑顔のまま、少しだけ目を伏せた。"
          );
        } else if (top === "tsukasa") {
          t.push(
            { text: "図書室の扉を開けると、司先輩が本から顔を上げた。", bg: "library_evening" },
            say("tsukasa", "……見つかったのか。探していた相手が", { chara: "tsukasa", expr: "normal" }),
            "私がうなずくと、先輩は、読みかけの本を静かに閉じた。"
          );
        } else if (top === "yota") {
          t.push(
            { text: "中庭のベンチで、陽太くんが待っていた。", bg: "courtyard_evening" },
            say("yota", "先輩。……どこか、行っちゃうんですか", { chara: "yota", expr: "sad" }),
            "笑おうとして、うまく笑えていない顔だった。"
          );
        } else {
          t.push(
            { text: "交差点の前で、空くんが信号を見ていた。", bg: "crossing_evening" },
            say("sora", "病院、行くんだろ。……分かるよ、顔見れば", { chara: "sora", expr: "sad" }),
            "空くんは、手すりを握ったまま、こっちを見なかった。"
          );
        }
        return t;
      },
      // 最も好感度の高い人物の別れへ（同点は準備で手伝った相手 → 蓮・司・陽太・空の順）。全員がライン未満なら一人エンド
      next: function (s) {
        if (s.vars.aff.ren < LINE && s.vars.aff.tsukasa < LINE && s.vars.aff.yota < LINE && s.vars.aff.sora < LINE) return "end_alone";
        var top = pickTop(s);
        return "end_bad_" + top;
      }
    },

    // ===================================================================
    //  一人エンド（共通バッド。解放の数え方には入れない）
    // ===================================================================
    end_alone: {
      title: "ひとりの交差点",
      chapter: "r_alone",
      icon: "✕",
      theme: "evening",
      ending: { id: "alone", name: "BAD END「ひとりきりの青信号」", kind: "bad" },
      stage: { bg: "crossing_evening", hide: "*" },
      text: [
        "気がつくと、私はあの交差点の前に立っていた。",
        "夕焼けが、横断歩道の白い線を赤く染めている。転校初日の帰り道と、同じ色だった。",
        "誰のところへも、行けなかった。誰かを選んだつもりで、私は誰のことも、ちゃんと見ていなかったのかもしれない。",
        "あの人を探すことも、誰かを好きになることも。どちらも途中のまま、ここまで来てしまった。",
        "信号が青に変わる。誰も、私の名前を呼ばない。",
        "そのとき、耳の奥で、ずっと言葉にならなかった気配が、はっきりと形になった。",
        "『今度は、ちゃんと選んで』",
        "自分に言い聞かせたみたいな声だった。そうだね、と私はうなずいた。今度は、ちゃんと。",
        "ちりん、と鈴が鳴った。",
        "鞄の持ち手を見下ろす。鈴のキーホルダーは、少しも揺れていなかった。風も、吹いていなかった。",
        "信号が、また赤に変わる。",
        "――ねえ、今の声、誰？"
      ]
    },

    // ===================================================================
    //  トゥルールート（変更なし）
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
        { text: "――屋上。「あなたがあの人だって言って」とすがった私の手首で、銀の細いブレスレットが鳴った。", bg: "rooftop_night" },
        { text: "風に流れた黒くて長い髪。透明に光る爪。……私の爪は、あんなふうに塗ったことがない。" },
        { text: "――閉架書庫。開いた新聞を押さえていた指先は、淡いピンクだった。挟んであった桜の押し花の栞。", bg: "archive_night" },
        { text: "――中庭。「ずっとそばにいる」と約束した私の肩で、サイドポニーが跳ねた。水色の爪と、星のキーホルダー。", bg: "courtyard_night" },
        { text: "――夜の交差点。ショートボブの耳元に、黒いヘアピンが二本。赤い爪が、冷たい手すりを握っていた。", bg: "crossing_night" },
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

  /**
   * 恩人を選んだときの別れの相手：最も好感度の高い人物。同点は準備で手伝った相手 → BOYS の順。
   * 点検ツールは補助関数の中を見ないので、呼び出し側の next にも 4 人分の .vars.aff の参照（一人エンドの判定）を書いてある
   */
  function pickTop(s) {
    var a = { ren: s.vars.aff.ren, tsukasa: s.vars.aff.tsukasa, yota: s.vars.aff.yota, sora: s.vars.aff.sora };
    var prep = { ren: !!s.flags.prep_ren, tsukasa: !!s.flags.prep_tsukasa, yota: !!s.flags.prep_yota, sora: !!s.flags.prep_sora };
    var best = null;
    BOYS.forEach(function (id) {
      if (best === null || a[id] > a[best] || (a[id] === a[best] && prep[id] && !prep[best])) best = id;
    });
    return best;
  }

  // ===================================================================
  //  結末（グッド・ノーマル・別れのバッド）。仮の本文（旧版を最小限つなぎ直したもの。第3便で書き直す）
  // ===================================================================
  function endings(id, R) {
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
      theme: "evening",
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

  endings("ren", {
    endNormal: {
      title: "生徒会の仲間",
      name: "NORMAL END「会長の隣」",
      text: [
        { text: "星見祭が終わって、私は生徒会の手伝いを続けることになった。", chara: "ren", expr: "smile" },
        say("ren", "君がいると、仕事が早く終わる。……助かってるよ、本当に"),
        "先輩の隣は、居心地がよかった。それ以上の言葉は、どちらからも出なかった。",
        "助けてくれたあの人には、まだ会えていない。"
      ]
    },
    endBad: {
      title: "言わせた言葉",
      name: "BAD END「借りものの王子様」",
      // 4 つ目のバッド：自分は未到達で、ほかの 3 つは到達済み（その周の初期フラグ）
      text: function (s) {
        return withInterlude(
          [
            { text: "「……分かった。行っておいで。君が探していた人のところへ」", speaker: "ren", chara: "ren", expr: "sad" },
            "先輩はやさしいから、そう言ってくれた。その声がほんの少しだけ震えていたことに、私は気づいていた。",
            { text: "背を向けた、その瞬間。足元がふっと消えた。", hide: "*", fx: "shake" },
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
        "夕風の中で、私はうなずいた。助けてくれたあの人のことは、少しだけ遠くなった。"
      ]
    }
  });

  endings("tsukasa", {
    endNormal: {
      title: "閲覧席",
      name: "NORMAL END「栞のあいだ」",
      text: [
        { text: "それから毎日、閉館までの一時間を、私は図書室で過ごした。", chara: "tsukasa", expr: "normal" },
        say("tsukasa", "……その本、読み終わったら感想を聞かせろ"),
        "それだけの約束が、ページをめくるたびに少しずつ増えていった。",
        "あの日の新聞は、今も閉架の奥にある。"
      ]
    },
    endBad: {
      title: "閉架の奥",
      name: "BAD END「読んではいけない記事」",
      // 4 つ目のバッド：自分は未到達で、ほかの 3 つは到達済み（その周の初期フラグ）
      text: function (s) {
        return withInterlude(
          [
            { text: "先輩に背を向けて、私は最後にもう一度だけ、閉架の新聞を確かめに行った。", bg: "archive", hide: "*" },
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

  endings("yota", {
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
            { text: "「……また明日、会えますよね」と、陽太くんが小指を差し出した。", chara: "yota", expr: "sad" },
            "小指をからめた、その瞬間だった。",
            { text: "からめたはずの指が、ほどけていく。", fx: "shake" },
            { text: "「先輩……？　先輩、どうしたんですか、先輩！」", speaker: "yota", chara: "yota", expr: "sad" },
            "陽太くんの声が遠い。また明日、なんて。私には、最初から言えない約束だったんだ。",
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

  endings("sora", {
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
            { text: "空くんに背を向けて、私は病院のほうへ駆け出した。信号が、点滅していた。", hide: "*" },
            "横断歩道の真ん中で、私は振り向いた。",
            { text: "ヘッドライトが、白く膨らむ。", fx: "flash" },
            "――知っている。この光を、私は前にも見た。",
            "最後に見えたのは、手すりから離れた自分の手の" + GIRLS.sora.nail + "い爪。耳元の" + GIRLS.sora.item + "。",
            "――私の、だったろうか。",
            { text: "空くんが私を呼んでいた。私の知らない名前で。", bg: "dark" }
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
    endingCount: 14, // グッド 4・ノーマル 4・別れ 4・一人 1・トゥルー 1
    vars: {
      aff: { initial: 0, min: 0, max: 9, per: BOYS },
      day: { initial: 0, min: 0, max: DAYS }
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
      { id: "ch1", title: "第一章　転校初日" },
      { id: "ch2", title: "第二章　恩人探し" },
      { id: "ch3", title: "第三章　星見祭" },
      { id: "ch4", title: "第四章　あなたか、あの人か" },
      { id: "r_ren", title: "終章　蓮" },
      { id: "r_tsukasa", title: "終章　司" },
      { id: "r_yota", title: "終章　陽太" },
      { id: "r_sora", title: "終章　空" },
      { id: "r_alone", title: "終章　ひとり" },
      { id: "true", title: "トゥルールート　あの日の声" }
    ],
    scenes: scenes
  };
  if (typeof module !== "undefined" && module.exports) module.exports = STORY;
  else root.STORY = STORY;
})(this);
