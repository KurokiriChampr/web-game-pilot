/*
 * ゲームエンジン（作品に依らない共通部分）
 * 作品ごとに変わるものは、このファイルには書かない：
 *   js/work.js（WORK＝題名・用語・保存キーの接頭辞・上限値）／js/story.js（STORY＝物語データ）／
 *   assets/manifest.json（素材の対応表）／css/work.css（配色）。境界の説明は docs/ENGINE.md。
 * 状態管理（シーン・好感度・欠片・フラグ）、画面描画、文字送り、
 * セーブ／ロード、バックログ（選択肢への巻き戻し）、既読（ページ単位）、オート、設定を担当する。
 * 画面はビジュアルノベル型（全面背景＋立ち絵＋下部メッセージウィンドウ）。
 * 本文は 1 段落ずつメッセージウィンドウに表示し、タップ / Enter で読み進める。
 * 画像・立ち絵・BGM は js/assets.js（GameAssets）に任せる。
 * file:// でも動くよう ES Modules は使わず、通常の <script> で読み込む。
 */
(function () {
  "use strict";

  // 版を上げるときは index.html の data-app-version と ?v= も同じ値にする
  var VERSION = "3.0-p4";

  var STORY = window.STORY;
  var WORK = window.WORK && typeof window.WORK === "object" ? window.WORK : {}; // 作品設定（js/work.js）
  var Assets = window.GameAssets;
  var Stage = window.GameStage; // ページの正規化と舞台状態の計算（js/stage.js）

  /** 作品設定から値を取る。cfg("hud.shards.name", "欠片")。無い・型が違うときは fallback */
  function cfg(path, fallback) {
    var v = WORK;
    var parts = path.split(".");
    for (var i = 0; i < parts.length; i++) {
      if (!v || typeof v !== "object") return fallback;
      v = v[parts[i]];
    }
    return v == null || (fallback != null && typeof v !== typeof fallback) ? fallback : v;
  }
  function cfgInt(path, fallback, min, max) {
    var n = parseInt(cfg(path, fallback), 10);
    return n >= min && n <= max ? n : fallback;
  }

  // 保存キーは「作品 ID（WORK.id）＋役割」。同じサイトに別作品を置いても混ざらないようにするためのもの。
  // 例：WORK.id が abc なら abc-save-v1 など。公開後に id を変えると、セーブを引き継げなくなる。
  var WORK_ID = typeof WORK.id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(WORK.id) ? WORK.id : "";
  var KEYS = {
    auto: WORK_ID + "-save-v1", // オートセーブ（旧バージョンと互換）
    endings: WORK_ID + "-endings-v1",
    slots: WORK_ID + "-slots-v1",
    settings: WORK_ID + "-settings-v1",
    read: WORK_ID + "-read-v1"
  };
  var SLOT_COUNT = cfgInt("slots", 3, 1, 30);
  // バックログ（＝セーブデータに入る）の上限。長編でセーブが際限なく太らないよう、3 つの物差しで抑える。
  //   行数（シーンと選択肢の行）／ページ数（本文の量）／巻き戻し用の控え（フラグの写し）を持つ選択肢の数
  // 本作（1 周 20 シーン未満・100 ページ未満）では、どれにも届かない。
  var LOG_LIMIT = cfgInt("limits.logEntries", 150, 10, 2000);
  var LOG_PAGE_LIMIT = cfgInt("limits.logPages", 600, 20, 20000);
  var REWIND_LIMIT = cfgInt("limits.rewindPoints", 40, 1, 2000);
  // 画面に出す用語（作品設定で差し替える。ここにあるのは、設定が無いときの一般的な言い方）
  var SHARD_NAME = cfg("hud.shards.name", "欠片");
  var SHARD_LABEL = cfg("hud.shards.label", "欠片");
  var HEART_NAME = cfg("hud.heart.name", "好感度");
  var HEART_LABEL = cfg("hud.heart.label", "好感度");
  // cps = 1秒あたりの文字数。0 は一瞬で表示。
  var SPEEDS = [
    { label: "ゆっくり", cps: 18 },
    { label: "ふつう", cps: 36 },
    { label: "はやい", cps: 80 },
    { label: "一瞬", cps: 0 }
  ];
  // オート：文字送りが終わってから次のページへ進むまでの待ち時間（ミリ秒）＝ base + perChar × 文字数
  var AUTO_SPEEDS = [
    { label: "ゆっくり", base: 1800, perChar: 120 },
    { label: "ふつう", base: 1200, perChar: 80 },
    { label: "はやい", base: 700, perChar: 45 }
  ];
  var FONT_SIZES = ["標準", "大", "特大"]; // 見た目は css の body[data-font]
  var WINDOW_LEVELS = ["うすい", "ふつう", "こい"]; // メッセージウィンドウの濃さ。css の body[data-window]
  var SCREEN_FX = ["shake", "flash"]; // 画面全体の演出（シーンの enter・段落の fx）
  var FX_COUNT = { petals: 14, "petals-fall": 18, motes: 16, embers: 14, dust: 20 };

  var state = null;
  var settings = null;
  var savesMode = "save";
  var typer = { raf: 0, active: false, finish: null };
  // メッセージウィンドウのページ送り（1 段落 = 1 ページ）
  // pages = 正規化済みのページ（{ text, speaker, ... }）、paras = その本文（文字列）だけ
  // read = シーンに入った時点で、各ページが既読だったか（スキップと「既読は一瞬で表示」の判定に使う）
  var pager = { pages: [], paras: [], read: [], staged: false, index: 0, pageDone: false, ended: false };
  var auto = { on: false, timer: 0 }; // オートモード（保存しない。画面を開いているあいだだけの状態）
  var confirmRun = null; // 確認ダイアログで「はい」を押したときに実行する処理
  var OVERLAY_LOCK_MS = 450; // 連打で選択肢を誤って押さないための待ち時間
  var overlayTimer = 0;

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

  function level(value, count, fallback) {
    var n = parseInt(value, 10);
    return n >= 0 && n < count ? n : fallback;
  }

  function loadSettings() {
    var s = storageGet(KEYS.settings) || {};
    var speed = parseInt(s.textSpeed, 10);
    return {
      textSpeed: speed >= 0 && speed < SPEEDS.length ? speed : prefersReducedMotion() ? 3 : 1,
      skipRead: !!s.skipRead,
      volume: typeof s.volume === "number" ? Math.max(0, Math.min(1, s.volume)) : 0.6,
      muted: !!s.muted,
      images: s.images !== false,
      effects: s.effects !== false, // 画面の揺れ・フラッシュなどの演出（ver 3.0 Phase 2〜。旧データに無ければオン）
      // ここから ver 3.0-p3 で追加。旧データに無ければ従来どおりの見た目・ふつうの速度
      fontSize: level(s.fontSize, FONT_SIZES.length, 0),
      windowLevel: level(s.windowLevel, WINDOW_LEVELS.length, 1),
      autoSpeed: level(s.autoSpeed, AUTO_SPEEDS.length, 1)
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
    if (effects.shards) s.shards = Math.min(STORY.maxShards || 0, s.shards + effects.shards);
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
    return !!els.gameScreen && !els.gameScreen.hidden;
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
  // ---------- 幕・章の呼び名 ----------
  /**
   * 「第 n 幕」にあたる呼び名。s は { scene, steps }（進行中の状態でもセーブデータでもよい）。
   *   作品設定に stepLabel があればそれを使う ／ 結末は FIN ／ 章のあるシーンは章の題名 ／ それ以外は「第 n 幕」（従来どおり）
   */
  function stepLabelOf(s) {
    var scene = STORY.scenes[s.scene];
    var chapter = Stage.chapterOf(STORY, s.scene);
    var steps = typeof s.steps === "number" ? s.steps : 0;
    if (typeof WORK.stepLabel === "function") {
      var own = WORK.stepLabel({ scene: s.scene, steps: steps, ending: !!(scene && scene.ending), chapter: chapter });
      if (typeof own === "string" && own) return own;
    }
    if (scene && scene.ending) return "FIN";
    if (chapter && chapter.title) return chapter.title;
    return "第" + (steps + 1) + "幕";
  }
  function showsShards() {
    return STORY.maxShards > 0 && WORK.hud !== false && cfg("hud.shards", true) !== false;
  }
  function showsHeart() {
    return STORY.maxAffection > 0 && WORK.hud !== false && cfg("hud.heart", true) !== false;
  }
  function seenEndings() {
    return listOf(KEYS.endings);
  }
  function readScenes() {
    return readData().list.filter(function (id) {
      return typeof id === "string" && !!STORY.scenes[id];
    });
  }
  /** エンディングの総数（STORY.endingCount。書いていない作品ではシナリオから数える） */
  function endingTotal() {
    return typeof STORY.endingCount === "number" ? STORY.endingCount : allEndings().length;
  }
  function allEndings() {
    return Object.keys(STORY.scenes)
      .map(function (id) {
        return STORY.scenes[id].ending;
      })
      .filter(Boolean);
  }
  /** 見たことのある結末（シナリオに実在する ID だけ） */
  function seenEndingIds() {
    var seen = seenEndings();
    return allEndings()
      .map(function (ending) {
        return ending.id;
      })
      .filter(function (id) {
        return seen.indexOf(id) !== -1;
      });
  }
  /** 「この選択肢に戻る」の解放条件：いずれかの結末を 1 つ見ている */
  function rewindUnlocked() {
    return seenEndingIds().length >= 1;
  }
  /** タイトル演出が変わる条件：すべての結末を見ている */
  function allEndingsSeen() {
    var all = allEndings();
    return all.length > 0 && seenEndingIds().length === all.length;
  }

  // ---------- 既読（ページ単位・選んだ選択肢） ----------
  // 既読のキー（<作品 ID>-read-v1。もとはシーン ID の配列）に、別形式の要素として追記する。
  //   "meet"        … シーンを最後まで読んだ（従来どおり。「読んだシーン n / 20」はこれだけを数える）
  //   "meet#1k2j3"  … そのシーンの、本文の指紋が 1k2j3 のページを読んだ
  //   "meet>9zx8"   … そのシーンで、文面の指紋が 9zx8 の選択肢を選んだことがある
  // シーン ID に # と > は使わないので衝突しない。旧版は STORY.scenes に無い要素を数えず、そのまま残す。
  function pageKey(sceneId, text) {
    return sceneId + "#" + Stage.hashText(text);
  }
  function choiceKey(sceneId, text) {
    return sceneId + ">" + Stage.hashText(text);
  }
  //
  // 長編では要素が数千〜数万になる。ページを送るたびに全体を読み直して線形に探すと重くなるので、
  // 「保存されている文字列が前回と同じなら、前回ほどいた結果を使い回す」形にしている（保存形式は同じ配列のまま）。
  // 別のタブや旧版が書き換えたときは文字列が変わるので、自動的に読み直す。
  var readCache = { raw: undefined, list: [], set: {}, paged: {} };
  function noteReadKey(cache, k) {
    if (typeof k !== "string") return;
    cache.set[k] = true;
    var i = k.indexOf("#");
    if (i > 0) cache.paged[k.slice(0, i)] = true; // そのシーンにページ単位の記録がある
  }
  /** { list: 保存されている配列, set: 文字列の要素の集合, paged: ページ単位の記録を持つシーン ID の集合 } */
  function readData() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(KEYS.read);
    } catch (e) {
      raw = null;
    }
    if (raw === readCache.raw) return readCache;
    var list = null;
    try {
      list = raw ? JSON.parse(raw) : null;
    } catch (e) {
      list = null;
    }
    readCache = { raw: raw, list: Array.isArray(list) ? list : [], set: Object.create(null), paged: Object.create(null) };
    readCache.list.forEach(function (k) {
      noteReadKey(readCache, k);
    });
    return readCache;
  }
  function readSet() {
    return readData().set;
  }
  function markRead(keys) {
    var data = readData();
    var fresh = keys.filter(function (k, i) {
      return !data.set[k] && keys.indexOf(k) === i;
    });
    if (!fresh.length) return;
    var list = data.list.concat(fresh);
    var json = JSON.stringify(list);
    try {
      window.localStorage.setItem(KEYS.read, json);
    } catch (e) {
      return; // 保存できなければ覚えない（従来どおり。ゲームは続行できる）
    }
    data.list = list;
    data.raw = json;
    fresh.forEach(function (k) {
      noteReadKey(data, k);
    });
  }
  /**
   * いまのシーンの各ページが既読かどうか。
   * 旧版の記録（シーン ID だけで、ページの記録が 1 つも無いシーン）は、どの段落を読んだか分からないので、
   * 最初に入ったときの段落構成を「読んだもの」として引き継ぐ（従来のシーン単位スキップと同じ扱い）。
   */
  function readFlags(sceneId, paras) {
    var data = readData();
    var set = data.set;
    var hasPageMarks = !!data.paged[sceneId];
    var keys = paras.map(function (text) {
      return pageKey(sceneId, text);
    });
    if (set[sceneId] && !hasPageMarks) {
      markRead(keys);
      return keys.map(function () {
        return true;
      });
    }
    return keys.map(function (k) {
      return !!set[k];
    });
  }

  // ---------- バックログ ----------
  function pushLog(entry) {
    state.log.push(entry);
    trimLog(state.log);
  }
  /** バックログを上限に収める（古い行から落とす。いちばん新しい行は必ず残す） */
  function trimLog(log) {
    if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
    var pages = 0;
    var points = 0;
    for (var i = log.length - 1; i >= 0; i--) {
      var entry = log[i] || {};
      if (entry.k === "c") {
        // 巻き戻し用の控えは新しい方から REWIND_LIMIT 個まで。古い行は選択肢の文面だけを残す（「戻る」は出なくなる）
        if (entry.s && (points += 1) > REWIND_LIMIT) delete entry.s;
      } else {
        pages += Array.isArray(entry.paras) ? entry.paras.length : 0;
        if (pages > LOG_PAGE_LIMIT && i < log.length - 1) {
          log.splice(0, i + 1);
          break;
        }
      }
    }
  }
  /** シーンの本文を、いまの状態で展開して正規化する（要素は必ず { text, ... }） */
  function scenePages(scene, s) {
    return Stage.normalizePages(resolve(scene.text, s) || []);
  }

  function speakerName(id) {
    var c = id && STORY.cast ? STORY.cast[id] : null;
    return c && typeof c.name === "string" ? c.name : "";
  }

  // セーブデータに入るので、paras は v2.1 と同じ「文字列の配列」のまま保存する。
  // 話者名は同じ長さの別配列 who に入れる（話者のいるシーンだけ。旧版はこの項目を無視する）。
  function logScene() {
    var scene = currentScene();
    var pages = scenePages(scene, state);
    var entry = { k: "s", title: scene.title, paras: Stage.pageTexts(pages) };
    var who = pages.map(function (p) {
      return speakerName(p.speaker);
    });
    if (who.some(Boolean)) entry.who = who;
    pushLog(entry);
  }

  // ---------- 選択肢への巻き戻し ----------
  // 選んだ時点の状態の控えを、バックログの選択肢の行（k: "c"）に s として持たせる。
  // セーブデータの最上位の形は変えない（旧版は s を無視する。旧データの行には控えが無いので「戻る」を出さない）。
  function snapshotOf(s) {
    return {
      scene: s.scene,
      affection: s.affection,
      shards: s.shards,
      flags: JSON.parse(JSON.stringify(s.flags)),
      steps: s.steps
    };
  }
  function canRewindTo(index) {
    var entry = state && state.log[index];
    return !!entry && entry.k === "c" && isValidSave(entry.s);
  }
  function lastChoiceIndex() {
    if (!state) return -1;
    for (var i = state.log.length - 1; i >= 0; i--) {
      if (canRewindTo(i)) return i;
    }
    return -1;
  }
  /** バックログ index 番の選択肢を選ぶ直前（そのシーンの最終ページ＋選択肢）へ戻す */
  function rewindTo(index) {
    if (!canRewindTo(index)) return;
    var log = state.log.slice(0, index);
    var next = restoreState(state.log[index].s);
    next.log = JSON.parse(JSON.stringify(log));
    closeAllDialogs();
    state = next;
    if (!state.log.length) logScene();
    renderScene({ toEnd: true });
    toast("選択肢まで戻りました");
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
    setAuto(false); // ダイアログを開いたらオートは止める
    if (dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }
  function closeDialog(dialog) {
    if (!dialog.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    focusTextbox();
  }
  // ダイアログを閉じたあとはメッセージウィンドウへフォーカスを戻す（Enter でそのまま読み進められる）
  function focusTextbox() {
    if (inGame() && !anyDialogOpen()) els.sceneTitle.focus({ preventScroll: true });
  }
  function closeAllDialogs() {
    Array.prototype.forEach.call(document.querySelectorAll("dialog"), closeDialog);
  }
  function anyDialogOpen() {
    return !!document.querySelector("dialog[open]");
  }

  /** 確認（ブラウザ標準の確認窓の代わり）。「はい」で onOk を実行する。やめる・Esc・枠外タップでは何もしない */
  function askConfirm(message, okLabel, onOk) {
    confirmRun = onOk;
    els.confirmMessage.textContent = message;
    els.confirmOk.textContent = okLabel || "はい";
    openDialog(els.confirmDialog);
    els.confirmCancel.focus(); // 既定は「やめる」（Enter の連打で消してしまわない）
  }
  function onConfirmOk() {
    var run = confirmRun;
    confirmRun = null;
    closeDialog(els.confirmDialog);
    if (run) run();
  }

  function icon(name) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var use = document.createElementNS(NS, "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
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

  /** 画面演出を出してよいか（設定の「演出」がオフ、または OS の「視差効果を減らす」では出さない） */
  function effectsEnabled() {
    return settings.effects !== false && !prefersReducedMotion();
  }

  /** CSS 側でも止められるよう、設定の状態を body に写す */
  function renderEffectsSetting() {
    document.body.classList.toggle("fx-off", settings.effects === false);
  }

  /**
   * 画面全体の演出。"shake"＝背景・立ち絵・ウィンドウを短く揺らす／"flash"＝白フラッシュ。
   * シーンの enter と、段落の fx の両方から呼ぶ。未知の名前は無視する（"hop" は立ち絵側で js/assets.js が処理）。
   */
  function playScreenFx(name) {
    if (SCREEN_FX.indexOf(name) === -1 || !effectsEnabled()) return;
    if (name === "shake") replayAnimation(document.body, "is-shaking");
    else if (name === "flash") replayAnimation(els.flash, "is-on");
  }

  function stopScreenFx() {
    document.body.classList.remove("is-shaking");
    els.flash.classList.remove("is-on");
  }

  function playEnterEffect(scene) {
    replayAnimation(els.textbox, "is-entering");
    stopScreenFx();
    playScreenFx(scene.enter);
  }

  // シーン切替のタイトルバナー（シネマティック演出）
  function showBanner(stepLabel, title) {
    els.bannerStep.textContent = stepLabel;
    els.bannerTitle.textContent = title;
    replayAnimation(els.sceneBanner, "is-on");
  }

  // 選択肢・エンディングのオーバーレイ
  function hideOverlays() {
    if (overlayTimer) window.clearTimeout(overlayTimer);
    overlayTimer = 0;
    els.choiceOverlay.hidden = true;
    els.endingOverlay.hidden = true;
    els.choices.textContent = "";
    els.gameScreen.classList.remove("is-choosing");
  }
  function openOverlay(overlay) {
    overlay.classList.add("is-locked");
    overlay.hidden = false;
    els.sceneBanner.classList.remove("is-on"); // バナーが残っていたら片付ける
    els.gameScreen.classList.add("is-choosing");
    if (overlayTimer) window.clearTimeout(overlayTimer);
    overlayTimer = window.setTimeout(function () {
      overlayTimer = 0;
      overlay.classList.remove("is-locked");
    }, OVERLAY_LOCK_MS);
  }
  function overlayReady(overlay) {
    return !overlay.hidden && !overlay.classList.contains("is-locked");
  }

  // 背景鑑賞モード（UI を隠して画像だけを見る）
  function setPeek(on) {
    on = !!on;
    if (on) setAuto(false);
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
    // まず画面を確実に切り替える（以降の装飾で失敗してもタイトルには戻れる）
    stopTyping();
    showScreen("title");
    hideOverlays();
    setPeek(false);
    setAuto(false);
    setTheme("title");
    // すべての結末を見たあとは、止まっていた花びらが落ち、文字盤の針が動き出す。
    // 「動きを減らす」設定では落ちる花びらが見えなくなるので、宙に留まる花びらのままにする
    var flowing = allEndingsSeen();
    document.body.classList.toggle("is-timeflow", flowing);
    setFx(flowing && !prefersReducedMotion() ? "petals-fall" : "petals");
    els.sceneBanner.classList.remove("is-on");
    Assets.setScene("title");

    els.appVersion.textContent = "ver " + VERSION;
    var resume = storageGet(KEYS.auto);
    var canResume = isValidSave(resume);
    els.continueBtn.hidden = !canResume;
    els.continueWhere.textContent = canResume ? stepLabelOf(resume) + "「" + STORY.scenes[resume.scene].title + "」" : "";

    var seen = seenEndings();
    els.endingList.textContent = "";
    var all = allEndings();
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
    els.titleScreen.scrollTop = 0;
    (els.continueBtn.hidden ? els.startBtn : els.continueBtn).focus({ preventScroll: true });
  }

  // ---------- ステータス ----------
  function renderStatus() {
    els.hudShards.hidden = !showsShards();
    els.hudHeart.hidden = !showsHeart();
    els.shards.textContent = "";
    for (var i = 0; i < (STORY.maxShards || 0); i++) {
      var gem = icon("shard");
      gem.setAttribute("class", i < state.shards ? "icon shard is-on" : "icon shard");
      els.shards.appendChild(gem);
    }
    els.shards.setAttribute("aria-label", SHARD_NAME + " " + state.shards + " / " + STORY.maxShards);

    var ratio = STORY.maxAffection > 0 ? Math.max(0, Math.min(1, state.affection / STORY.maxAffection)) : 0;
    els.heartFill.style.width = Math.round(ratio * 100) + "%";
    els.heartMeter.setAttribute("aria-valuenow", String(Math.max(0, state.affection)));
    els.heartMeter.setAttribute("aria-valuemax", String(STORY.maxAffection || 0));
  }

  // ---------- シーン ----------
  function showChoices(scene) {
    els.choices.textContent = "";
    var chosen = readSet();
    visibleChoices(scene, state).forEach(function (choice, i) {
      var btn = el("button", "choice");
      btn.type = "button";
      var num = el("span", "choice-num", String(i + 1));
      num.setAttribute("aria-hidden", "true");
      btn.appendChild(num);
      btn.appendChild(el("span", "choice-text", choice.text));
      if (chosen[choiceKey(state.scene, choice.text)]) {
        // 選んだことのある選択肢の印（未選択の側には何も付けない。条件で出現する選択肢にも「NEW」は付けない）
        var mark = el("span", "choice-seen");
        mark.appendChild(icon("check"));
        mark.appendChild(el("span", "choice-seen-label", "選択済"));
        btn.appendChild(mark);
      }
      btn.addEventListener("click", function () {
        if (overlayReady(els.choiceOverlay)) choose(choice);
      });
      btn.style.animationDelay = 0.15 + i * 0.09 + "s";
      els.choices.appendChild(btn);
    });
    els.endingOverlay.hidden = true;
    openOverlay(els.choiceOverlay);
    els.choiceOverlay.scrollTop = 0;
  }

  function showEnding(scene) {
    els.endingName.textContent = scene.ending.name;
    els.endingBox.setAttribute("data-kind", scene.ending.kind);
    var seen = seenEndings().length;
    var total = endingTotal();
    els.endingProgress.textContent =
      "見つけたエンディング：" + seen + " / " + total +
      (seen < total ? "　――ほかの結末もあるようだ。" : "　――すべての結末を見届けた！");
    // 直前の選択へ戻る。この結末に到達した画面から使うものなので、解放条件は付けない（控えの無い旧データでは出さない）
    els.endingRetry.hidden = lastChoiceIndex() === -1;
    els.choiceOverlay.hidden = true;
    openOverlay(els.endingOverlay);
  }

  /** シーンの本文を最後まで表示し終えたとき（選択肢またはエンディングを出す） */
  function endOfScene() {
    if (pager.ended) return;
    pager.ended = true;
    var scene = currentScene();
    if (!scene) return;
    els.nextMark.hidden = true;
    markRead([state.scene]);
    clearAutoTimer(); // 選択肢は自動では選ばない（オートの状態は保ち、選んだあと次のシーンで再開する）
    if (scene.ending) {
      setAuto(false);
      showEnding(scene);
    } else showChoices(scene);
    renderQuickbar();
  }

  /**
   * いまのページ位置の舞台状態。前のページからの差分ではなく、毎回 0 ページ目から畳み込んで求めるので、
   * 1 ページずつ進めても、スキップで飛んでも、ロード直後でも同じ結果になる。
   * 従来形式のシーン（文字列だけ・stage 指定なし）では null（v2.1 と同じ表示）。
   */
  function currentStage() {
    var scene = currentScene();
    if (!scene || !pager.staged) return null;
    return Stage.stageAt(pager.pages, pager.index, { stage: scene.stage, cast: STORY.cast });
  }

  /** 名前札：話者がいればその名前、地の文では隠す。従来形式のシーンではシーン名のまま */
  function renderNameplate(stage) {
    var scene = currentScene();
    var name = stage ? speakerName(stage.speaker) : "";
    var cast = stage && stage.speaker && STORY.cast ? STORY.cast[stage.speaker] : null;
    els.nameplate.classList.toggle("is-speaker", !!stage && !!name);
    els.nameplate.classList.toggle("is-narration", !!stage && !name);
    els.speakerName.textContent = name;
    els.speakerName.hidden = !name;
    if (name && cast && typeof cast.color === "string") els.nameplate.style.setProperty("--speaker", cast.color);
    else els.nameplate.style.removeProperty("--speaker");
    // 新形式のシーンでは、名前札を話者に明け渡すぶん、シーン名を「第 n 幕」の側へ寄せる
    els.sceneStep.textContent = stage && scene ? pager.stepLabel + "　" + scene.title : pager.stepLabel;
  }

  function applyStage(enteringScene) {
    var stage = currentStage();
    if (enteringScene) Assets.setScene(state.scene, stage);
    else Assets.setStage(stage);
    renderNameplate(stage);
    return stage;
  }

  /** いまのページ（段落）をメッセージウィンドウに表示する */
  function showPage(instant) {
    var total = pager.paras.length;
    var last = pager.index >= total - 1;
    pager.pageDone = false;
    els.nextMark.hidden = true;
    els.pageCount.textContent = total > 1 ? pager.index + 1 + " / " + total : "";
    els.sceneText.scrollTop = 0;
    var stage = applyStage(false);
    // 段落の fx（そのページだけ）。背景 bg の切替は applyStage → Assets 側でクロスフェードする
    if (stage) stage.fx.forEach(playScreenFx);

    clearAutoTimer();
    renderQuickbar();
    var text = total ? pager.paras[pager.index] : null;
    var quick = instant || SPEEDS[settings.textSpeed].cps === 0 || (settings.skipRead && !!pager.read[pager.index]);
    typeScene(total ? [text] : [], quick, function () {
      pager.pageDone = true;
      if (text != null && state) markRead([pageKey(state.scene, text)]); // 最後まで表示したページを既読にする
      if (last) endOfScene();
      else {
        els.nextMark.hidden = false;
        scheduleAuto();
      }
    });
  }

  /** タップ / Enter：文字送り中なら全文表示、表示済みなら次のページへ */
  function advance() {
    if (!inGame() || !currentScene()) return;
    if (typer.active) {
      finishTyping();
      return;
    }
    if (pager.pageDone && !pager.ended && pager.index < pager.paras.length - 1) {
      pager.index += 1;
      showPage();
    }
  }

  /** いまのページからスキップできるか（シーンに入った時点で既読だったページの上にいるとき） */
  function canSkip() {
    return inGame() && !!currentScene() && !pager.ended && !!pager.read[pager.index];
  }

  /**
   * 既読スキップ：既読のページが続くかぎり先へ飛ぶ。未読のページの手前（最後の既読ページ）で止まる。
   * シーンの全ページが既読なら最終ページまで飛び、選択肢が出る。
   */
  function skipScene() {
    if (!canSkip()) return;
    stopTyping();
    var j = pager.index;
    while (j + 1 < pager.paras.length && pager.read[j + 1]) j += 1;
    pager.index = j;
    showPage(true);
  }

  // ---------- オート ----------
  function clearAutoTimer() {
    if (auto.timer) window.clearTimeout(auto.timer);
    auto.timer = 0;
  }
  /** いまのページを表示し終えていれば、文字数に応じた時間のあとで次のページへ進む */
  function scheduleAuto() {
    clearAutoTimer();
    if (!auto.on || !inGame() || !pager.pageDone || pager.ended) return;
    if (pager.index >= pager.paras.length - 1) return;
    var speed = AUTO_SPEEDS[settings.autoSpeed] || AUTO_SPEEDS[1];
    var chars = Array.from(pager.paras[pager.index] || "").length;
    auto.timer = window.setTimeout(function () {
      auto.timer = 0;
      if (!auto.on || !inGame() || anyDialogOpen() || document.hidden) return;
      advance();
    }, speed.base + speed.perChar * chars);
  }
  function setAuto(on) {
    var scene = currentScene();
    on = !!on && inGame() && !!scene && !(pager.ended && scene.ending);
    if (auto.on === on) return;
    auto.on = on;
    clearAutoTimer();
    renderQuickbar();
    if (on) scheduleAuto();
  }

  /** 下部クイックバーの状態（押せる・押せない、オートのオン表示） */
  function renderQuickbar() {
    if (!els.autoBtn) return;
    var scene = currentScene();
    var endingShown = !!scene && !!scene.ending && pager.ended;
    els.skipBtn.disabled = !canSkip();
    els.saveBtn.disabled = !isPlaying();
    els.autoBtn.disabled = !scene || endingShown;
    els.autoBtn.setAttribute("aria-pressed", String(auto.on));
  }

  /** opts.toEnd＝最終ページから始める（選択肢への巻き戻し用。すぐ選択肢が出る） */
  function renderScene(opts) {
    opts = opts || {};
    var scene = currentScene();
    if (!scene) {
      // 想定外のIDに来た場合はタイトルへ戻す
      storageRemove(KEYS.auto);
      state = null;
      renderTitle();
      return;
    }
    var id = state.scene;
    var stepLabel = stepLabelOf(state);

    stopTyping();
    hideOverlays();
    setPeek(false);
    setTheme(scene.theme);
    setFx(scene.fx);
    showScreen("game");
    renderStatus();

    pager.pages = scenePages(scene, state);
    pager.paras = Stage.pageTexts(pager.pages);
    pager.staged = Stage.usesStage(scene, resolve(scene.text, state));
    pager.read = readFlags(id, pager.paras);
    pager.index = opts.toEnd ? Math.max(0, pager.paras.length - 1) : 0;
    pager.ended = false;
    pager.stepLabel = stepLabel;
    applyStage(true); // 背景・立ち絵・BGM をシーン先頭の状態に合わせる
    if (pager.staged) {
      var stageOpts = { stage: scene.stage, cast: STORY.cast };
      Assets.preload(Stage.charasUsed(pager.pages, stageOpts), Stage.bgsUsed(pager.pages, stageOpts));
    }
    playEnterEffect(scene);
    showBanner(stepLabel, scene.title);

    els.sceneIcon.textContent = scene.icon || "✨";
    els.stageIcon.textContent = scene.icon || "✨";
    els.sceneTitle.textContent = scene.title;
    els.menuSave.disabled = !!scene.ending;

    if (scene.ending) {
      addTo(KEYS.endings, scene.ending.id);
      storageRemove(KEYS.auto);
    } else {
      storageSet(KEYS.auto, state);
    }

    showPage(!!opts.toEnd);

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

    pushLog({ k: "c", text: choice.text, s: snapshotOf(state) }); // s＝選ぶ直前の状態の控え（巻き戻し用）
    markRead([choiceKey(state.scene, choice.text)]);
    applyEffects(state, choice.effects);
    state.scene = next;
    state.steps += 1;
    applyEffects(state, STORY.scenes[next].onEnter);
    logScene();
    renderScene();

    for (var i = before.shards; i < state.shards; i++) {
      toast(((STORY.shardNames && STORY.shardNames[i]) || SHARD_NAME) + "を手に入れた");
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
    function go() {
      storageRemove(KEYS.auto);
      startNew();
    }
    if (isPlaying()) {
      askConfirm("最初からやり直しますか？\n現在の進行状況は失われます（セーブスロットは残ります）。", "やり直す", go);
    } else go();
  }

  function backToTitle() {
    try {
      closeAllDialogs();
      stopTyping();
      setAuto(false);
      state = null; // オートセーブは残るので「つづきから」で再開できる
      renderTitle();
    } catch (e) {
      console.error(e);
      forceTitle();
    }
  }

  /** 何が起きてもタイトル画面だけは出す（最終手段） */
  function forceTitle() {
    state = null;
    document.body.classList.remove("is-peek");
    ["choiceOverlay", "endingOverlay", "gameScreen", "peekExit"].forEach(function (name) {
      if (els[name]) els[name].hidden = true;
    });
    if (els.titleScreen) els.titleScreen.hidden = false;
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
    var text = stepLabelOf(s) + "「" + scene.title + "」";
    if (showsShards()) text += "　" + SHARD_LABEL + " " + s.shards + "/" + STORY.maxShards;
    var date = savedAt ? formatDate(savedAt) : "";
    return date ? text + "　" + date : text;
  }

  function saveToSlot(n) {
    if (!isPlaying()) return;
    function go() {
      if (!isPlaying()) return;
      var slots = getSlots();
      slots[n] = { savedAt: Date.now(), state: restoreState(state) };
      if (storageSet(KEYS.slots, slots)) toast("スロット " + n + " にセーブしました");
      else toast("このブラウザではセーブできませんでした");
      renderSaves();
    }
    if (getSlots()[n]) askConfirm("スロット " + n + " に上書きしますか？", "上書きする", go);
    else go();
  }

  function loadFrom(saved) {
    if (!isValidSave(saved)) return;
    function go() {
      loadState(saved);
      toast("ロードしました");
    }
    if (isPlaying()) askConfirm("ロードしますか？\n現在の進行状況は失われます。", "ロードする", go);
    else go();
  }

  function deleteSlot(n) {
    askConfirm("スロット " + n + " のデータを削除しますか？", "削除する", function () {
      var slots = getSlots();
      delete slots[n];
      storageSet(KEYS.slots, slots);
      renderSaves();
    });
  }

  function saveRow(name, desc, actions) {
    var li = el("li", "save-row");
    var info = el("div", "save-info");
    info.appendChild(el("p", "save-name", name));
    info.appendChild(el("p", "save-desc", desc));
    li.appendChild(info);
    var box = el("div", "save-actions");
    actions.forEach(function (a) {
      var btn = el("button", "btn btn-small" + (a.primary ? " btn-primary" : ""), a.icon ? null : a.label);
      btn.type = "button";
      if (a.icon) btn.appendChild(icon(a.icon));
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
            icon: "trash",
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
    if (!state || !inGame()) return;
    els.logList.textContent = "";
    var unlocked = rewindUnlocked();
    var lastIndex = state.log.length - 1;
    state.log.forEach(function (entry, index) {
      if (entry.k === "c") {
        var row = el("div", "log-choice");
        row.appendChild(el("p", "log-choice-text", "▶ " + entry.text));
        // 「この選択肢に戻る」：いずれかの結末を見たあとで解放。控えの無い行（旧データ）には出さない
        if (unlocked && canRewindTo(index)) {
          var jump = el("button", "btn btn-small log-jump");
          jump.type = "button";
          jump.appendChild(icon("back"));
          jump.appendChild(el("span", null, "この選択肢に戻る"));
          jump.addEventListener("click", function () {
            askConfirm("この選択肢まで戻りますか？\nここから先の進行は、選び直したところからやり直しになります。", "戻る", function () {
              rewindTo(index);
            });
          });
          row.appendChild(jump);
        }
        els.logList.appendChild(row);
      } else {
        els.logList.appendChild(el("h3", "log-scene", entry.title));
        var paras = entry.paras || [];
        // いま読んでいるシーン（ログの末尾）は、読んだページまでだけを出す。保存形式は変えず、表示だけで絞る
        if (index === lastIndex) paras = paras.slice(0, pager.index + 1);
        paras.forEach(function (para, i) {
          // paras は文字列の配列。万一オブジェクトが混ざっていても本文だけを出す
          var p = el("p", "log-para", typeof para === "string" ? para : Stage.normalizePage(para).text);
          var who = Array.isArray(entry.who) && typeof entry.who[i] === "string" ? entry.who[i] : "";
          if (who) {
            p.classList.add("has-who");
            p.insertBefore(el("span", "log-who", who), p.firstChild);
          }
          els.logList.appendChild(p);
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
    els.muteIcon.setAttribute("href", settings.muted ? "#i-mute" : "#i-sound");
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
    els.setEffects.checked = settings.effects !== false;
    els.setAuto.value = String(settings.autoSpeed);
    els.setAutoLabel.textContent = AUTO_SPEEDS[settings.autoSpeed].label;
    els.setFont.value = String(settings.fontSize);
    els.setFontLabel.textContent = FONT_SIZES[settings.fontSize];
    els.setWindow.value = String(settings.windowLevel);
    els.setWindowLabel.textContent = WINDOW_LEVELS[settings.windowLevel];
    renderReadability();
    renderEffectsSetting();
    renderMute();
  }

  /** 文字の大きさ・ウィンドウの濃さを body に写す（css が本文・選択肢・バックログ・設定の見本に反映する） */
  function renderReadability() {
    document.body.setAttribute("data-font", String(settings.fontSize));
    document.body.setAttribute("data-window", String(settings.windowLevel));
  }

  /** 設定の見本の背景に、いま出ている背景画像を写す（無ければ css のテーマ色のまま） */
  function renderPreviewBackdrop() {
    var layer = document.querySelector("#bg-layer .bg-img.is-active");
    els.settingsPreview.style.backgroundImage = layer && layer.style.backgroundImage ? layer.style.backgroundImage : "";
  }

  function setMuted(flag) {
    settings.muted = !!flag;
    Assets.setMuted(settings.muted);
    saveSettings();
    renderMute();
  }

  function openSettings() {
    renderSettings();
    renderPreviewBackdrop();
    closeDialog(els.menuDialog);
    openDialog(els.settingsDialog);
  }

  function resetData() {
    askConfirm("セーブデータ・見つけたエンディング・既読の記録をすべて消去します。\nよろしいですか？", "消去する", function () {
      [KEYS.auto, KEYS.slots, KEYS.endings, KEYS.read].forEach(storageRemove);
      state = null;
      closeAllDialogs();
      renderTitle();
      toast("記録を消去しました");
    });
  }

  // 画像・BGM の状態が変わったときに UI を合わせる
  function onAssetsChange(info) {
    var hasImage = !!info.image;

    if (info.manifest === "loading") {
      els.assetStatus.textContent = "画像・BGM を確認しています…";
    } else if (info.manifest === "none") {
      els.assetStatus.textContent = "画像・BGM の設定（assets/manifest.json）を読み込めないため、テキストのみで動作しています。";
    } else {
      els.assetStatus.textContent =
        "この場面：背景画像 " + (hasImage ? "あり" : "なし") +
        " ／ 立ち絵 " + (info.character ? "あり" : "なし") +
        " ／ BGM " + (info.bgm ? "あり" : "なし");
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

    if ((e.key === "Enter" || e.key === " ") && !onControl) {
      e.preventDefault();
      if (!e.repeat) advance();
      return;
    }

    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      var btns = els.choices.querySelectorAll(".choice");
      if (btns[n - 1] && overlayReady(els.choiceOverlay)) {
        e.preventDefault();
        btns[n - 1].click();
      }
      return;
    }

    var key = e.key.toLowerCase();
    if (key === "l") openLog();
    else if (key === "s") openSaves("save");
    else if (key === "m") setMuted(!settings.muted);
    else if (key === "a") setAuto(!auto.on);
  }

  // ---------- ボタン操作（data-action をまとめて受ける） ----------
  // ボタンごとに addEventListener せず、document で一括して受ける。
  // 1 つの要素が欠けていても、ほかのボタンの動作が巻き添えで止まらない。
  var ACTIONS = {
    start: startNew,
    continue: continueGame,
    restart: restart,
    title: backToTitle,
    skip: skipScene,
    auto: function () {
      setAuto(!auto.on);
    },
    retry: function () {
      rewindTo(lastChoiceIndex());
    },
    "hud-shards": function () {
      if (state) toast(SHARD_NAME + "　" + state.shards + " / " + STORY.maxShards);
    },
    "hud-heart": function () {
      if (state) toast(HEART_NAME);
    },
    reset: resetData,
    settings: openSettings,
    log: openLog,
    save: function () {
      openSaves("save");
    },
    load: function () {
      openSaves("load");
    },
    mute: function () {
      setMuted(!settings.muted);
    },
    menu: function () {
      openDialog(els.menuDialog);
    },
    peek: function () {
      closeAllDialogs();
      setPeek(true);
    },
    "peek-exit": function () {
      setPeek(false);
    }
  };

  function onActionClick(e) {
    var target = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
    if (!target || target.disabled) return;
    var name = target.getAttribute("data-action");
    var overlay = target.closest(".overlay");
    if (overlay && overlay.classList.contains("is-locked")) return; // 表示直後の誤タップを無視
    var action = ACTIONS[name];
    if (!action) return;
    try {
      action();
      // クイックバー・HUD をマウスやタップで押したあとは、フォーカスをメッセージウィンドウへ戻す
      // （続けて Enter を押すと、ボタンの押し直しではなく読み進めになる）。キーボードで押したときは動かさない
      if (e.detail > 0 && target.closest(".quickbar, .hud")) focusTextbox();
    } catch (err) {
      console.error("操作に失敗しました:", name, err);
      if (name === "title") forceTitle();
    }
  }

  // ---------- 版の確認 ----------
  // デプロイ直後などに「古い index.html ＋ 新しい js」の組み合わせで読み込まれると、
  // 画面の部品が足りずボタンが反応しなくなる。検出したら一度だけ読み込み直し、
  // それでも直らなければ再読み込みの案内を出す。
  var ELEMENT_IDS = {
    titleScreen: "title-screen",
    gameScreen: "game-screen",
    fxLayer: "fx-layer",
    flash: "flash",
    toasts: "toasts",
    startBtn: "start-btn",
    continueBtn: "continue-btn",
    appVersion: "app-version",
    settingsVersion: "settings-version",
    endingList: "ending-list",
    endingCount: "ending-count",
    sceneRate: "scene-rate",
    titleSub: "title-sub",
    titleMain: "title-main",
    titleLead: "title-lead",
    settingsTitle: "settings-title",
    hudShards: "hud-shards",
    hudShardsLabel: "hud-shards-label",
    hudHeart: "hud-heart",
    hudHeartLabel: "hud-heart-label",
    shards: "status-shards",
    heartMeter: "heart-meter",
    heartFill: "heart-fill",
    muteBtn: "mute-btn",
    muteIcon: "mute-icon",
    quickbar: "quickbar",
    logBtn: "log-btn",
    autoBtn: "auto-btn",
    saveBtn: "save-btn",
    menuBtn: "menu-btn",
    continueWhere: "continue-where",
    endingRetry: "ending-retry",
    confirmDialog: "confirm-dialog",
    confirmMessage: "confirm-message",
    confirmOk: "confirm-ok",
    confirmCancel: "confirm-cancel",
    setAuto: "set-auto",
    setAutoLabel: "set-auto-label",
    setFont: "set-font",
    setFontLabel: "set-font-label",
    setWindow: "set-window",
    setWindowLabel: "set-window-label",
    settingsPreview: "settings-preview",
    previewText: "preview-text",
    stage: "stage",
    stageIcon: "stage-icon",
    sceneBanner: "scene-banner",
    bannerStep: "banner-step",
    bannerTitle: "banner-title",
    choiceOverlay: "choice-overlay",
    choices: "choices",
    endingOverlay: "ending-overlay",
    endingBox: "ending-box",
    endingName: "ending-name",
    endingProgress: "ending-progress",
    textbox: "textbox",
    charLayer: "char-layer",
    nameplate: "nameplate",
    speakerName: "speaker-name",
    sceneIcon: "scene-icon",
    sceneTitle: "scene-title",
    sceneStep: "scene-step",
    sceneText: "scene-text",
    skipBtn: "skip-btn",
    skipHint: "skip-hint",
    pageCount: "page-count",
    nextMark: "next-mark",
    peekExit: "peek-exit",
    menuDialog: "menu-dialog",
    menuSave: "menu-save",
    savesDialog: "saves-dialog",
    savesHeading: "saves-heading",
    savesList: "saves-list",
    logDialog: "log-dialog",
    logList: "log-list",
    settingsDialog: "settings-dialog",
    setSpeed: "set-speed",
    setSpeedLabel: "set-speed-label",
    setSkip: "set-skip",
    setVolume: "set-volume",
    setVolumeLabel: "set-volume-label",
    setMute: "set-mute",
    setImages: "set-images",
    setEffects: "set-effects",
    assetStatus: "asset-status"
  };

  function pageIsCurrent() {
    if (document.documentElement.getAttribute("data-app-version") !== VERSION) return false;
    if (!WORK_ID) return false; // 作品設定（js/work.js）を読めていない：保存キーを決められないので始めない
    return Object.keys(ELEMENT_IDS).every(function (name) {
      return !!els[name];
    });
  }

  function freshUrl() {
    return window.location.pathname + "?v=" + encodeURIComponent(VERSION) + "&t=" + Date.now();
  }

  function handleStalePage() {
    var RELOAD_KEY = (WORK_ID || "novel") + "-reloaded";
    var canReload = /^https?:$/.test(window.location.protocol);
    var tried = true;
    try {
      tried = window.sessionStorage.getItem(RELOAD_KEY) === VERSION;
      if (!tried) window.sessionStorage.setItem(RELOAD_KEY, VERSION);
    } catch (e) {
      tried = true; // 記録できない環境では自動の読み込み直しはしない（無限ループ防止）
    }
    if (canReload && !tried) {
      window.location.replace(freshUrl());
      return;
    }

    var box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.style.cssText =
      "position:fixed;left:0;right:0;top:0;z-index:9999;padding:14px 16px;text-align:center;" +
      "font:14px/1.6 system-ui,sans-serif;color:#2a1640;background:#ffd27a;box-shadow:0 4px 16px rgba(0,0,0,.4)";
    box.appendChild(
      document.createTextNode("ゲームが更新されました（ver " + VERSION + "）。古い画面が残っているため、再読み込みしてください。 ")
    );
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "再読み込み";
    btn.style.cssText = "margin-left:8px;padding:6px 16px;border:0;border-radius:999px;font:inherit;font-weight:700;color:#fff;background:#2a1640;cursor:pointer";
    btn.addEventListener("click", function () {
      if (canReload) window.location.replace(freshUrl());
      else window.location.reload();
    });
    box.appendChild(btn);
    document.body.appendChild(box);
  }

  /** 複数行の文言を、行ごとに <br> で区切って入れる（文字列 1 つでも配列でもよい） */
  function setLines(node, lines) {
    node.textContent = "";
    (Array.isArray(lines) ? lines : [lines]).forEach(function (line, i) {
      if (i) node.appendChild(document.createElement("br"));
      node.appendChild(document.createTextNode(String(line)));
    });
  }

  /**
   * 作品設定（WORK）の題名・用語を画面に入れる。設定に無い項目は index.html に書いてある文言のまま。
   * 別作品では index.html を書き換えなくても、js/work.js だけで題名まわりが差し替わる。
   */
  function applyWorkTexts() {
    if (typeof WORK.title === "string") {
      document.title = typeof WORK.documentTitle === "string" ? WORK.documentTitle : WORK.title;
      els.settingsTitle.textContent = WORK.title;
    }
    if (WORK.titleLines != null) setLines(els.titleMain, WORK.titleLines);
    else if (typeof WORK.title === "string") setLines(els.titleMain, WORK.title);
    if (WORK.subtitle != null) setLines(els.titleSub, WORK.subtitle);
    if (WORK.lead != null) setLines(els.titleLead, WORK.lead);
    els.hudShardsLabel.textContent = SHARD_LABEL;
    els.hudShards.setAttribute("title", SHARD_NAME);
    els.shards.setAttribute("aria-label", SHARD_NAME);
    els.hudHeartLabel.textContent = HEART_LABEL;
    els.hudHeart.setAttribute("title", HEART_NAME);
    els.heartMeter.setAttribute("aria-label", HEART_NAME);
  }

  function init() {
    els = {};
    Object.keys(ELEMENT_IDS).forEach(function (name) {
      els[name] = $(ELEMENT_IDS[name]);
    });

    if (!pageIsCurrent()) {
      handleStalePage();
      return;
    }

    settings = loadSettings();
    els.appVersion.textContent = "ver " + VERSION;
    els.settingsVersion.textContent = "ver " + VERSION;
    applyWorkTexts();

    // ボタン（タイトル・HUD・メニュー・エンディング）
    document.addEventListener("click", onActionClick);

    // ステージやメッセージウィンドウをタップすると読み進める
    els.gameScreen.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("button, a, input, .hud, .overlay, .quickbar")) return;
      advance();
    });

    // ダイアログ：閉じるボタンと、枠の外側クリックで閉じる
    Array.prototype.forEach.call(document.querySelectorAll("dialog"), function (dialog) {
      dialog.addEventListener("click", function (e) {
        if (e.target === dialog || (e.target.closest && e.target.closest("[data-close]"))) {
          closeDialog(dialog);
        }
      });
      dialog.addEventListener("close", focusTextbox); // Esc で閉じた場合
    });

    els.confirmOk.addEventListener("click", onConfirmOk);

    // タブが隠れたらオートは止める（戻ってきたときに勝手に進んでいないように）
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) setAuto(false);
    });

    // 設定
    els.setAuto.addEventListener("input", function () {
      settings.autoSpeed = level(els.setAuto.value, AUTO_SPEEDS.length, 1);
      els.setAutoLabel.textContent = AUTO_SPEEDS[settings.autoSpeed].label;
      saveSettings();
    });
    els.setFont.addEventListener("input", function () {
      settings.fontSize = level(els.setFont.value, FONT_SIZES.length, 0);
      els.setFontLabel.textContent = FONT_SIZES[settings.fontSize];
      renderReadability();
      saveSettings();
    });
    els.setWindow.addEventListener("input", function () {
      settings.windowLevel = level(els.setWindow.value, WINDOW_LEVELS.length, 1);
      els.setWindowLabel.textContent = WINDOW_LEVELS[settings.windowLevel];
      renderReadability();
      saveSettings();
    });
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

    els.setEffects.addEventListener("change", function () {
      settings.effects = els.setEffects.checked;
      renderEffectsSetting();
      if (!settings.effects) stopScreenFx();
      saveSettings();
    });

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
