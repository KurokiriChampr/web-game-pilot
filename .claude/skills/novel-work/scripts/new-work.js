#!/usr/bin/env node
/*
 * 新しい作品の骨組みを works/<作品ID>/ に作る（novel-work スキルの足場スクリプト）
 * ------------------------------------------------------------
 *   node .claude/skills/novel-work/scripts/new-work.js <作品ID> [--title 題名] [--dry-run]
 *
 * - templates/minimal/ の 4 ファイル（js/work.js・js/story.js・css/work.css・assets/manifest.json）を写し、
 *   作品 ID と題名を書き込む。エンジン（index.html・js/game.js など）は写さない（重ね合わせで使う）。
 * - 作品 ID は保存キーの接頭辞になる：半角の英小文字・数字・ハイフン（先頭は英小文字か数字）。
 *   このリポジトリの本作・検証用の作品・works/ の既存の作品と重なる ID は使えない。
 * - works/<作品ID>/ がすでにあるときは何もしない（上書きしない）。
 * - 作ったあと、tools/validate-story.js --work で点検し、誤りが出たら失敗にする。
 */
"use strict";

var fs = require("fs");
var path = require("path");

var SKILL_ROOT = path.resolve(__dirname, "..");
var REPO_ROOT = path.resolve(SKILL_ROOT, "..", "..", "..");
var TEMPLATE = path.join(SKILL_ROOT, "templates", "minimal");
var TEMPLATE_ID = "novel-work-template";
var TEMPLATE_TITLE = "作品の題名";
var ID_RULE = /^[a-z0-9][a-z0-9-]*$/; // js/game.js の WORK_ID と同じ規則
var RESERVED = /^(fixture-|novel-work-template$)/; // 検証用の作品とひな形の ID

function fail(msg) {
  console.error("new-work: " + msg);
  process.exit(1);
}

function listFiles(dir, base) {
  base = base || "";
  var out = [];
  fs.readdirSync(path.join(dir, base), { withFileTypes: true }).forEach(function (d) {
    var rel = base ? base + "/" + d.name : d.name;
    if (d.isDirectory()) out = out.concat(listFiles(dir, rel));
    else out.push(rel);
  });
  return out.sort();
}

/** js/work.js（module.exports 付き）から id を読む。読めなければ null */
function workIdOf(file) {
  if (!fs.existsSync(file)) return null;
  try {
    delete require.cache[require.resolve(file)];
    var w = require(file);
    return w && typeof w.id === "string" ? w.id : null;
  } catch (e) {
    return null;
  }
}

/** このリポジトリで使われている作品 ID → 場所 */
function usedIds() {
  var used = {};
  function add(dir) {
    var id = workIdOf(path.join(dir, "js", "work.js"));
    if (id) used[id] = path.relative(REPO_ROOT, dir) || "リポジトリ直下（本作）";
  }
  add(REPO_ROOT);
  var fixtures = path.join(REPO_ROOT, "tools", "fixtures");
  if (fs.existsSync(fixtures)) fs.readdirSync(fixtures).forEach(function (n) { add(path.join(fixtures, n)); });
  var works = path.join(REPO_ROOT, "works");
  if (fs.existsSync(works)) fs.readdirSync(works).forEach(function (n) { add(path.join(works, n)); });
  return used;
}

function main() {
  var args = process.argv.slice(2);
  var dry = args.indexOf("--dry-run") !== -1;
  var ti = args.indexOf("--title");
  var title = ti !== -1 ? args[ti + 1] : null;
  if (ti !== -1 && (!title || /^--/.test(title))) fail("--title のあとに題名を書いてください");
  var id = args.filter(function (a, i) {
    return !/^--/.test(a) && (ti === -1 || i !== ti + 1);
  })[0];

  if (!id) fail("作品 ID を指定してください（例：node .claude/skills/novel-work/scripts/new-work.js my-story --title \"題名\"）");
  if (!ID_RULE.test(id)) fail("作品 ID " + JSON.stringify(id) + " は使えません。半角の英小文字・数字・ハイフンで、先頭は英小文字か数字にしてください");
  if (RESERVED.test(id)) fail("作品 ID " + id + " は検証用・ひな形用の名前なので使えません");
  var used = usedIds();
  if (used[id]) fail("作品 ID " + id + " は " + used[id] + " で使われています（保存キーが混ざるので、別の ID にしてください）");
  var dest = path.join(REPO_ROOT, "works", id);
  if (fs.existsSync(dest)) fail(path.relative(REPO_ROOT, dest) + " はすでにあります（上書きはしません）");
  if (title != null && /["\\\n]/.test(title)) fail("題名に \" と \\ と改行は使えません");

  var files = listFiles(TEMPLATE);
  files.forEach(function (rel) {
    var text = fs.readFileSync(path.join(TEMPLATE, rel), "utf8").split(TEMPLATE_ID).join(id);
    if (title != null) text = text.split(TEMPLATE_TITLE).join(title);
    var out = path.join(dest, rel);
    console.log((dry ? "（作らない）" : "作成 ") + path.relative(REPO_ROOT, out));
    if (dry) return;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
  });
  if (dry) return;

  // 作ったものを点検する（ひな形は誤り 0・注意 0 の状態にしてある）
  var validate = require(path.join(REPO_ROOT, "tools", "validate-story.js")).validate;
  var loadWork = require(path.join(REPO_ROOT, "tools", "lib", "load-work.js")).loadWork;
  var result = validate(loadWork({ roots: [dest, REPO_ROOT] }));
  result.warnings.forEach(function (w) { console.log("注意: " + w); });
  result.errors.forEach(function (e) { console.log("誤り: " + e); });
  if (result.errors.length) fail("作った作品の点検で誤りが " + result.errors.length + " 件出ました（ひな形かエンジンの変更を確かめてください）");

  var rel = path.relative(REPO_ROOT, dest);
  console.log("");
  console.log("works/" + id + "/ を作りました（点検：誤り 0 件、注意 " + result.warnings.length + " 件）。次に：");
  console.log("  1. " + rel + "/js/work.js     … 題名・紹介文・HUD の用語");
  console.log("  2. " + rel + "/js/story.js    … 登場人物と物語");
  console.log("  3. " + rel + "/assets/manifest.json と " + rel + "/css/work.css");
  console.log("  点検:     node tools/validate-story.js --work " + rel);
  console.log("  プレビュー: node tools/preview-server.js --work " + rel + " --placeholders");
}

main();
