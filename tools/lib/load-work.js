/*
 * 作品（work）を Node で読み込む（検査・点検ツール用。ブラウザは使わない）
 * ------------------------------------------------------------
 * index.html の <script> を上から順にたどり、作品のデータを作るファイル（work.js・story.js・stage.js・章のファイル）を
 * 1 つの空間で実行する。エンジンの画面側（assets.js・game.js）は実行しない。
 *
 *   loadWork({ roots: [作品の差し替え分, エンジン], files: { パス: 内容 } })
 *     → { STORY, WORK, Stage, manifest, scripts: [読んだ順のパス], read(rel) }
 * roots は先頭から順に探す（tools/preview-server.js の roots と同じ重ね合わせ）。files はメモリ上のファイル。
 */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ENGINE_ROOT = path.resolve(__dirname, "..", "..");
var SCREEN_SCRIPTS = /(^|\/)(assets|game)\.js$/; // 画面を動かす側。Node では実行しない

function loadWork(options) {
  options = options || {};
  var roots = (options.roots && options.roots.length ? options.roots : [ENGINE_ROOT]).map(function (r) {
    return path.resolve(r);
  });
  var files = options.files || {};

  function read(rel) {
    if (Object.prototype.hasOwnProperty.call(files, rel)) return String(files[rel]);
    for (var i = 0; i < roots.length; i++) {
      var file = path.join(roots[i], rel);
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    }
    return null;
  }

  var html = read("index.html");
  if (html == null) throw new Error("index.html が見つかりません");
  var scripts = [];
  html.replace(/<script\s+src="([^"?]+)(?:\?[^"]*)?"/g, function (_, src) {
    scripts.push(src);
  });

  var sandbox = {};
  sandbox.window = sandbox; // window.STORY と書いたファイルも読めるように
  vm.createContext(sandbox);
  scripts.forEach(function (src) {
    if (SCREEN_SCRIPTS.test(src)) return;
    var code = read(src);
    if (code == null) throw new Error("読み込むファイルがありません: " + src);
    vm.runInContext(code, sandbox, { filename: src });
  });

  var manifest = null;
  var raw = read("assets/manifest.json");
  if (raw != null) {
    try {
      manifest = JSON.parse(raw);
    } catch (e) {
      manifest = null;
    }
  }
  return { STORY: sandbox.STORY, WORK: sandbox.WORK, Stage: sandbox.GameStage, manifest: manifest, scripts: scripts, read: read };
}

module.exports = { loadWork: loadWork, ENGINE_ROOT: ENGINE_ROOT };
