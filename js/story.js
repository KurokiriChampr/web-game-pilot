/*
 * 物語データ
 * ------------------------------------------------------------
 * scenes[id] = {
 *   title:   シーン名
 *   icon:    シーンを表す絵文字
 *   theme:   背景テーマ（css/style.css の body.theme-xxx に対応）
 *   text:    段落の配列、または state を受け取って配列を返す関数
 *            段落は「文字列」または「{ text, speaker, chara, pose, expr, pos, show, hide, halo, fx }」
 *            （混在可。文字列は地の文・演出指定なし。ver 3.0 Phase 1 では meet / explain だけが新形式）
 *              speaker: 話者 ID（STORY.cast のキー）。省略＝地の文（名前札を出さない）
 *              chara / pose / expr / pos: 立ち絵 1 人ぶんの指定。一度出した立ち絵は次の指定まで続く
 *              show: [{ chara, pose, expr, pos }]（複数人）、hide: ["rine"] または ["*"]
 *              halo: 光輪 "weak" | "flicker" | "bright" | "off"、fx: そのページだけの演出（"hop" など）
 *   stage:   シーン開始時の舞台（省略可）{ bg: 背景の論理名, show, halo }
 *            論理名とファイルの対応は assets/manifest.json（backgrounds / characters）で持つ
 *   choices: [{ text, next, effects, requires }]
 *     next:     次のシーンID、または state を受け取ってIDを返す関数
 *     effects:  { affection: 数値, shards: 数値, flags: { name: true } }
 *     requires: state を受け取って true/false を返す関数（省略時は常に表示）
 *   onEnter: シーンに入ったときに適用する effects（省略可）
 *   ending:  エンディングシーンのみ { id, name, kind }
 *   fx:      背景の演出（省略可）"petals" | "petals-fall" | "motes" | "embers" | "dust"
 *   enter:   シーンに入った瞬間の演出（省略可）"shake" | "flash"
 * }
 *
 * 画像と BGM はここではなく assets/manifest.json でシーンIDに対応付ける
 * （docs/ASSETS.md を参照）。
 */
