#!/usr/bin/env node
/*
 * 公開用に、エンジンと作品を 1 つのフォルダへまとめる（novel-work スキル）
 * ------------------------------------------------------------
 *   node .claude/skills/novel-work/scripts/build-work.js works/<作品ID> --out <出力フォルダ> [--description 説明文]
 *
 * - index.html の <script>・<link rel="stylesheet"> をたどり、作品のフォルダ → このリポジトリ（エンジン）の順に探して写す
 *   （tools/preview-server.js --work と同じ重ね合わせ）。
 * - 素材：作品の assets/ を丸ごと写し、manifest が指していて作品に無いファイルは、エンジン側にあればそこから写す
 *   （本作の素材を借りたことを一覧で知らせる）。どこにも無いファイルは「無い素材」として知らせる（ゲームは素材なしで動く）。
 * - index.html は次だけ書き換える：<title>（WORK.documentTitle か WORK.title）、<meta name="description">
 *   （--description か WORK.lead）。版（data-app-version・?v=）は js/game.js の VERSION と一致が必要なので変えない。
 *   タイトル画面の紋章（文字盤の針）は本作の絵のまま残る（references/pitfalls.md）。
 * - 出力フォルダは、無いか空のときだけ使う（上書きしない）。このリポジトリの中は拒む（写しをリポジトリに入れない）。
 * - まとめたあと、出力フォルダだけで tools/validate-story.js と同じ点検をし、誤りがあれば失敗にする。
 */
"use strict";

var fs = require("fs");
var path = require("path");

var SKILL_ROOT = path.resolve(__dirname, "..");
var REPO_ROOT = path.resolve(SKILL_ROOT, "..", "..", "..");

function fail(msg) {
  console.error("build-work: " + msg);
  process.exit(1);
}
function arg(name) {
  var i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
}
function inside(child, parent) {
  var r = path.relative(parent, child);
  return r === "" || (!!r && r.split(path.sep)[0] !== ".." && !path.isAbsolute(r));
}
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function listFiles(dir, base) {
  base = base || "";
  var out = [];
  if (!fs.existsSync(path.join(dir, base))) return out;
  fs.readdirSync(path.join(dir, base), { withFileTypes: true }).forEach(function (d) {
    var rel = base ? base + "/" + d.name : d.name;
    if (d.isDirectory()) out = out.concat(listFiles(dir, rel));
    else out.push(rel);
  });
  return out;
}

/** manifest が指すファイル（basePath からの相対）をすべて集める */
function manifestFiles(manifest) {
  var out = {};
  function addAll(v) {
    (Array.isArray(v) ? v : [v]).forEach(function (x) {
      if (typeof x === "string" && x) out[x] = true;
    });
  }
  function entry(e) {
    if (!e || typeof e !== "object") return;
    ["image", "bgm", "character"].forEach(function (k) { addAll(e[k]); });
  }
  if (!manifest || typeof manifest !== "object") return [];
  entry(manifest.defaults);
  entry(manifest.title);
  [manifest.backgrounds, manifest.scenes].forEach(function (group) {
    if (group && typeof group === "object") Object.keys(group).forEach(function (k) { entry(group[k]); });
  });
  var charas = manifest.characters && typeof manifest.characters === "object" ? manifest.characters : {};
  Object.keys(charas).forEach(function (id) {
    var c = charas[id] || {};
    var base = typeof c.base === "string" ? c.base : "";
    var poses = c.poses && typeof c.poses === "object" ? c.poses : {};
    Object.keys(poses).forEach(function (p) {
      var exprs = poses[p] && typeof poses[p].exprs === "object" ? poses[p].exprs : {};
      Object.keys(exprs).forEach(function (e) {
        (Array.isArray(exprs[e]) ? exprs[e] : [exprs[e]]).forEach(function (f) {
          if (typeof f === "string" && f) out[base + f] = true;
        });
      });
    });
  });
  return Object.keys(out).sort();
}

