/*
 * アセットマネージャ（背景画像・キャラクター立ち絵・BGM）
 * ------------------------------------------------------------
 * assets/manifest.json を読み込み、シーンIDに対応する画像・立ち絵・BGM を適用する。
 *
 * - マニフェストが無い／読めない（file:// で開いた場合など）ときは何もしない。
 * - マニフェストに書かれたファイルが存在しないときも何もしない。
 *   いずれの場合もゲームは従来どおりテキストのみで動き、エラーで止まらない。
 * - 値は文字列、または候補の配列（先頭から順に試す）。null は「このシーンでは無し」。
 *
 * 書式とファイルの差し込み手順は docs/ASSETS.md を参照。
 */
(function (root) {
  "use strict";

  var MANIFEST_URL = "assets/manifest.json";
  var FADE_MS = 700;

  var manifest = null;
  var basePath = "assets/";
  var manifestState = "loading"; // "loading" | "ready" | "none"
  var missing = {}; // 読み込みに失敗した URL（同じファイルを何度も取りに行かない）

  var settings = { volume: 0.6, muted: false, images: true };
  var currentKey = null;
  var listeners = [];

  var bg = { url: null, token: 0, layers: null, active: 0 };
  var chara = { url: null, token: 0 };
  var bgm = { url: null, audio: null, token: 0, gain: 1 };
  var CHAR_POSITIONS = ["left", "center", "right"];

  // ---------- 共通 ----------
  function notify() {
    var snapshot = info();
    listeners.forEach(function (fn) {
      try {
        fn(snapshot);
      } catch (e) {
        /* リスナーの失敗でアセット処理を止めない */
      }
    });
  }

  function info() {
    return {
      manifest: manifestState,
      image: bg.url,
      character: chara.url,
      bgm: bgm.url,
      muted: settings.muted,
      volume: settings.volume
    };
  }

  function toUrl(path) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(path)) return path; // 絶対URL・ルート相対はそのまま
    return basePath + path;
  }

  /** 文字列 / 配列 / null を、まだ失敗していない URL の配列にする */
  function candidates(value) {
    var list = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    return list
      .filter(function (v) {
        return typeof v === "string" && v;
      })
      .map(toUrl)
      .filter(function (url) {
        return !missing[url];
      });
  }

  function entryFor(key) {
    if (!manifest) return {};
    var defaults = manifest.defaults && typeof manifest.defaults === "object" ? manifest.defaults : {};
    var entry = key === "title" ? manifest.title : manifest.scenes && manifest.scenes[key];
    if (!entry || typeof entry !== "object") entry = {};
    var out = {};
    ["image", "character", "characterPosition", "bgm", "position", "volume"].forEach(function (name) {
      out[name] = Object.prototype.hasOwnProperty.call(entry, name) ? entry[name] : defaults[name];
    });
    return out;
  }

  // ---------- 背景画像 ----------
  function bgLayers() {
    if (!bg.layers) {
      bg.layers = Array.prototype.slice.call(document.querySelectorAll("#bg-layer .bg-img"));
    }
    return bg.layers;
  }

  function clearImage() {
    bg.token += 1;
    if (!bg.url) return;
    bg.url = null;
    bgLayers().forEach(function (layer) {
      layer.classList.remove("is-active");
    });
    document.body.classList.remove("has-bg");
    notify();
  }

  function showImage(url, position) {
    var layers = bgLayers();
    if (layers.length) {
      var next = (bg.active + 1) % layers.length;
      layers[next].style.backgroundImage = "url(" + JSON.stringify(url) + ")";
      layers[next].style.backgroundPosition = typeof position === "string" ? position : "";
      layers.forEach(function (layer, i) {
        layer.classList.toggle("is-active", i === next);
      });
      bg.active = next;
    }
    bg.url = url;
    document.body.classList.add("has-bg");
    notify();
  }

  function applyImage(entry) {
    var list = settings.images ? candidates(entry.image) : [];
    if (!list.length) {
      clearImage();
      return;
    }
    if (list[0] === bg.url) return; // 同じ画像のまま
    var token = (bg.token += 1);

    (function tryNext(i) {
      if (token !== bg.token) return; // 読み込み中に別のシーンへ進んだ
      if (i >= list.length) {
        clearImage();
        return;
      }
      var url = list[i];
      var img = new Image();
      img.onload = function () {
        if (token === bg.token) showImage(url, entry.position);
      };
      img.onerror = function () {
        missing[url] = true;
        tryNext(i + 1);
      };
      img.src = url;
    })(0);
  }

  // ---------- キャラクター立ち絵 ----------
  function charImg() {
    return document.getElementById("char-img");
  }

  function clearCharacter() {
    chara.token += 1;
    var node = charImg();
    if (node) node.classList.remove("is-active");
    document.body.classList.remove("has-char");
    if (!chara.url) return;
    chara.url = null;
    notify();
  }

  function showCharacter(url, position) {
    var node = charImg();
    if (!node) return;
    var pos = CHAR_POSITIONS.indexOf(position) !== -1 ? position : "center";
    node.classList.remove("is-active");
    node.setAttribute("data-pos", pos);
    node.src = url;
    void node.offsetWidth; // フェードインを最初からやり直す
    node.classList.add("is-active");
    chara.url = url;
    document.body.classList.add("has-char");
    notify();
  }

  function applyCharacter(entry) {
    var list = settings.images ? candidates(entry.character) : [];
    if (!list.length) {
      clearCharacter();
      return;
    }
    if (list[0] === chara.url) {
      // 同じ立ち絵のまま（位置だけ変わることはある）
      var node = charImg();
      var pos = CHAR_POSITIONS.indexOf(entry.characterPosition) !== -1 ? entry.characterPosition : "center";
      if (node) node.setAttribute("data-pos", pos);
      return;
    }
    var token = (chara.token += 1);

    (function tryNext(i) {
      if (token !== chara.token) return; // 読み込み中に別のシーンへ進んだ
      if (i >= list.length) {
        clearCharacter();
        return;
      }
      var url = list[i];
      var img = new Image();
      img.onload = function () {
        if (token === chara.token) showCharacter(url, entry.characterPosition);
      };
      img.onerror = function () {
        missing[url] = true;
        tryNext(i + 1);
      };
      img.src = url;
    })(0);
  }

  // ---------- BGM ----------
  function targetVolume() {
    var v = settings.volume * bgm.gain;
    return Math.max(0, Math.min(1, v));
  }

  function fade(audio, to, ms, done) {
    if (audio._fadeTimer) clearInterval(audio._fadeTimer);
    var from = audio.volume;
    var start = Date.now();
    audio._fadeTimer = setInterval(function () {
      var t = Math.min(1, (Date.now() - start) / ms);
      try {
        audio.volume = from + (to - from) * t;
      } catch (e) {
        t = 1; // 音量を変えられない環境（iOS など）ではフェードを省略
      }
      if (t >= 1) {
        clearInterval(audio._fadeTimer);
        audio._fadeTimer = null;
        if (done) done();
      }
    }, 40);
  }

  function tryPlay(audio) {
    if (!audio || document.hidden) return;
    var p;
    try {
      p = audio.play();
    } catch (e) {
      return;
    }
    // 自動再生が禁止されている場合は、最初の操作（unlock）で再生し直す
    if (p && typeof p.catch === "function") p.catch(function () {});
  }

  function stopBgm() {
    bgm.token += 1;
    var old = bgm.audio;
    bgm.audio = null;
    if (bgm.url) {
      bgm.url = null;
      notify();
    }
    if (!old) return;
    fade(old, 0, FADE_MS, function () {
      old.pause();
      old.removeAttribute("src");
    });
  }

  function applyBgm(entry) {
    var list = candidates(entry.bgm);
    var gain = typeof entry.volume === "number" ? entry.volume : 1;

    if (!list.length) {
      stopBgm();
      return;
    }
    if (bgm.audio && list[0] === bgm.url) {
      // 同じ曲が続くシーンでは頭出しせず、そのまま流し続ける
      bgm.gain = gain;
      fade(bgm.audio, targetVolume(), FADE_MS);
      return;
    }

    stopBgm();
    bgm.gain = gain;
    var token = bgm.token;

    (function tryNext(i) {
      if (token !== bgm.token) return;
      if (i >= list.length) return;
      var url = list[i];
      var audio = new Audio();
      var failed = false;
      audio.loop = true;
      audio.preload = "auto";
      audio.muted = settings.muted;
      audio.volume = 0;
      audio.addEventListener("error", function () {
        if (failed) return;
        failed = true;
        missing[url] = true;
        if (audio._fadeTimer) clearInterval(audio._fadeTimer);
        if (bgm.audio === audio) {
          bgm.audio = null;
          bgm.url = null;
          notify();
        }
        tryNext(i + 1);
      });
      audio.src = url;
      bgm.audio = audio;
      bgm.url = url;
      notify();
      tryPlay(audio);
      fade(audio, targetVolume(), FADE_MS);
    })(0);
  }

  // ブラウザの自動再生制限：最初のタップ／キー操作で再生を始める
  function unlock() {
    if (bgm.audio && bgm.audio.paused) tryPlay(bgm.audio);
  }

  function onVisibility() {
    if (!bgm.audio) return;
    if (document.hidden) bgm.audio.pause();
    else tryPlay(bgm.audio);
  }

  // ---------- 公開 API ----------
  function apply() {
    if (currentKey == null || manifestState !== "ready") return;
    var entry = entryFor(currentKey);
    applyImage(entry);
    applyCharacter(entry);
    applyBgm(entry);
  }

  /** key: シーンID、またはタイトル画面を表す "title" */
  function setScene(key) {
    currentKey = key;
    apply();
  }

  function setVolume(v) {
    settings.volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (bgm.audio) fade(bgm.audio, targetVolume(), 120);
  }

  function setMuted(flag) {
    settings.muted = !!flag;
    if (bgm.audio) bgm.audio.muted = settings.muted;
    notify();
  }

  function setImagesEnabled(flag) {
    settings.images = !!flag;
    apply();
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  /** マニフェストを読み込む。成功・失敗にかかわらず必ず resolve する。 */
  function init(options) {
    options = options || {};
    if (typeof options.volume === "number") settings.volume = options.volume;
    if (typeof options.muted === "boolean") settings.muted = options.muted;
    if (typeof options.images === "boolean") settings.images = options.images;

    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("visibilitychange", onVisibility);

    var loading;
    try {
      loading = root.fetch(MANIFEST_URL, { cache: "no-cache" }).then(function (res) {
        if (!res.ok) throw new Error("manifest not found");
        return res.json();
      });
    } catch (e) {
      loading = Promise.reject(e);
    }

    return loading
      .then(function (data) {
        if (!data || typeof data !== "object") throw new Error("invalid manifest");
        manifest = data;
        if (typeof data.basePath === "string") basePath = data.basePath;
        manifestState = "ready";
      })
      .catch(function () {
        manifest = null;
        manifestState = "none"; // テキストのみで続行
      })
      .then(function () {
        apply();
        notify();
        return manifestState === "ready";
      });
  }

  root.GameAssets = {
    init: init,
    setScene: setScene,
    setVolume: setVolume,
    setMuted: setMuted,
    setImagesEnabled: setImagesEnabled,
    onChange: onChange,
    info: info
  };
})(this);
