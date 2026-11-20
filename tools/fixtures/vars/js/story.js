/*
 * 検証用の物語データ（状態変数 STORY.vars）。本作のデータではない。
 *
 *   変数：gold（作品全体で 1 つ。初期 100、下限 0）／trust（人物ごと。aoi・beni・sui、初期 0、0〜10）
 *
 *   opening ─ アオイと話す：trust.aoi +3、trust.beni -1（下限 0 で止まる）
 *           ─ ベニと話す　：trust.beni +3
 *           ─ スイと話す　：trust.sui +12（上限 10 で止まる）、gold -30
 *   market（onEnter：gold +20）
 *           ─ 花を買う　　：requires gold >= 30。gold -30、trust.aoi +1
 *           ─ 指輪を買う　：requires gold >= 120。gold を 0 に代入（set）、trust.beni +5
 *           ─ 何も買わない
 *   plaza（本文が gold を読む）─next(関数)→ trust.aoi >= 4：end_aoi ／ trust.beni >= 3：end_beni ／
 *                                            trust.sui >= 10：end_sui ／ どれでもない：end_alone
 */
(function (root) {
  "use strict";
  var STORY = {
    start: "opening",
    maxShards: 0,
    maxAffection: 0,
    endingCount: 4,
    vars: {
      gold: { initial: 100, min: 0 },
      trust: { initial: 0, min: 0, max: 10, per: ["aoi", "beni", "sui"] }
    },
    cast: {
      aoi: { name: "アオイ" },
      beni: { name: "ベニ" },
      sui: { name: "スイ" }
    },
    scenes: {
      opening: {
        title: "三人の旅人",
        icon: "◇",
        theme: "day",
        text: ["（序 1）宿の食堂に、旅人が三人いる。", { text: "（序 2）誰と話そうか。", speaker: "aoi" }],
        choices: [
          { text: "アオイと話す", next: "market", effects: { vars: { trust: { aoi: 3, beni: -1 } } } },
          { text: "ベニと話す", next: "market", effects: { vars: { trust: { beni: 3 } } } },
          { text: "スイと話す", next: "market", effects: { vars: { trust: { sui: 12 }, gold: -30 } } }
        ]
      },
      market: {
        title: "市場",
        icon: "◇",
        theme: "day",
        onEnter: { vars: { gold: 20 } },
        text: ["（市 1）市場は賑わっている。", "（市 2）何か買っていこうか。"],
        choices: [
          {
            text: "花を買う（30）",
            next: "plaza",
            requires: function (s) {
              return s.vars.gold >= 30;
            },
            effects: { vars: { gold: -30, trust: { aoi: 1 } } }
          },
          {
            text: "指輪を買う（120）",
            next: "plaza",
            requires: function (s) {
              return s.vars.gold >= 120;
            },
            effects: { vars: { gold: { set: 0 }, trust: { beni: 5 } } }
          },
          { text: "何も買わない", next: "plaza" }
        ]
      },
      plaza: {
        title: "広場",
        icon: "◇",
        theme: "day",
        text: function (s) {
          return ["（広 1）広場に出た。", "（広 2）財布の中身は " + s.vars.gold + " 枚。"];
        },
        next: function (s) {
          if (s.vars.trust.aoi >= 4) return "end_aoi";
          if (s.vars.trust.beni >= 3) return "end_beni";
          if (s.vars.trust.sui >= 10) return "end_sui";
          return "end_alone";
        }
      },
      end_aoi: {
        title: "アオイと",
        icon: "◇",
        theme: "day",
        text: ["（結 A）アオイと旅を続けることにした。"],
        ending: { id: "aoi", name: "END A「花の道」", kind: "true" }
      },
      end_beni: {
        title: "ベニと",
        icon: "◇",
        theme: "day",
        text: ["（結 B）ベニと旅を続けることにした。"],
        ending: { id: "beni", name: "END B「指輪の約束」", kind: "normal" }
      },
      end_sui: {
        title: "スイと",
        icon: "◇",
        theme: "day",
        text: ["（結 C）スイと旅を続けることにした。"],
        ending: { id: "sui", name: "END C「信頼の上限」", kind: "normal" }
      },
      end_alone: {
        title: "ひとりで",
        icon: "◇",
        theme: "day",
        text: ["（結 D）ひとりで旅を続けることにした。"],
        ending: { id: "alone", name: "END D「ひとり旅」", kind: "bad" }
      }
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = STORY;
  else root.STORY = STORY;
})(this);
