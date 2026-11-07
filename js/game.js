/*
 * ゲームエンジン
 * 状態管理（シーン・好感度・欠片・フラグ）、画面描画、セーブを担当する。
 * file:// でも動くよう ES Modules は使わず、通常の <script> で読み込む。
 */
(function () {
  "use strict";

  var STORY = window.STORY;
  var SAVE_KEY = "chrono-tale-save-v1";
  var ENDINGS_KEY = "chrono-tale-endings-v1";

  var state = null;

  // ---------- localStorage（使えない環境でも落ちないように） ----------
  function storageGet(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* 保存できなくてもゲームは続行できる */
    }
  }
  function storageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      /* noop */
    }
  }

  // ---------- 状態 ----------
  function newState() {
    return { scene: STORY.start, affection: 0, shards: 0, flags: {}, steps: 0 };
  }

  function isValidSave(s) {
    return (
      s &&
      typeof s.scene === "string" &&
      STORY.scenes[s.scene] &&
      !STORY.scenes[s.scene].ending &&
      typeof s.affection === "number" &&
      typeof s.shards === "number" &&
      s.flags &&
      typeof s.flags === "object"
    );
  }

  function applyEffects(s, effects) {
    if (!effects) return;
    if (effects.affection) s.affection += effects.affection;
    if (effects.shards) s.shards = Math.min(STORY.maxShards, s.shards + effects.shards);
    if (effects.flags) {
      Object.keys(effects.flags).forEach(function (k) {
        s.flags[k] = effects.flags[k];
      });
    }
  }

  function resolve(value, s) {
    return typeof value === "function" ? value(s) : value;
  }

  function visibleChoices(scene, s) {
    return (scene.choices || []).filter(function (c) {
      return !c.requires || c.requires(s);
    });
  }

  function seenEndings() {
    var list = storageGet(ENDINGS_KEY);
    return Array.isArray(list) ? list : [];
  }
  function recordEnding(id) {
    var list = seenEndings();
    if (list.indexOf(id) === -1) {
      list.push(id);
      storageSet(ENDINGS_KEY, list);
    }
  }

  // ---------- DOM ----------
  var $ = function (id) {
    return document.getElementById(id);
  };
  var els = {};

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function setTheme(theme) {
    document.body.className = "theme-" + (theme || "title");
  }

  function showScreen(name) {
    els.titleScreen.hidden = name !== "title";
    els.gameScreen.hidden = name !== "game";
  }

  // ---------- タイトル画面 ----------
  function renderTitle() {
    setTheme("title");
    showScreen("title");

    var save = storageGet(SAVE_KEY);
    els.continueBtn.hidden = !isValidSave(save);

    var seen = seenEndings();
    els.endingList.textContent = "";
    var all = Object.keys(STORY.scenes)
      .map(function (id) {
        return STORY.scenes[id].ending;
      })
      .filter(Boolean);
    all.forEach(function (ending) {
      var got = seen.indexOf(ending.id) !== -1;
      var li = el("li", got ? "ending-item is-seen" : "ending-item", got ? ending.name : "？？？");
      els.endingList.appendChild(li);
    });
    els.endingCount.textContent = seen.length + " / " + all.length;
    els.startBtn.focus();
  }

  // ---------- ステータス ----------
  function renderStatus() {
    var gems = "";
    for (var i = 0; i < STORY.maxShards; i++) {
      gems += i < state.shards ? "💎" : "◇";
    }
    els.shards.textContent = gems;
    els.shards.setAttribute("aria-label", "時の欠片 " + state.shards + " / " + STORY.maxShards);

    var ratio = Math.max(0, Math.min(1, state.affection / STORY.maxAffection));
    els.heartFill.style.width = Math.round(ratio * 100) + "%";
    els.heartMeter.setAttribute("aria-valuenow", String(Math.max(0, state.affection)));
    els.heartMeter.setAttribute("aria-valuemax", String(STORY.maxAffection));
  }

  // ---------- シーン ----------
  function renderScene() {
    var scene = STORY.scenes[state.scene];
    if (!scene) {
      // 想定外のIDに来た場合はタイトルへ戻す
      storageRemove(SAVE_KEY);
      renderTitle();
      return;
    }

    setTheme(scene.theme);
    showScreen("game");
    renderStatus();

    els.sceneIcon.textContent = scene.icon || "✨";
    els.sceneTitle.textContent = scene.title;
    els.sceneStep.textContent = scene.ending ? "FIN" : "第" + (state.steps + 1) + "幕";

    // 本文
    els.sceneText.textContent = "";
    resolve(scene.text, state).forEach(function (para, i) {
      var p = el("p", "para", para);
      p.style.animationDelay = i * 0.12 + "s";
      els.sceneText.appendChild(p);
    });

    // 選択肢 / エンディング
    els.choices.textContent = "";
    els.endingBox.hidden = !scene.ending;

    if (scene.ending) {
      recordEnding(scene.ending.id);
      storageRemove(SAVE_KEY);
      els.endingName.textContent = scene.ending.name;
      els.endingBox.setAttribute("data-kind", scene.ending.kind);
      var seen = seenEndings().length;
      els.endingProgress.textContent =
        "見つけたエンディング：" + seen + " / " + STORY.endingCount +
        (seen < STORY.endingCount ? "　――ほかの結末もあるようだ。" : "　――すべての結末を見届けた！");
      els.endingRestart.focus();
    } else {
      visibleChoices(scene, state).forEach(function (choice, i) {
        var btn = el("button", "choice");
        btn.type = "button";
        var num = el("span", "choice-num", String(i + 1));
        num.setAttribute("aria-hidden", "true");
        btn.appendChild(num);
        btn.appendChild(el("span", "choice-text", choice.text));
        btn.addEventListener("click", function () {
          choose(choice);
        });
        btn.style.animationDelay = 0.2 + i * 0.08 + "s";
        els.choices.appendChild(btn);
      });
      storageSet(SAVE_KEY, state);
    }

    // 画面上部へ戻す（スマホで長文を読んだ後に便利）
    window.scrollTo(0, 0);
    els.sceneTitle.focus({ preventScroll: true });
  }

  function choose(choice) {
    applyEffects(state, choice.effects);
    var next = resolve(choice.next, state);
    if (!STORY.scenes[next]) {
      console.error("存在しないシーンです:", next);
      return;
    }
    state.scene = next;
    state.steps += 1;
    applyEffects(state, STORY.scenes[next].onEnter);
    renderScene();
  }

  // ---------- 操作 ----------
  function startNew() {
    state = newState();
    renderScene();
  }

  function continueGame() {
    var save = storageGet(SAVE_KEY);
    if (isValidSave(save)) {
      state = save;
      if (typeof state.steps !== "number") state.steps = 0;
      renderScene();
    } else {
      startNew();
    }
  }

  function restart() {
    var scene = state && STORY.scenes[state.scene];
    if (scene && !scene.ending && !window.confirm("最初からやり直しますか？\n現在の進行状況は失われます。")) {
      return;
    }
    storageRemove(SAVE_KEY);
    startNew();
  }

  function backToTitle() {
    renderTitle();
  }

  // 数字キー 1〜9 で選択肢を選べる
  function onKeyDown(e) {
    if (els.gameScreen.hidden || e.altKey || e.ctrlKey || e.metaKey) return;
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      var btns = els.choices.querySelectorAll(".choice");
      if (btns[n - 1]) {
        e.preventDefault();
        btns[n - 1].click();
      }
    }
  }

  function init() {
    els = {
      titleScreen: $("title-screen"),
      gameScreen: $("game-screen"),
      startBtn: $("start-btn"),
      continueBtn: $("continue-btn"),
      endingList: $("ending-list"),
      endingCount: $("ending-count"),
      shards: $("status-shards"),
      heartMeter: $("heart-meter"),
      heartFill: $("heart-fill"),
      sceneIcon: $("scene-icon"),
      sceneTitle: $("scene-title"),
      sceneStep: $("scene-step"),
      sceneText: $("scene-text"),
      choices: $("choices"),
      endingBox: $("ending-box"),
      endingName: $("ending-name"),
      endingProgress: $("ending-progress"),
      endingRestart: $("ending-restart"),
      endingTitle: $("ending-title"),
      restartBtn: $("restart-btn"),
      titleBtn: $("title-btn")
    };

    els.startBtn.addEventListener("click", startNew);
    els.continueBtn.addEventListener("click", continueGame);
    els.restartBtn.addEventListener("click", restart);
    els.titleBtn.addEventListener("click", backToTitle);
    els.endingRestart.addEventListener("click", restart);
    els.endingTitle.addEventListener("click", backToTitle);
    document.addEventListener("keydown", onKeyDown);

    renderTitle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
