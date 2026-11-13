/*
 * アセットマネージャ（背景画像・キャラクター立ち絵・BGM）
 * ------------------------------------------------------------
 * assets/manifest.json を読み込み、シーンIDに対応する画像・立ち絵・BGM を適用する。
 *
 * - マニフェストが無い／読めない（file:// で開いた場合など）ときは何もしない。
 * - マニフェストに書かれたファイルが存在しないときも何もしない。
 *   いずれの場合もゲームは従来どおりテキストのみで動き、エラーで止まらない。
 * - 値は文字列、または候補の配列（先頭から順に試す）。null は「このシーンでは無し」。
 * - ver 3.0〜：manifest の backgrounds（背景の論理名）と characters（人物 → ポーズ → 表情）を読み、
 *   js/stage.js が求めた舞台状態（誰が・どのポーズ・どの表情・どの位置）を複数枠の立ち絵として表示する。
 *   論理名に対応するファイルが無いときは、その枠（背景ならシーンの image）へ静かに戻る。
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
  var currentStage = null; // 新形式シーンの舞台状態（GameStage.stageAt の戻り値）。従来形式のシーンでは null
  var listeners = [];

  var bg = { url: null, token: 0, layers: null, active: 0, loadingKey: null };
  var chara = { url: null, slots: {} }; // slots[人物ID] = { node, img, halo, url, token, want }
  var CHARA_FADE_MS = 600;
  var CHARA_FX = ["hop"]; // 立ち絵に掛けるページ単位の演出（未知の名前は無視する）
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
    ["image", "character", "characterPosition", "bgm", "position", "positionPortrait", "volume"].forEach(function (name) {
      out[name] = Object.prototype.hasOwnProperty.call(entry, name) ? entry[name] : defaults[name];
    });
    return out;
  }

  /** 候補を先頭から順に読み込み、最初に成功した URL を返す（全滅なら null） */
  function loadFirst(urls, done) {
    (function tryNext(i) {
      if (i >= urls.length) {
        done(null);
        return;
      }
      var url = urls[i];
      if (missing[url]) {
        tryNext(i + 1);
        return;
      }
      var img = new Image();
      img.onload = function () {
        done(url);
      };
      img.onerror = function () {
        missing[url] = true;
        tryNext(i + 1);
      };
      img.src = url;
    })(0);
  }

  // ---------- 背景画像 ----------
  function bgLayers() {
    if (!bg.layers) {
      bg.layers = Array.prototype.slice.call(document.querySelectorAll("#bg-layer .bg-img"));
    }
    return bg.layers;
  }

  function validPosition(value) {
    if (typeof value !== "string" || !value) return false;
    if (root.CSS && typeof root.CSS.supports === "function") {
      return root.CSS.supports("background-position", value);
    }
    return true;
  }

  /** 見せる位置（焦点）。縦長の画面では positionPortrait があればそちらを使う（切替は CSS 側） */
  function setPosition(layer, item) {
    if (validPosition(item.position)) layer.style.setProperty("--bg-pos", item.position);
    else layer.style.removeProperty("--bg-pos");
    if (validPosition(item.positionPortrait)) layer.style.setProperty("--bg-pos-portrait", item.positionPortrait);
    else layer.style.removeProperty("--bg-pos-portrait");
  }

  /** 背景の論理名 → manifest.backgrounds の候補（無ければ空） */
  function namedBgCandidates(name) {
    var out = [];
    var table = manifest && manifest.backgrounds;
    if (typeof name === "string" && table && typeof table === "object" && table[name] != null) {
      var def = table[name];
      if (typeof def === "string" || Array.isArray(def)) def = { image: def };
      if (def && typeof def === "object") {
        candidates(def.image).forEach(function (url) {
          out.push({ url: url, position: def.position, positionPortrait: def.positionPortrait });
        });
      }
    }
    return out;
  }

  /**
   * 背景の候補。舞台の論理名（stage.bg → manifest.backgrounds）を先に試し、
   * 無い・読めないときはシーンの image（従来の 1 枚絵）へ戻る。
   * 段落の bg でページ途中に論理名が変わると、候補の先頭が変わり、applyImage がクロスフェードで切り替える。
   */
  function bgCandidates(entry, stage) {
    if (!settings.images) return [];
    var name = stage && typeof stage.cg === "string" ? stage.cg : stage && stage.bg;
    var out = namedBgCandidates(name);
    candidates(entry.image).forEach(function (url) {
      out.push({ url: url, position: entry.position, positionPortrait: entry.positionPortrait });
    });
    return out;
  }

  function clearImage() {
    bg.token += 1;
    bg.loadingKey = null;
    if (!bg.url) return;
    bg.url = null;
    bgLayers().forEach(function (layer) {
      layer.classList.remove("is-active");
    });
    document.body.classList.remove("has-bg");
    notify();
  }

  function showImage(item) {
    var layers = bgLayers();
    if (layers.length) {
      var next = (bg.active + 1) % layers.length;
      layers[next].style.backgroundImage = "url(" + JSON.stringify(item.url) + ")";
      setPosition(layers[next], item);
      layers.forEach(function (layer, i) {
        layer.classList.toggle("is-active", i === next);
      });
      bg.active = next;
    }
    bg.url = item.url;
    document.body.classList.add("has-bg");
    notify();
  }

  function applyImage(entry, stage) {
    var list = bgCandidates(entry, stage);
    if (!list.length) {
      clearImage();
      return;
    }
    if (list[0].url === bg.url) {
      // 同じ画像のまま（焦点だけ変わることはある）
      bg.token += 1;
      bg.loadingKey = null;
      var layers = bgLayers();
      if (layers[bg.active]) setPosition(layers[bg.active], list[0]);
      return;
    }
    var key = list
      .map(function (item) {
        return item.url;
      })
      .join("|");
    if (key === bg.loadingKey) return; // 同じ候補を読み込み中（ページ送りで呼び直された）
    bg.loadingKey = key;
    var token = (bg.token += 1);

    loadFirst(
      list.map(function (item) {
        return item.url;
      }),
      function (url) {
        if (token !== bg.token) return; // 読み込み中に別のシーンへ進んだ
        bg.loadingKey = null;
        if (!url) {
          clearImage();
          return;
        }
        if (url === bg.url) return;
        for (var i = 0; i < list.length; i++) {
          if (list[i].url === url) {
            showImage(list[i]);
            return;
          }
        }
      }
    );
  }

  // ---------- キャラクター立ち絵（複数枠） ----------
  // 枠 .chara[data-id][data-pos] の中に、下から「光輪（SVG）→ 体」を重ねる。
  // 光輪は画像に描かず別要素にして、枠（＝立ち絵の大きさ）に対する % で位置を決めるので立ち絵に追随する。
  var SVG_NS = "http://www.w3.org/2000/svg";

  function charLayer() {
    return document.getElementById("char-layer");
  }

  function svgEl(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (k) {
      node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  /** 「砕けた文字盤のような光の輪」：欠けのある円環＋時刻の目盛り＋ひび（見た目は仮） */
  function buildHalo() {
    var wrap = document.createElement("div");
    wrap.className = "chara-halo";
    var svg = svgEl("svg", { viewBox: "0 0 100 100", focusable: "false" });
    svg.appendChild(svgEl("circle", { class: "halo-glow", cx: 50, cy: 50, r: 44 }));
    // 欠けのある外環（周長 2π×42 ≒ 264 を、長短の弧と欠けに分ける）
    svg.appendChild(svgEl("circle", { class: "halo-ring", cx: 50, cy: 50, r: 42, "stroke-dasharray": "58 9 31 5 44 14 52 7 36 8" }));
    svg.appendChild(svgEl("circle", { class: "halo-ring halo-ring-inner", cx: 50, cy: 50, r: 34, "stroke-dasharray": "40 12 66 6 28 10 46 6" }));
    for (var i = 0; i < 12; i++) {
      if (i === 4 || i === 9) continue; // 砕けて失われた目盛り
      var a = (i * Math.PI) / 6;
      var r1 = i % 3 === 0 ? 35.5 : 37.5;
      svg.appendChild(
        svgEl("line", {
          class: "halo-tick",
          x1: (50 + Math.sin(a) * r1).toFixed(2),
          y1: (50 - Math.cos(a) * r1).toFixed(2),
          x2: (50 + Math.sin(a) * 40.5).toFixed(2),
          y2: (50 - Math.cos(a) * 40.5).toFixed(2)
        })
      );
    }
    svg.appendChild(svgEl("path", { class: "halo-crack", d: "M50 50 L61 38 L58 27 L67 14 M50 50 L37 57 L33 70 L22 76 M61 38 L72 41" }));
    wrap.appendChild(svg);
    return wrap;
  }

  /** 論理名（人物・ポーズ・表情）→ 画像 URL の候補と光輪の位置。無ければ urls は空 */
  function resolveChara(c) {
    var out = { urls: [], halo: null };
    var table = manifest && manifest.characters;
    var def = table && typeof table === "object" ? table[c.id] : null;
    if (!def || typeof def !== "object") return out;
    var pose = def.poses && typeof def.poses === "object" ? def.poses[c.pose] : null;
    if (!pose || typeof pose !== "object") return out;
    var file = pose.exprs && typeof pose.exprs === "object" ? pose.exprs[c.expr] : null;
    var base = typeof def.base === "string" ? def.base : "";
    var list = typeof file === "string" ? [file] : Array.isArray(file) ? file : [];
    out.urls = candidates(
      list
        .filter(function (v) {
          return typeof v === "string" && v;
        })
        .map(function (v) {
          return /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(v) ? v : base + v;
        })
    );
    var h = pose.halo;
    if (h && typeof h === "object" && isFinite(h.x) && isFinite(h.y) && isFinite(h.size)) {
      out.halo = { x: Number(h.x), y: Number(h.y), size: Number(h.size) };
    }
    return out;
  }

  /** いま表示したい立ち絵の一覧。画像の候補が無い枠は含めない（＝その枠を表示しない） */
  function desiredCharas(entry, stage) {
    var out = [];
    if (!settings.images) return out;
    if (stage) {
      (stage.charas || []).forEach(function (c) {
        var r = resolveChara(c);
        if (!r.urls.length) return;
        out.push({
          id: c.id,
          pos: CHAR_POSITIONS.indexOf(c.pos) !== -1 ? c.pos : "center",
          urls: r.urls,
          halo: r.halo,
          haloState: stage.halo || "weak",
          dim: !!stage.speakerChara && stage.speakerChara !== c.id,
          fx: stage.fx || []
        });
      });
      return out;
    }
    // 従来形式：シーンに 1 枚だけの立ち絵（manifest の character / characterPosition）
    var legacy = candidates(entry.character);
    if (legacy.length) {
      out.push({
        id: "_scene",
        pos: CHAR_POSITIONS.indexOf(entry.characterPosition) !== -1 ? entry.characterPosition : "center",
        urls: legacy,
        halo: null,
        haloState: "off",
        dim: false,
        fx: []
      });
    }
    return out;
  }

  function syncCharaLayer() {
    var layer = charLayer();
    var active = Object.keys(chara.slots).filter(function (id) {
      return !!chara.slots[id].url;
    });
    if (layer) layer.setAttribute("data-count", String(active.length));
    document.body.classList.toggle("has-char", active.length > 0);
    var url = active.length ? chara.slots[active[0]].url : null;
    if (url !== chara.url) {
      chara.url = url;
      notify();
    }
  }

  function removeSlot(id) {
    var slot = chara.slots[id];
    if (!slot) return;
    delete chara.slots[id];
    slot.token += 1;
    var node = slot.node;
    node.classList.remove("is-active");
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, CHARA_FADE_MS);
    syncCharaLayer();
  }

  function createSlot(id) {
    var layer = charLayer();
    if (!layer) return null;
    var node = document.createElement("div");
    node.className = "chara";
    node.setAttribute("data-id", id);
    var img = document.createElement("img");
    img.className = "chara-img";
    img.alt = "";
    img.decoding = "async";
    node.appendChild(img);
    layer.appendChild(node);
    var slot = { node: node, img: img, halo: null, url: null, token: 0, want: null };
    chara.slots[id] = slot;
    return slot;
  }

  function replay(node, className) {
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
  }

  function updateSlot(slot, want) {
    var node = slot.node;
    node.setAttribute("data-pos", want.pos);
    node.classList.toggle("is-dim", want.dim);

    if (want.halo) {
      if (!slot.halo) {
        slot.halo = buildHalo();
        node.insertBefore(slot.halo, slot.img); // 体より下（背面）
      }
      slot.halo.style.left = want.halo.x + "%";
      slot.halo.style.top = want.halo.y + "%";
      slot.halo.style.width = want.halo.size + "%";
      slot.halo.setAttribute("data-state", want.haloState);
    } else if (slot.halo) {
      node.removeChild(slot.halo);
      slot.halo = null;
    }

    want.fx.forEach(function (name) {
      if (CHARA_FX.indexOf(name) !== -1) replay(node, "fx-" + name);
    });
  }

  function applyCharacters(entry, stage) {
    var wants = desiredCharas(entry, stage);
    var keep = {};
    wants.forEach(function (w) {
      keep[w.id] = true;
    });
    Object.keys(chara.slots).forEach(function (id) {
      if (!keep[id]) removeSlot(id);
    });

    wants.forEach(function (want) {
      var slot = chara.slots[want.id] || createSlot(want.id);
      if (!slot) return;
      updateSlot(slot, want);
      if (want.urls[0] === slot.url) {
        slot.token += 1; // 表示中の絵のまま（読み込み中の別表情があれば取り消す）
        slot.want = null;
        return;
      }
      var key = want.urls.join("|");
      if (key === slot.want) return; // 同じ絵を読み込み中
      slot.want = key;
      var token = (slot.token += 1);
      loadFirst(want.urls, function (url) {
        if (token !== slot.token || chara.slots[want.id] !== slot) return; // 読み込み中に状態が変わった
        slot.want = null;
        if (!url) {
          removeSlot(want.id); // ファイルが無い：その枠を表示しない
          return;
        }
        slot.img.src = url;
        slot.url = url;
        void slot.node.offsetWidth; // フェードインを最初からやり直す
        slot.node.classList.add("is-active");
        syncCharaLayer();
      });
    });
    syncCharaLayer();
  }

  /** シーンで使う立ち絵と背景（論理名）を先に読み込んでおく（表情切替・背景切替の初回で待たせない） */
  function preload(list, bgNames) {
    if (manifestState !== "ready" || !settings.images) return;
    (list || []).forEach(function (c) {
      var urls = resolveChara(c).urls;
      if (urls.length) loadFirst(urls, function () {});
    });
    (bgNames || []).forEach(function (name) {
      var urls = namedBgCandidates(name).map(function (item) {
        return item.url;
      });
      if (urls.length) loadFirst(urls, function () {});
    });
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
  function apply(skipBgm) {
    if (currentKey == null || manifestState !== "ready") return;
    var entry = entryFor(currentKey);
    applyImage(entry, currentStage);
    applyCharacters(entry, currentStage);
    if (!skipBgm) applyBgm(entry);
  }

  /**
   * key: シーンID、またはタイトル画面を表す "title"
   * stage: 新形式シーンの舞台状態（省略・null なら従来どおりマニフェストのシーン設定だけで表示）
   */
  function setScene(key, stage) {
    currentKey = key;
    currentStage = stage || null;
    apply();
  }

  /** 同じシーンの中でページが進んだとき：背景と立ち絵だけを合わせ直す（BGM には触らない） */
  function setStage(stage) {
    currentStage = stage || null;
    apply(true);
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
    setStage: setStage,
    preload: preload,
    setVolume: setVolume,
    setMuted: setMuted,
    setImagesEnabled: setImagesEnabled,
    onChange: onChange,
    info: info
  };
})(this);