(function (root) {
  "use strict";

  var TRUE_END_AFFECTION = 8; // トゥルーエンドに必要な好感度
  var SWORD_AFFECTION = 5; // 剣で挑んだとき、リーネが助けてくれる好感度

  var STORY = {
    start: "awakening",
    maxShards: 3,
    maxAffection: 13,
    endingCount: 4,
    shardNames: ["〈暁の欠片〉", "〈真昼の欠片〉", "〈黄昏の欠片〉"],
    // 話者（名前札の表示名と色）。chara は立ち絵の人物 ID（assets/manifest.json の characters のキー）
    cast: {
      rine: { name: "リーネ", color: "#f2d48a", chara: "rine" },
      girl: { name: "少女", color: "#f2d48a", chara: "rine" } // 名乗る前の表示名
    },
    scenes: {
      // 1 ----------------------------------------------------------
      awakening: {
        title: "止まった草原",
        icon: "🌸",
        theme: "dawn",
        fx: "petals",
        text: [
          "目を開けると、そこは見知らぬ草原だった。",
          "最後に覚えているのは、雨の交差点と、こちらへ迫るヘッドライトの白い光。――あのとき、自分は死んだはずだ。",
          "なのに、頬を撫でる風がない。空を舞う花びらは宙に縫い止められたように動かず、雲も、鳥も、遠くの川のきらめきさえ、一枚の絵のように静止している。",
          "音のない世界で、ただひとつ。丘の向こうにそびえる巨大な時計塔だけが、かすかに青く光っていた。"
        ],
        choices: [
          {
            text: "宙に止まった花びらに、そっと触れてみる",
            next: "meet",
            effects: { flags: { petal: true } }
          },
          { text: "まっすぐ時計塔へ向かう", next: "meet" }
        ]
      },

      // 2 ----------------------------------------------------------
      meet: {
        title: "時計塔の少女",
        icon: "🕰️",
        theme: "tower",
        stage: { bg: "tower_foot", halo: "weak" },
        text: function (s) {
          var t = [];
          if (s.flags.petal) {
            // 文字列のまま＝地の文・演出なし（まだ誰も舞台にいない）
            t.push("指先が触れた瞬間、花びらはほんの少しだけ揺れ、またゆっくりと宙に留まった。まるで、あなたの指からだけ時間がこぼれ落ちたように。");
          }
          t.push(
            {
              text: "時計塔の足元。苔むした石段に、ひとりの少女が膝を抱えて座っていた。",
              chara: "rine", pose: "sit", expr: "down", pos: "center"
            },
            {
              text: "淡い金色の髪。星を閉じ込めたような瞳。背中には、砕けた文字盤のような光の輪が、今にも消えそうに明滅している。",
              chara: "rine", pose: "sit", expr: "down", halo: "weak"
            },
            {
              text: "この止まった世界で、あなた以外に動いているものを見たのは初めてだった。",
              chara: "rine", pose: "sit", expr: "down"
            },
            {
              text: "少女はゆっくり顔を上げ、目を見開いた。「……動いてる。あなた、どうして動けるの？」",
              speaker: "girl", pose: "sit", expr: "surprised", fx: "hop"
            }
          );
          return t;
        },
        choices: [
          {
            text: "「大丈夫？　ずいぶん疲れているみたいだ」",
            next: "explain",
            effects: { affection: 2 }
          },
          {
            text: "「僕は……たぶん、別の世界から来たんだ」",
            next: "explain",
            effects: { affection: 1 }
          },
          {
            text: "「君こそ誰だ？　ここは一体どこなんだ」",
            next: "explain"
          }
        ]
      },

      // 3 ----------------------------------------------------------
      explain: {
        title: "時の女神リーネ",
        icon: "📜",
        theme: "tower",
        stage: { bg: "tower_foot", halo: "weak" },
        text: [
          {
            text: "「私はリーネ。この世界アストラリアの、時を司る女神……だった、かな」",
            speaker: "rine", pose: "stand", expr: "normal", pos: "center"
          },
          {
            text: "少女は苦笑して、背後の時計塔を見上げた。「百年に一度、塔の中にある『時の歯車』を巻き直す儀式があるの。でも、その夜に『時喰い（ときぐい）』っていう影が現れて――」",
            speaker: "rine", pose: "stand", expr: "wry"
          },
          {
            text: "歯車の核である三つの欠片、〈暁〉〈真昼〉〈黄昏〉が奪われ、世界中に散らばった。そのときから、アストラリアの時間は止まったままだという。",
            chara: "rine", pose: "stand", expr: "serious"
          },
          {
            text: "「止まった世界で動けるのは、この世界の時間に縛られていない魂だけ。……異世界から来たあなたなら、欠片を取り戻せるかもしれない」",
            speaker: "rine", pose: "stand", expr: "serious"
          },
          {
            text: "リーネの光輪が、また弱々しく瞬いた。",
            chara: "rine", pose: "stand", expr: "normal", halo: "flicker"
          }
        ],
        choices: [
          {
            text: "「わかった。一緒に欠片を探そう」",
            next: "village",
            effects: { affection: 1 }
          },
          {
            text: "「……それで、僕に何の得がある？」",
            next: "village",
            effects: { affection: -1, flags: { selfish: true } }
          }
        ]
      },

      // 4 ----------------------------------------------------------
      village: {
        title: "涙の止まった村",
        icon: "🏘️",
        theme: "dawn",
        fx: "petals",
        text: function (s) {
          var t = [];
          if (s.flags.selfish) {
            t.push("「時が戻れば、あなたもこの世界で生きていける。……それじゃ、だめ？」そう答えたきり、道中のリーネはほとんど口をきかなかった。");
          }
          t.push(
            "丘を下ると、小さな村があった。パン屋の煙突から昇る煙は空中で固まり、洗濯物は風をはらんだ形のまま止まっている。",
            "広場の真ん中では、転んだ女の子が泣き顔のまま静止していた。その頬からこぼれた涙が一粒、宙に浮かんで光っている。",
            "「みんな、痛みも悲しみも、止まったまま終われないの」リーネが小さくつぶやいた。"
          );
          return t;
        },
        choices: [
          {
            text: "宙に浮いた涙を、指でそっと拭ってあげる",
            next: "forest",
            effects: { affection: 1, flags: { kindness: true } }
          },
          { text: "「今は欠片が先だ。急ごう」", next: "forest" },
          { text: "湯気の止まったパン屋の店先を、のぞいてみる", next: "bakery" }
        ]
      },

      // 4b（寄り道）-------------------------------------------------
      bakery: {
        title: "焼きたての朝",
        icon: "🥖",
        theme: "dawn",
        text: [
          "店先の棚には、焼きたての丸パンが並んでいた。立ちのぼる湯気は白い糸のように固まり、窯の火は橙色の硝子細工になっている。",
          "カウンターの向こうでは、粉まみれの手をした主人が、誰かに笑いかけたまま止まっていた。",
          "「この村のパン、好きだったな」リーネが懐かしそうに目を細める。「塔の上まで、毎朝いい匂いが届くの。……食べたことは、一度もないんだけど」",
          "あなたが丸パンにそっと触れると、固まっていた湯気がふわりとほどけた。指先からこぼれた時間のぶんだけ、パンはまだ温かい。"
        ],
        choices: [
          {
            text: "ポケットに残っていた前の世界の硬貨を置いて、丸パンをひとつもらっていく",
            next: "forest",
            effects: { flags: { bread: true } }
          },
          {
            text: "「時間が戻ったら、一緒に買いに来よう」と約束して、店を出る",
            next: "forest",
            effects: { affection: 1, flags: { bakeryPromise: true } }
          }
        ]
      },

      // 5 ----------------------------------------------------------
      forest: {
        title: "囁きの森",
        icon: "🌲",
        theme: "forest",
        fx: "motes",
        text: function (s) {
          var t = [];
          if (s.flags.kindness) {
            t.push("あなたが拭った涙は、指先で小さな光の粒になって消えた。それを見ていたリーネは、出会ってから初めて、ほんの少しだけ笑った。");
          }
          t.push(
            "村を抜けた先、『囁きの森』。止まった木々の奥で、大樹のうろの中に朱金色の光が灯っている。〈暁の欠片〉だ。",
            "手を伸ばしたそのとき、木々の影がぐにゃりと歪んだ。黒い霧が獣の形をとり、赤い目でリーネを睨みつける。",
            "「時喰い……！」リーネが後ずさる。獣が低く唸り、地を蹴った。"
          );
          return t;
        },
        choices: [
          {
            text: "リーネの前に飛び出し、身を盾にする",
            next: "campfire",
            effects: { affection: 2, shards: 1, flags: { brave: true } }
          },
          {
            text: "倒木の陰へ誘い込み、枝を落として足止めする",
            next: "campfire",
            effects: { affection: 1, shards: 1, flags: { clever: true } }
          },
          {
            text: "「女神なんだろう？　君の力で何とかしてくれ！」",
            next: "campfire",
            effects: { affection: -1, shards: 1, flags: { relied: true } }
          }
        ]
      },

      // 6 ----------------------------------------------------------
      campfire: {
        title: "揺れる焚き火",
        icon: "🔥",
        theme: "night",
        fx: "embers",
        text: function (s) {
          var t = [];
          if (s.flags.brave) {
            t.push("獣の爪はあなたの腕を裂いたが、時喰いはそのまま霧となって散った。リーネは震える手で、あなたの傷に淡い光を当て続けた。「……ばか。無茶しないで」");
          } else if (s.flags.clever) {
            t.push("落ちてきた枝に絡め取られ、時喰いは霧となって散った。「すごい……そんな戦い方があるんだ」リーネは目を丸くしていた。");
          } else {
            t.push("リーネは残り少ない力を振り絞り、光で時喰いを焼き払った。そのまま彼女はふらりと倒れ込み、しばらく起き上がれなかった。");
          }
          t.push(
            "〈暁の欠片〉を手に入れた夜。あなたが起こした焚き火だけが、止まった世界でぱちぱちと揺れていた。",
            "炎を見つめながら、リーネが言った。「女神はね、ずっと一人なの。時を見守るだけで、誰とも同じ時間を生きられない。人の一生は、私にとって瞬きみたいなものだから」"
          );
          return t;
        },
        choices: [
          {
            text: "「今は同じ時間を生きてる。僕がここにいる」",
            next: "river",
            effects: { affection: 2 }
          },
          {
            text: "黙って隣に座り、一緒に焚き火を見つめる",
            next: "river",
            effects: { affection: 1 }
          },
          {
            text: "「女神も大変なんだな。……明日は早い、もう寝よう」",
            next: "river"
          },
          {
            text: "村でもらった丸パンを半分に割って、黙って差し出す",
            next: "river",
            requires: function (s) {
              return !!s.flags.bread;
            },
            effects: { affection: 3, flags: { shared: true } }
          }
        ]
      },

      // 7 ----------------------------------------------------------
      river: {
        title: "硝子の大河",
        icon: "🌊",
        theme: "day",
        text: function (s) {
          var t = [];
          if (s.flags.shared) {
            t.push("「……おいしかった」歩きながら、リーネが思い出したように言った。「パンって、あんなに温かいものだったんだね。百年ぶんの朝を、損してた気がする」");
          }
          t.push(
            "翌朝――といっても、空の色は昨日と少しも変わらない。二人は大河ルーメのほとりに立っていた。",
            "流れの途中で止まった川面は、まるで磨かれた硝子のようだ。跳ねた魚が、水しぶきごと空中に飾られている。",
            "「上を歩けば近道になるよ。でも、止まった水はときどき『見た人の過去』を映すの」リーネが言う。「遠回りするなら、川沿いに古い修道院の図書館があるけど……」"
          );
          return t;
        },
        choices: [
          { text: "止まった川の上を歩いて渡る", next: "mirror" },
          { text: "遠回りして、古い図書館に寄ってみる", next: "library" },
          { text: "その前に、岸辺に繋がれた渡し舟を調べてみる", next: "boat" }
        ]
      },

      // 7b（寄り道）-------------------------------------------------
      boat: {
        title: "渡し守の舟",
        icon: "🛶",
        theme: "day",
        text: [
          "岸辺の杭に、古い渡し舟が繋がれていた。櫂を握ったままの老いた渡し守が、対岸を見つめて止まっている。",
          "舟底に、小さな木箱が転がっていた。蓋を開けると、錆びた櫛歯と真鍮の円筒――オルゴールだ。",
          "「それ、『刻（とき）告げの歌』だよ」リーネが箱をのぞき込む。「昔は塔の鐘が鳴るたびに、この国の人たちが口ずさんでいたの。……もう、誰も歌わなくなって久しいけど」",
          "ねじは固く、いくら力を込めても回らない。止まった世界では、旋律もまた止まったままらしい。"
        ],
        choices: [
          {
            text: "「少しだけ借りるよ」と渡し守に声をかけ、オルゴールを懐に、川の上を歩いて渡る",
            next: "mirror",
            effects: { flags: { musicbox: true } }
          },
          {
            text: "「少しだけ借りるよ」と渡し守に声をかけ、オルゴールを懐に、図書館へ遠回りする",
            next: "library",
            effects: { flags: { musicbox: true } }
          }
        ]
      },

      // 8a ---------------------------------------------------------
      mirror: {
        title: "水鏡の記憶",
        icon: "🪞",
        theme: "day",
        text: [
          "川の中ほどまで来たとき、足元の水面がふっと曇り、見覚えのある景色を映し出した。",
          "満員電車。蛍光灯の白いオフィス。何度も確かめる腕時計。――前の世界の、自分だった。",
          "水鏡の中の自分は、残業帰りの夜道で、ぽつりとつぶやいていた。『時間なんて、止まってしまえばいいのに』",
          "隣で同じものを見ていたリーネが、そっと尋ねる。「あなたの世界でも、時間は……止まってほしいものだったの？」"
        ],
        choices: [
          {
            text: "「あの頃は、時間に追われるだけだった。でも今は、進めたいと思える」",
            next: "ruins",
            effects: { affection: 1, flags: { memory: true } }
          },
          {
            text: "「……見ないでくれ」と、目を逸らす",
            next: "ruins",
            effects: { flags: { memory: true } }
          }
        ]
      },

      // 8b ---------------------------------------------------------
      library: {
        title: "静寂の図書館",
        icon: "📚",
        theme: "ruins",
        fx: "dust",
        text: [
          "修道院の書庫は、舞い上がった埃さえ空中で止まっていた。光の筋の中に浮かぶ塵をかき分け、あなたは一冊の古文書を開く。",
          "『時喰いは外より来たるものにあらず。永き時を独り過ごせし者の、凍てた心より生まれる影なり』",
          "ページをめくる音に振り向くと、リーネが青ざめた顔で立ち尽くしていた。"
        ],
        choices: [
          {
            text: "「リーネ……これは、君のことなのか？」",
            next: "ruins",
            effects: { flags: { lore: true, asked: true } }
          },
          {
            text: "黙って本を閉じ、彼女の肩にそっと手を置く",
            next: "ruins",
            effects: { affection: 1, flags: { lore: true } }
          }
        ]
      },

      // 9 ----------------------------------------------------------
      ruins: {
        title: "陽だまりの神殿",
        icon: "🏜️",
        theme: "ruins",
        fx: "dust",
        text: function (s) {
          var t = [];
          if (s.flags.asked) {
            t.push("リーネは長い沈黙のあと、小さくうなずいた。「……たぶん、そう。私が寂しいって思ったから、あの影は生まれたのかもしれない」");
          } else if (s.flags.lore) {
            t.push("リーネは何も言わなかった。けれど、肩に置いたあなたの手に、そっと自分の手を重ねてきた。");
          }
          t.push(
            "砂に埋もれた『陽だまりの神殿』。崩れかけた祭壇の上で、白く眩しい〈真昼の欠片〉が浮かんでいる。",
            "近づくと、欠片から厳かな声が響いた。",
            "『時が流れれば、出会いには必ず別れが訪れる。花は散り、人は老い、想いさえ移ろう。――それでも汝は、時の流れを望むか』"
          );
          return t;
        },
        choices: [
          {
            text: "「望む。別れがあっても、止まったままよりずっといい」",
            next: "night",
            effects: { affection: 1, shards: 1, flags: { resolve: true } }
          },
          {
            text: "「……わからない。でも、リーネを一人にはしたくない」",
            next: "night",
            effects: { affection: 2, shards: 1 }
          }
        ]
      },

      // 10 ---------------------------------------------------------
      night: {
        title: "止まった星空",
        icon: "🌙",
        theme: "night",
        text: function (s) {
          var t = [
            "神殿を出ると、夜だった。星は瞬くことを忘れ、月は欠けたまま空に貼りついている。",
            "並んで座った砂丘の上で、リーネが膝を抱えた。「ねえ。歯車を回すには、私の力を全部注がないといけないの。そうしたら私は、女神として天の座に還る」",
            "「……たぶん、もう会えない」"
          ];
          if (s.flags.petal) {
            t.push("それから、彼女は空の一点を指さした。「最初の日、あなたが花びらに触れたでしょう？　あの一枚だけね、ずっと、ずっとゆっくり落ち続けてるの。……気づいてた？」");
          }
          return t;
        },
        choices: [
          {
            text: "何も言わず、彼女の手を握る",
            next: "boss",
            effects: { affection: 2 }
          },
          {
            text: "「一緒にいられる方法を、最後まで探そう」",
            next: "boss",
            effects: { affection: 1, flags: { promise: true } }
          },
          {
            text: "「それが君の役目なら……仕方ないな」",
            next: "boss",
            effects: { affection: -1 }
          },
          {
            text: "懐のオルゴールを取り出し、もう一度だけ、ねじを巻いてみる",
            next: "melody",
            requires: function (s) {
              return !!s.flags.musicbox;
            }
          }
        ]
      },

      // 10b（寄り道）------------------------------------------------
      melody: {
        title: "刻告げの歌",
        icon: "🎶",
        theme: "night",
        text: function (s) {
          var t = [
            "かちり、とねじが回った。昼間は、あれほどびくともしなかったのに。",
            "ぽろん、と一音。それから、また一音。錆びた櫛歯が、たどたどしく旋律を紡ぎはじめる。瞬かない星空の下で、その音だけが前へ進んでいく。"
          ];
          if (s.flags.petal) {
            t.push("「……花びらのときと、同じだ」リーネが息をのんだ。「あなたの手からは、時間がこぼれるんだね」");
          } else {
            t.push("「……どうして」リーネが息をのんだ。「あなたが触れているから、かな。あなたの手からは、時間がこぼれるんだね」");
          }
          t.push("やがて彼女は、小さな声で歌いはじめた。百年のあいだ誰にも歌われなかった歌を。少し調子外れで、けれど、とても大切そうに。");
          return t;
        },
        choices: [
          {
            text: "うろ覚えのまま、一緒に口ずさむ",
            next: "boss",
            effects: { affection: 2, flags: { song: true } }
          },
          {
            text: "歌が終わるまで、黙って耳を傾ける",
            next: "boss",
            effects: { affection: 1, flags: { song: true } }
          }
        ]
      },

      // 11 ---------------------------------------------------------
      boss: {
        title: "時喰いの王",
        icon: "🗼",
        theme: "tower",
        enter: "shake",
        text: [
          "始まりの時計塔。果てしない螺旋階段を登りきった頂上に、巨大な時の歯車が沈黙していた。",
          "その中心で、〈黄昏の欠片〉を抱え込むように、ひときわ大きな影がうずくまっている。時喰いの王だ。",
          "影がゆっくりと形を変える。――膝を抱えて座る、少女の姿に。初めて出会ったときの、リーネと同じ姿に。",
          "「来ないで」影が、リーネと同じ声で言った。「時が動けば、また独りになる。だったら、ずっと止まっていればいい」"
        ],
        choices: [
          {
            text: "剣を抜き、正面から斬りかかる",
            next: function (s) {
              return s.affection >= SWORD_AFFECTION ? "sacrifice" : "end_bad";
            },
            effects: { flags: { fought: true } }
          },
          {
            text: "影に語りかける――「君は、リーネの寂しさなんだろう」",
            next: "sacrifice",
            requires: function (s) {
              return !!s.flags.lore;
            },
            effects: { flags: { reached: true } }
          },
          {
            text: "影に告げる――「止まってしまえと願ったのは、僕も同じだ」",
            next: "sacrifice",
            requires: function (s) {
              return !!s.flags.memory;
            },
            effects: { flags: { reached: true } }
          },
          {
            text: "オルゴールの蓋を開け、『刻告げの歌』を影に聴かせる",
            next: "sacrifice",
            requires: function (s) {
              return !!s.flags.song;
            },
            effects: { flags: { reached: true, sang: true } }
          },
          {
            text: "影の隣に、静かに腰を下ろす――「……止まったままでも、いいのかもしれない」",
            next: "end_still",
            requires: function (s) {
              return !!s.flags.memory && !s.flags.resolve;
            },
            effects: { flags: { stayed: true } }
          }
        ]
      },

      // 12 ---------------------------------------------------------
      sacrifice: {
        title: "時の歯車",
        // 時喰いの王を退けると〈黄昏の欠片〉が手に入る
        onEnter: { shards: 1 },
        icon: "⚙️",
        theme: "tower",
        enter: "flash",
        text: function (s) {
          var t = [];
          if (s.flags.reached) {
            t.push(
              "影は動きを止め、じっとあなたを見つめた。「……独りじゃ、ないの？」",
              "あなたがうなずくと、影はほどけるように淡い光へと変わり、リーネの胸の中へ還っていった。残された〈黄昏の欠片〉が、あなたの手のひらに落ちる。"
            );
          } else {
            t.push(
              "剣は霧をすり抜け、影の腕があなたを飲み込もうとする。――そのとき、リーネが前に出た。",
              "「この人に、触れないで」彼女の光が影を包み込み、時喰いの王は悲鳴とともに消えた。〈黄昏の欠片〉が床に転がる。"
            );
          }
          t.push(
            "三つの欠片が歯車の中心に収まると、塔全体が低く唸り、長い長い沈黙が終わろうとしていた。",
            "「最後は、私の番」リーネが歯車に手を添える。その指先から、体が少しずつ光の粒になってほどけていく。「ありがとう。あなたと過ごした時間は、私の永遠の中で一番――」"
          );
          return t;
        },
        choices: [
          {
            text: "「だめだ！」彼女の手を掴み、一緒に歯車を回す",
            next: function (s) {
              return s.affection >= TRUE_END_AFFECTION && s.flags.reached
                ? "end_true"
                : "end_normal";
            },
            effects: { flags: { together: true } }
          },
          {
            text: "彼女の決意を受け止め、最後まで見届ける",
            next: "end_normal"
          }
        ]
      },

      // END: TRUE --------------------------------------------------
      end_true: {
        title: "ふたりで刻む時間",
        icon: "🌅",
        theme: "ending-true",
        fx: "petals-fall",
        enter: "flash",
        ending: { id: "true", name: "TRUE END「ふたりで刻む時間」", kind: "true" },
        text: function (s) {
          var t = [
            "あなたの手がリーネの手に重なった瞬間、ほどけかけていた光が、二人の間で静かに巡りはじめた。",
            "「うそ……力が、半分ずつ……？」異世界から来たあなたの魂が、女神の力を分け合い、受け止めていた。",
            "歯車が回る。カチリ、と世界のどこかで秒針が動いた。",
            "風が吹いた。雲が流れ、鳥が鳴き、止まっていた川がいっせいに歌いはじめる。"
          ];
          if (s.flags.kindness) {
            t.push("遠い村の広場では、転んだ女の子が立ち上がり、涙のあとを手の甲でこすって笑った。");
          }
          if (s.flags.petal) {
            t.push("ずっと宙に留まっていたあの花びらが、ようやくリーネの髪にふわりと落ちた。");
          }
          if (s.flags.song) {
            t.push("塔の鐘が鳴った。百年ぶりのその音に誘われるように、あなたの懐でオルゴールがひとりでに歌いはじめる。");
          }
          if (s.flags.bakeryPromise) {
            t.push("「約束、覚えてる？」リーネがあなたの袖を引いた。「パン、買いに行こう。今度はちゃんと、焼きたてのを」");
          }
          t.push(
            "光輪の消えたリーネは、もう女神ではなかった。けれど、あなたと同じ速さで鼓動する心臓を、彼女は嬉しそうに両手で押さえた。",
            "「ねえ。これからは、同じ時間を生きられるね」",
            "止まっていた世界の、最初の朝日が昇っていく。"
          );
          return t;
        }
      },

      // END: NORMAL ------------------------------------------------
      end_normal: {
        title: "星になった女神",
        icon: "🌟",
        theme: "ending-normal",
        ending: { id: "normal", name: "NORMAL END「星になった女神」", kind: "normal" },
        text: function (s) {
          var t = [];
          if (s.flags.together) {
            t.push("あなたは彼女の手を掴んだ。けれど、ほどけていく光を引き留めるには、二人の想いはまだ少しだけ足りなかった。");
          }
          t.push(
            "歯車が回る。カチリ、と世界のどこかで秒針が動いた。",
            "風が吹き、雲が流れ、止まっていたすべてが息を吹き返す。人々の笑い声が、遠くの村から聞こえてくる。",
            "振り返ると、そこにリーネの姿はなかった。",
            "その夜から、時計塔の真上に、見たことのない星がひとつ瞬くようになった。"
          );
          if (s.flags.song) {
            t.push("あの星がいちばん明るい夜には、懐のオルゴールが、ねじも巻かないのに、ぽろんと一音だけ鳴る。");
          }
          t.push(
            "流れはじめた時間の中で、あなたは今日もその星を見上げる。――止まった世界で過ごした、あの短くて長い日々を思い出しながら。"
          );
          return t;
        }
      },

      // END: BAD ---------------------------------------------------
      end_bad: {
        title: "止まった世界の旅人",
        icon: "🕳️",
        theme: "ending-bad",
        ending: { id: "bad", name: "BAD END「止まった世界の旅人」", kind: "bad" },
        text: [
          "剣は霧をすり抜け、影の腕があなたを包み込んだ。",
          "冷たい。指先から、足先から、少しずつ感覚が失われていく。",
          "「……どうして、もっと」遠くでリーネの声がした気がした。けれど、その続きはもう聞こえない。",
          "あなたの鼓動は、静かに止まった。宙に浮かぶ花びらや、村の少女の涙と同じように。",
          "時の止まった世界には、今日も風が吹かない。"
        ]
      },

      // END: ANOTHER -----------------------------------------------
      end_still: {
        title: "永遠の一秒",
        icon: "🫧",
        theme: "ending-still",
        ending: { id: "another", name: "ANOTHER END「永遠の一秒」", kind: "another" },
        text: [
          "あなたは影の隣に腰を下ろした。冷たいはずの霧は、不思議と、あの夜の焚き火のそばのように静かだった。",
          "「……ほんとうに？」影がこちらを見た。その向こうで、リーネが唇を噛んでいる。止めようとして、けれど、止められずに。",
          "時が流れれば、出会いには必ず別れが訪れる。――なら、流れなければいい。あなたは、そう答えてしまった。",
          "〈黄昏の欠片〉は影の腕の中で鈍く光ったまま、時の歯車は、二度と回らなかった。",
          "花びらは宙に留まり、村の少女の涙は落ちず、星は瞬かない。その止まった世界を、あなたとリーネは、いつまでも並んで歩いている。",
          "別れは来ない。朝も来ない。隣を歩く彼女がときどき時計塔を振り返ることに、あなたは気づかないふりをした。"
        ]
      }
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = STORY;
  } else {
    root.STORY = STORY;
  }
})(this);
