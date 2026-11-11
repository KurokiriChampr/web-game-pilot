/*
 * ゲームエンジン
 * 状態管理（シーン・好感度・欠片・フラグ）、画面描画、文字送り、
 * セーブ／ロード、バックログ、設定を担当する。
 * 画像と BGM は js/assets.js（GameAssets）に任せる。
 * file:// でも動くよう ES Modules は使わず、通常の <script> で読み込む。
 */
(function () {
  "use strict";

  var STORY = window.STORY;
  var Assets = window.GameAssets;

  var KEYS = {
    auto: "chrono-tale-save-v1", // オートセーブ（旧バージョンと互換）
    endings: "chrono-tale-endings-v1",
    slots: "chrono-tale-slots-v1",
    settings: "chrono-tale-settings-v1",
    read: "chrono-tale-read-v1"
  };
  var SLOT_COUNT = 3;
  var LOG_LIMIT = 150;
  // cps = 1秒あたりの文字数。0 は一瞬で表示。
  var SPEEDS = [
    { label: "ゆっくり", cps: 18 },
    { label: "ふつう", cps: 36 },
    { label: "はやい", cps: 80 },
    { label: "一瞬", cps: 0 }
  ];
  var FX_COUNT = { petals: 14, "petals-fall": 18, motes: 16, embers: 14, dust: 20 };

  var state = null;
  var settings = null;
  var savesMode = "save";
  var typer = { raf: 0, active: false, finish: null };

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
      return true;
    } catch (e) {
      return false; // 保存できなくてもゲームは続行できる
    }
  }
  function storageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      /* noop */
    }
  }

  // ---------- 設定 ----------
  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function loadSettings() {
    var s = storageGet(KEYS.settings) || {};
    var speed = parseInt(s.textSpeed, 10);
    return {
      textSpeed: speed >= 0 && speed < SPEEDS.length ? speed : prefersReducedMotion() ? 3 : 1,
      skipRead: !!s.skipRead,
      volume: typeof s.volume === "number" ? Math.max(0, Math.min(1, s.volume)) : 0.6,
      muted: !!s.muted,
      images: s.images !== false
    };
  }
  function saveSettings() {
    storageSet(KEYS.settings, settings);
  }

  // ---------- 状態 ----------
  function newState() {
    return { scene: STORY.start, affection: 0, shards: 0, flags: {}, steps: 0, log: [] };
  }

  function isValidSave(s) {
    return !!(
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

  /** セーブデータを複製し、旧バージョンに無い項目を補う */
  function restoreState(saved) {
    var s = JSON.parse(JSON.stringify(saved));
    if (typeof s.steps !== "number") s.steps = 0;
    if (!Array.isArray(s.log)) s.log = [];
    return s;
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

  function currentScene() {
    return state ? STORY.scenes[state.scene] : null;
  }

  function inGame() {
    return !els.gameScreen.hidden;
  }

  // ---------- 記録（エンディング・既読シーン） ----------
  function listOf(key) {
    var list = storageGet(key);
    return Array.isArray(list) ? list : [];
  }
  function addTo(key, id) {
    var list = listOf(key);
    if (list.indexOf(id) === -1) {
      list.push(id);
      storageSet(key, list);
    }
  }
  function seenEndings() {
    return listOf(KEYS.endings);
  }
  function readScenes() {
    return listOf(KEYS.read).filter(function (id) {
      return !!STORY.scenes[id];
    });
  }

  // ---------- バックログ ----------
  function pushLog(entry) {
    state.log.push(entry);
    if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
  }
  function logScene() {
    var scene = currentScene();
    pushLog({ k: "s", title: scene.title, paras: resolve(scene.text, state) });
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
    var body = document.body;
    Array.prototype.slice.call(body.classList).forEach(function (c) {
      if (c.indexOf("theme-") === 0) body.classList.remove(c);
    });
    body.classList.add("theme-" + (theme || "title"));
  }

  function showScreen(name) {
    els.titleScreen.hidden = name !== "title";
    els.gameScreen.hidden = name !== "game";
  }

  function replayAnimation(node, className) {
    node.classList.remove(className);
    void node.offsetWidth; // アニメーションを最初からやり直す
    node.classList.add(className);
  }

  function toast(message) {
    var node = el("div", "toast", message);
    els.toasts.appendChild(node);
    setTimeout(function () {
      node.classList.add("is-leaving");
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 400);
    }, 2600);
  }

  // ---------- ダイアログ ----------
  function openDialog(dialog) {
    if (dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }
  function closeDialog(dialog) {
    if (!dialog.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }
  function closeAllDialogs() {
    Array.prototype.forEach.call(document.querySelectorAll("dialog"), closeDialog);
  }
  function anyDialogOpen() {
    return !!document.querySelector("dialog[open]");
  }

  // ---------- 演出 ----------
  function setFx(type) {
    var layer = els.fxLayer;
    if (layer.getAttribute("data-fx") === (type || "")) return;
    layer.setAttribute("data-fx", type || "");
    layer.textContent = "";
    var count = FX_COUNT[type] || 0;
    for (var i = 0; i < count; i++) {
      var p = el("span", "fx fx-" + type);
      p.style.setProperty("--x", (Math.random() * 100).toFixed(1) + "%");
      p.style.setProperty("--y", (Math.random() * 100).toFixed(1) + "%");
      p.style.setProperty("--d", (-Math.random() * 12).toFixed(2) + "s");
      p.style.setProperty("--s", (0.6 + Math.random() * 0.9).toFixed(2));
      p.style.setProperty("--r", Math.round(Math.random() * 360) + "deg");
      layer.appendChild(p);
    }
  }

  function playEnterEffect(scene) {
    replayAnimation(els.sceneCard, "is-entering");
    els.sceneCard.classList.remove("is-shaking");
    if (scene.enter === "shake") replayAnimation(els.sceneCard, "is-shaking");
    if (scene.enter === "flash") replayAnimation(els.flash, "is-on");
  }

  // 背景鑑賞モード（UI を隠して画像だけを見る）
  function setPeek(on) {
    document.body.classList.toggle("is-peek", on);
    els.peekExit.hidden = !on;
    if (on) els.peekExit.focus();
  }

  // ---------- 文字送り ----------
  function stopTyping() {
    if (typer.raf) window.cancelAnimationFrame(typer.raf);
    typer.raf = 0;
    typer.active = false;
    typer.finish = null;
    els.skipHint.hidden = true;
  }

  function typeScene(paras, instant, onDone) {
    stopTyping();
    els.sceneText.textContent = "";

    // 全文をあらかじめ配置し、未表示部分は透明にしておく（文字送り中に行が動かない）
    var nodes = paras.map(function (text) {
      var p = el("p", "para");
      var shown = el("span", "para-shown");
      var rest = el("span", "para-rest", text);
      p.appendChild(shown);
      p.appendChild(rest);
      els.sceneText.appendChild(p);
      return { p: p, shown: shown, rest: rest, chars: Array.from(text) };
    });

    function finish() {
      nodes.forEach(function (n) {
        n.shown.textContent = n.chars.join("");
        n.rest.textContent = "";
        n.p.classList.add("is-shown");
      });
      stopTyping();
      onDone();
    }

    if (instant || !nodes.length || !window.requestAnimationFrame) {
      finish();
      return;
    }

    var index = 0;
    var pos = 0;
    var carry = 0;
    var pause = 0;
    var last = null;

    typer.active = true;
    typer.finish = finish;
    els.skipHint.hidden = false;
    nodes[0].p.classList.add("is-shown");

    function tick(now) {
      if (!typer.active) return;
      var cps = SPEEDS[settings.textSpeed].cps;
      if (!cps) {
        finish();
        return;
      }
      var dt = last == null ? 0 : Math.min(now - last, 100);
      last = now;

      if (pause > 0) {
        pause -= dt;
      } else {
        carry += (dt * cps) / 1000;
        var step = Math.floor(carry);
        if (step > 0) {
          carry -= step;
          var node = nodes[index];
          pos = Math.min(node.chars.length, pos + step);
          node.shown.textContent = node.chars.slice(0, pos).join("");
          node.rest.textContent = node.chars.slice(pos).join("");
          if (pos >= node.chars.length) {
            index += 1;
            pos = 0;
            carry = 0;
            pause = 9000 / cps; // 段落の区切りで一呼吸おく
            if (index >= nodes.length) {
              finish();
              return;
            }
            nodes[index].p.classList.add("is-shown");
          }
        }
      }
      typer.raf = window.requestAnimationFrame(tick);
    }
    typer.raf = window.requestAnimationFrame(tick);
  }

  function finishTyping() {
    if (typer.active && typer.finish) typer.finish();
  }

  // ---------- タイトル画面 ----------
  function renderTitle() {
    stopTyping();
    setPeek(false);
    setTheme("title");
    setFx("petals");
    showScreen("title");
    Assets.setScene("title");

    els.continueBtn.hidden = !isValidSave(storageGet(KEYS.auto));

    var seen = seenEndings();
    els.endingList.textContent = "";
    var all = Object.keys(STORY.scenes)
      .map(function (id) {
        return STORY.scenes[id].ending;
      })
      .filter(Boolean);
    var got = 0;
    all.forEach(function (ending) {
      var has = seen.indexOf(ending.id) !== -1;
      if (has) got += 1;
      els.endingList.appendChild(
        el("li", has ? "ending-item is-seen" : "ending-item", has ? ending.name : "？？？")
      );
    });
    els.endingCount.textContent = got + " / " + all.length;
    els.sceneRate.textContent = readScenes().length + " / " + Object.keys(STORY.scenes).length;
    (els.continueBtn.hidden ? els.startBtn : els.continueBtn).focus();
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
  function showChoices(scene) {
    els.choices.textContent = "";
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
      btn.style.animationDelay = i * 0.08 + "s";
      els.choices.appendChild(btn);
    });
  }

  function showEnding(scene) {
    els.endingName.textContent = scene.ending.name;
    els.endingBox.setAttribute("data-kind", scene.ending.kind);
    var seen = seenEndings().length;
    els.endingProgress.textContent =
      "見つけたエンディング：" + seen + " / " + STORY.endingCount +
      (seen < STORY.endingCount ? "　――ほかの結末もあるようだ。" : "　――すべての結末を見届けた！");
    els.endingBox.hidden = false;
  }

  function renderScene() {
    var scene = currentScene();
    if (!scene) {
      // 想定外のIDに来た場合はタイトルへ戻す
      storageRemove(KEYS.auto);
      renderTitle();
      return;
    }
    var id = state.scene;

    setPeek(false);
    setTheme(scene.theme);
    setFx(scene.fx);
    showScreen("game");
    renderStatus();
    Assets.setScene(id);
    playEnterEffect(scene);

    els.sceneIcon.textContent = scene.icon || "✨";
    els.sceneTitle.textContent = scene.title;
    els.sceneStep.textContent = scene.ending ? "FIN" : "第" + (state.steps + 1) + "幕";
    els.choices.textContent = "";
    els.endingBox.hidden = true;
    els.menuSave.disabled = !!scene.ending;

    if (scene.ending) {
      addTo(KEYS.endings, scene.ending.id);
      storageRemove(KEYS.auto);
    } else {
      storageSet(KEYS.auto, state);
    }

    var instant =
      SPEEDS[settings.textSpeed].cps === 0 ||
      (settings.skipRead && readScenes().indexOf(id) !== -1);

    typeScene(resolve(scene.text, state), instant, function () {
      addTo(KEYS.read, id);
      if (scene.ending) showEnding(scene);
      else showChoices(scene);
    });

    // 画面上部へ戻す（スマホで長文を読んだ後に便利）
    window.scrollTo(0, 0);
    els.sceneTitle.focus({ preventScroll: true });
  }

  function choose(choice) {
    var before = { shards: state.shards, affection: state.affection };
    var probe = restoreState(state);
    applyEffects(probe, choice.effects);
    var next = resolve(choice.next, probe);
    if (!STORY.scenes[next]) {
      console.error("存在しないシーンです:", next);
      return;
    }

    pushLog({ k: "c", text: choice.text });
    applyEffects(state, choice.effects);
    state.scene = next;
    state.steps += 1;
    applyEffects(state, STORY.scenes[next].onEnter);
    logScene();
    renderScene();

    for (var i = before.shards; i < state.shards; i++) {
      toast("💎 " + ((STORY.shardNames && STORY.shardNames[i]) || "時の欠片") + "を手に入れた");
    }
    if (state.affection !== before.affection) {
      replayAnimation(els.heartMeter, state.affection > before.affection ? "is-up" : "is-down");
    }
  }

  // ---------- 操作 ----------
  function startNew() {
    closeAllDialogs();
    state = newState();
    logScene();
    renderScene();
  }

  function loadState(saved) {
    closeAllDialogs();
    state = restoreState(saved);
    if (!state.log.length) logScene();
    renderScene();
  }

  function continueGame() {
    var save = storageGet(KEYS.auto);
    if (isValidSave(save)) loadState(save);
    else startNew();
  }

  function isPlaying() {
    var scene = currentScene();
    return inGame() && !!scene && !scene.ending;
  }

  function restart() {
    if (isPlaying() && !window.confirm("最初からやり直しますか？\n現在の進行状況は失われます（セーブスロットは残ります）。")) {
      return;
    }
    storageRemove(KEYS.auto);
    startNew();
  }

  function backToTitle() {
    closeAllDialogs();
    renderTitle();
  }

  // ---------- セーブ / ロード ----------
  function getSlots() {
    var slots = storageGet(KEYS.slots);
    return slots && typeof slots === "object" && !Array.isArray(slots) ? slots : {};
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }
  function formatDate(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) return "";
    return (
      d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + pad(d.getDate()) +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
  }

  function describeSave(s, savedAt) {
    var scene = STORY.scenes[s.scene];
    var text = "第" + ((s.steps || 0) + 1) + "幕「" + scene.title + "」　💎" + s.shards + "/" + STORY.maxShards;
    var date = savedAt ? formatDate(savedAt) : "";
    return date ? text + "　" + date : text;
  }

  function saveToSlot(n) {
    if (!isPlaying()) return;
    var slots = getSlots();
    if (slots[n] && !window.confirm("スロット " + n + " に上書きしますか？")) return;
    slots[n] = { savedAt: Date.now(), state: restoreState(state) };
    if (storageSet(KEYS.slots, slots)) toast("💾 スロット " + n + " にセーブしました");
    else toast("⚠ このブラウザではセーブできませんでした");
    renderSaves();
  }

  function loadFrom(saved) {
    if (!isValidSave(saved)) return;
    if (isPlaying() && !window.confirm("ロードしますか？\n現在の進行状況は失われます。")) return;
    loadState(saved);
    toast("📂 ロードしました");
  }

  function deleteSlot(n) {
    if (!window.confirm("スロット " + n + " のデータを削除しますか？")) return;
    var slots = getSlots();
    delete slots[n];
    storageSet(KEYS.slots, slots);
    renderSaves();
  }

  function saveRow(name, desc, actions) {
    var li = el("li", "save-row");
    var info = el("div", "save-info");
    info.appendChild(el("p", "save-name", name));
    info.appendChild(el("p", "save-desc", desc));
    li.appendChild(info);
    var box = el("div", "save-actions");
    actions.forEach(function (a) {
      var btn = el("button", "btn btn-small" + (a.primary ? " btn-primary" : ""), a.label);
      btn.type = "button";
      if (a.ariaLabel) btn.setAttribute("aria-label", a.ariaLabel);
      btn.disabled = !!a.disabled;
      btn.addEventListener("click", a.run);
      box.appendChild(btn);
    });
    li.appendChild(box);
    return li;
  }

  function renderSaves() {
    var saving = savesMode === "save";
    els.savesHeading.textContent = saving ? "セーブ" : "ロード";
    els.savesList.textContent = "";

    if (!saving) {
      var auto = storageGet(KEYS.auto);
      var autoOk = isValidSave(auto);
      els.savesList.appendChild(
        saveRow("オートセーブ", autoOk ? describeSave(auto) : "（データなし）", [
          {
            label: "ロード",
            primary: true,
            disabled: !autoOk,
            run: function () {
              loadFrom(auto);
            }
          }
        ])
      );
    }

    var slots = getSlots();
    for (var n = 1; n <= SLOT_COUNT; n++) {
      (function (n) {
        var slot = slots[n];
        var ok = !!slot && isValidSave(slot.state);
        var actions = [];
        if (saving) {
          actions.push({
            label: ok ? "上書き" : "ここに保存",
            primary: true,
            run: function () {
              saveToSlot(n);
            }
          });
        } else {
          actions.push({
            label: "ロード",
            primary: true,
            disabled: !ok,
            run: function () {
              loadFrom(slot.state);
            }
          });
        }
        if (ok) {
          actions.push({
            label: "🗑",
            ariaLabel: "スロット " + n + " を削除",
            run: function () {
              deleteSlot(n);
            }
          });
        }
        els.savesList.appendChild(
          saveRow("スロット " + n, ok ? describeSave(slot.state, slot.savedAt) : "（空き）", actions)
        );
      })(n);
    }
  }

  function openSaves(mode) {
    if (mode === "save" && !isPlaying()) return;
    savesMode = mode;
    renderSaves();
    closeDialog(els.menuDialog);
    openDialog(els.savesDialog);
  }

  // ---------- バックログ表示 ----------
  function openLog() {
    if (!state) return;
    els.logList.textContent = "";
    state.log.forEach(function (entry) {
      if (entry.k === "c") {
        els.logList.appendChild(el("p", "log-choice", "▶ " + entry.text));
      } else {
        els.logList.appendChild(el("h3", "log-scene", entry.title));
        (entry.paras || []).forEach(function (para) {
          els.logList.appendChild(el("p", "log-para", para));
        });
      }
    });
    closeDialog(els.menuDialog);
    openDialog(els.logDialog);
    els.logList.scrollTop = els.logList.scrollHeight; // 最新の行から読めるように
    els.logList.focus();
  }

  // ---------- 設定表示 ----------
  function renderMute() {
    els.muteBtn.textContent = settings.muted ? "🔇" : "🔊";
    els.muteBtn.setAttribute("aria-pressed", String(settings.muted));
    els.setMute.checked = settings.muted;
  }

  function renderSettings() {
    els.setSpeed.value = String(settings.textSpeed);
    els.setSpeedLabel.textContent = SPEEDS[settings.textSpeed].label;
    els.setSkip.checked = settings.skipRead;
    els.setVolume.value = String(Math.round(settings.volume * 100));
    els.setVolumeLabel.textContent = String(Math.round(settings.volume * 100));
    els.setImages.checked = settings.images;
    renderMute();
  }

  function setMuted(flag) {
    settings.muted = !!flag;
    Assets.setMuted(settings.muted);
    saveSettings();
    renderMute();
  }

  function openSettings() {
    renderSettings();
    closeDialog(els.menuDialog);
    openDialog(els.settingsDialog);
  }

  function resetData() {
    if (!window.confirm("セーブデータ・見つけたエンディング・既読の記録をすべて消去します。\nよろしいですか？")) return;
    [KEYS.auto, KEYS.slots, KEYS.endings, KEYS.read].forEach(storageRemove);
    state = null;
    closeAllDialogs();
    renderTitle();
    toast("🗑 記録を消去しました");
  }

  // 画像・BGM の状態が変わったときに UI を合わせる
  function onAssetsChange(info) {
    var hasImage = !!info.image;
    els.sceneVisual.hidden = !hasImage;
    if (hasImage) {
      if (els.sceneVisualImg.getAttribute("src") !== info.image) els.sceneVisualImg.src = info.image;
    } else {
      els.sceneVisualImg.removeAttribute("src");
      setPeek(false);
    }
    els.menuPeek.hidden = !hasImage;

    if (info.manifest === "loading") {
      els.assetStatus.textContent = "画像・BGM を確認しています…";
    } else if (info.manifest === "none") {
      els.assetStatus.textContent = "画像・BGM の設定（assets/manifest.json）を読み込めないため、テキストのみで動作しています。";
    } else {
      els.assetStatus.textContent =
        "この場面：背景画像 " + (hasImage ? "あり" : "なし") + " ／ BGM " + (info.bgm ? "あり" : "なし");
    }
  }

  // ---------- キーボード ----------
  function onKeyDown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.body.classList.contains("is-peek")) {
      if (e.key === "Escape") setPeek(false);
      return;
    }
    if (!inGame() || anyDialogOpen()) return;

    var onControl = e.target && e.target.closest && e.target.closest("button, input, select, textarea, a");

    if ((e.key === "Enter" || e.key === " ") && typer.active && !onControl) {
      e.preventDefault();
      finishTyping();
      return;
    }

    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      var btns = els.choices.querySelectorAll(".choice");
      if (btns[n - 1]) {
        e.preventDefault();
        btns[n - 1].click();
      }
      return;
    }

    var key = e.key.toLowerCase();
    if (key === "l") openLog();
    else if (key === "s") openSaves("save");
    else if (key === "m") setMuted(!settings.muted);
  }

  function init() {
    els = {
      titleScreen: $("title-screen"),
      gameScreen: $("game-screen"),
      fxLayer: $("fx-layer"),
      flash: $("flash"),
      toasts: $("toasts"),
      startBtn: $("start-btn"),
      continueBtn: $("continue-btn"),
      titleLoadBtn: $("title-load-btn"),
      titleSettingsBtn: $("title-settings-btn"),
      endingList: $("ending-list"),
      endingCount: $("ending-count"),
      sceneRate: $("scene-rate"),
      shards: $("status-shards"),
      heartMeter: $("heart-meter"),
      heartFill: $("heart-fill"),
      logBtn: $("log-btn"),
      muteBtn: $("mute-btn"),
      menuBtn: $("menu-btn"),
      sceneCard: $("scene-card"),
      sceneVisual: $("scene-visual"),
      sceneVisualImg: $("scene-visual-img"),
      sceneIcon: $("scene-icon"),
      sceneTitle: $("scene-title"),
      sceneStep: $("scene-step"),
      sceneText: $("scene-text"),
      skipHint: $("skip-hint"),
      choices: $("choices"),
      endingBox: $("ending-box"),
      endingName: $("ending-name"),
      endingProgress: $("ending-progress"),
      endingRestart: $("ending-restart"),
      endingLoad: $("ending-load"),
      endingTitle: $("ending-title"),
      peekExit: $("peek-exit"),
      menuDialog: $("menu-dialog"),
      menuSave: $("menu-save"),
      menuLoad: $("menu-load"),
      menuLog: $("menu-log"),
      menuSettings: $("menu-settings"),
      menuPeek: $("menu-peek"),
      menuRestart: $("menu-restart"),
      menuTitle: $("menu-title"),
      savesDialog: $("saves-dialog"),
      savesHeading: $("saves-heading"),
      savesList: $("saves-list"),
      logDialog: $("log-dialog"),
      logList: $("log-list"),
      settingsDialog: $("settings-dialog"),
      setSpeed: $("set-speed"),
      setSpeedLabel: $("set-speed-label"),
      setSkip: $("set-skip"),
      setVolume: $("set-volume"),
      setVolumeLabel: $("set-volume-label"),
      setMute: $("set-mute"),
      setImages: $("set-images"),
      assetStatus: $("asset-status"),
      resetData: $("reset-data")
    };

    settings = loadSettings();

    // タイトル
    els.startBtn.addEventListener("click", startNew);
    els.continueBtn.addEventListener("click", continueGame);
    els.titleLoadBtn.addEventListener("click", function () {
      openSaves("load");
    });
    els.titleSettingsBtn.addEventListener("click", openSettings);

    // ステータスバー・メニュー
    els.logBtn.addEventListener("click", openLog);
    els.muteBtn.addEventListener("click", function () {
      setMuted(!settings.muted);
    });
    els.menuBtn.addEventListener("click", function () {
      openDialog(els.menuDialog);
    });
    els.menuSave.addEventListener("click", function () {
      openSaves("save");
    });
    els.menuLoad.addEventListener("click", function () {
      openSaves("load");
    });
    els.menuLog.addEventListener("click", openLog);
    els.menuSettings.addEventListener("click", openSettings);
    els.menuPeek.addEventListener("click", function () {
      closeAllDialogs();
      setPeek(true);
    });
    els.menuRestart.addEventListener("click", restart);
    els.menuTitle.addEventListener("click", backToTitle);

    // エンディング
    els.endingRestart.addEventListener("click", restart);
    els.endingLoad.addEventListener("click", function () {
      openSaves("load");
    });
    els.endingTitle.addEventListener("click", backToTitle);

    // 本文をタップすると全文表示
    els.sceneCard.addEventListener("click", function (e) {
      if (typer.active && !(e.target.closest && e.target.closest("button, a"))) finishTyping();
    });
    els.sceneVisual.addEventListener("click", function () {
      setPeek(true);
    });
    els.peekExit.addEventListener("click", function () {
      setPeek(false);
    });

    // ダイアログ：閉じるボタンと、枠の外側クリックで閉じる
    Array.prototype.forEach.call(document.querySelectorAll("dialog"), function (dialog) {
      dialog.addEventListener("click", function (e) {
        if (e.target === dialog || (e.target.closest && e.target.closest("[data-close]"))) {
          closeDialog(dialog);
        }
      });
    });

    // 設定
    els.setSpeed.addEventListener("input", function () {
      settings.textSpeed = Math.max(0, Math.min(SPEEDS.length - 1, parseInt(els.setSpeed.value, 10) || 0));
      els.setSpeedLabel.textContent = SPEEDS[settings.textSpeed].label;
      saveSettings();
    });
    els.setSkip.addEventListener("change", function () {
      settings.skipRead = els.setSkip.checked;
      saveSettings();
    });
    els.setVolume.addEventListener("input", function () {
      settings.volume = (parseInt(els.setVolume.value, 10) || 0) / 100;
      els.setVolumeLabel.textContent = String(Math.round(settings.volume * 100));
      Assets.setVolume(settings.volume);
      saveSettings();
    });
    els.setMute.addEventListener("change", function () {
      setMuted(els.setMute.checked);
    });
    els.setImages.addEventListener("change", function () {
      settings.images = els.setImages.checked;
      Assets.setImagesEnabled(settings.images);
      saveSettings();
    });
    els.resetData.addEventListener("click", resetData);

    document.addEventListener("keydown", onKeyDown);

    renderSettings();
    Assets.onChange(onAssetsChange);
    onAssetsChange(Assets.info());
    Assets.init({ volume: settings.volume, muted: settings.muted, images: settings.images });

    renderTitle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