function main() {
  var workArg = process.argv[2];
  var outArg = arg("--out");
  if (!workArg || /^--/.test(workArg)) fail("作品のフォルダを指定してください（例：build-work.js works/my-story --out ../my-story-site）");
  if (!outArg) fail("--out で出力フォルダを指定してください");
  var work = path.resolve(workArg);
  var out = path.resolve(outArg);
  if (!fs.existsSync(path.join(work, "js", "work.js")) || !fs.existsSync(path.join(work, "js", "story.js"))) {
    fail(workArg + " に js/work.js と js/story.js がありません");
  }
  if (inside(out, REPO_ROOT) || inside(REPO_ROOT, out)) fail("出力フォルダがこのリポジトリと重なっています。リポジトリの外を指定してください");
  if (fs.existsSync(out) && fs.readdirSync(out).length) fail(outArg + " は空ではありません（上書きはしません）");

  var roots = [work, REPO_ROOT];
  function find(rel) {
    for (var i = 0; i < roots.length; i++) {
      var f = path.join(roots[i], rel);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    }
    return null;
  }
  var copied = [];
  function copy(rel, from) {
    var dst = path.join(out, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(from, dst);
    copied.push(rel);
  }

  var loadWork = require(path.join(REPO_ROOT, "tools", "lib", "load-work.js")).loadWork;
  var loaded = loadWork({ roots: roots });
  var WORK = loaded.WORK || {};

  // 1. index.html が読むファイル（エンジン＋作品）
  var htmlFile = find("index.html");
  var html = fs.readFileSync(htmlFile, "utf8");
  var refs = [];
  html.replace(/<script\s+src="([^"?]+)(?:\?[^"]*)?"/g, function (_, src) { refs.push(src); });
  html.replace(/<link\s+rel="stylesheet"\s+href="([^"?]+)(?:\?[^"]*)?"/g, function (_, href) { refs.push(href); });
  refs.forEach(function (rel) {
    var f = find(rel);
    if (!f) fail("index.html が読む " + rel + " が、作品にもエンジンにもありません");
    copy(rel, f);
  });

  // 2. index.html（題名と説明だけ書き換える）
  var title = WORK.documentTitle || WORK.title;
  var desc = arg("--description") || (Array.isArray(WORK.lead) ? WORK.lead.join("") : null);
  if (title) html = html.replace(/<title>[^<]*<\/title>/, "<title>" + escHtml(title) + "</title>");
  if (desc) html = html.replace(/(<meta name="description" content=")[^"]*(")/, "$1" + escHtml(desc) + "$2");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "index.html"), html);
  copied.push("index.html");

  // 3. 素材
  listFiles(path.join(work, "assets")).forEach(function (rel) {
    copy("assets/" + rel, path.join(work, "assets", rel));
  });
  var manifest = loaded.manifest;
  if (!fs.existsSync(path.join(out, "assets", "manifest.json"))) {
    var m = find("assets/manifest.json");
    if (m) copy("assets/manifest.json", m);
  }
  var base = manifest && typeof manifest.basePath === "string" ? manifest.basePath : "assets/";
  var borrowed = [];
  var missing = [];
  manifestFiles(manifest).forEach(function (f) {
    var rel = path.posix.join(base, f);
    if (fs.existsSync(path.join(out, rel))) return;
    var src = path.join(REPO_ROOT, rel);
    if (fs.existsSync(src)) {
      copy(rel, src);
      borrowed.push(rel);
    } else missing.push(rel);
  });

  // 4. 出力フォルダだけで点検する
  var validate = require(path.join(REPO_ROOT, "tools", "validate-story.js")).validate;
  var result = validate(loadWork({ roots: [out] }));

  console.log("まとめた先: " + out + "（" + copied.length + " ファイル）");
  if (borrowed.length) console.log("本作（リポジトリ直下）の素材を借りたもの " + borrowed.length + " 件:\n  " + borrowed.join("\n  "));
  if (missing.length) console.log("無い素材 " + missing.length + " 件（素材なしで表示されます）:\n  " + missing.join("\n  "));
  console.log("残っている本作の部分: タイトル画面の紋章（文字盤の針）、版 " + (html.match(/data-app-version="([^"]*)"/) || [])[1]);
  result.warnings.forEach(function (w) { console.log("注意: " + w); });
  result.errors.forEach(function (e) { console.log("誤り: " + e); });
  console.log((result.errors.length ? "NG" : "OK") + ": 誤り " + result.errors.length + " 件、注意 " + result.warnings.length + " 件");
  if (result.errors.length) process.exit(1);
}

main();
