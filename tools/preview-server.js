#!/usr/bin/env node
/*
 * プレビュー用の簡易サーバ（依存なし）
 * ------------------------------------------------------------
 *   node tools/preview-server.js [--port 8080] [--placeholders]
 *
 * --placeholders を付けると、assets/images/chara/ と assets/images/bg/ の下で
 * 「まだ存在しないファイル」への要求に、その場で作った仮の絵（SVG）を返す。
 * 実素材が届く前に、立ち絵の位置・表情切替・光輪の追随を画面で確かめるためのもの。
 * リポジトリにダミーファイルは置かない（仮の絵はメモリ上で作るだけ）。
 * 付けない場合は実ファイルだけを返すので、「素材が無いときのフォールバック」を確かめられる。
 */
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");

var DEFAULT_ROOT = path.resolve(__dirname, "..");
var TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".md": "text/plain; charset=utf-8"
};

var EXPR_FACE = {
  normal: { brow: 0, mouth: "M-16 26 Q0 34 16 26", eye: 7 },
  surprised: { brow: -10, mouth: "M-8 24 a8 10 0 1 0 16 0 a8 10 0 1 0 -16 0", eye: 11 },
  wry: { brow: 4, mouth: "M-16 30 Q-2 24 16 32", eye: 6 },
  serious: { brow: 6, mouth: "M-14 30 L14 30", eye: 6 },
  down: { brow: 3, mouth: "M-12 32 Q0 28 12 32", eye: 2 }
};

function charaSvg(name) {
  var m = /^(\w+?)_(\w+)$/.exec(name) || [null, "stand", name];
  var pose = m[1];
  var expr = m[2];
  var f = EXPR_FACE[expr] || EXPR_FACE.normal;
  var sit = pose === "sit";
  var headY = sit ? 780 : 250;
  var body = sit
    ? '<path d="M250 900 Q400 820 550 900 L600 1250 Q640 1500 560 1560 L240 1560 Q160 1500 200 1250 Z" fill="#f4f1ea" stroke="#c9a85a" stroke-width="8"/>' +
      '<path d="M230 1250 Q400 1120 570 1250 L560 1420 Q400 1330 240 1420 Z" fill="#e9e4d8" stroke="#c9a85a" stroke-width="6"/>'
    : '<path d="M290 380 Q400 330 510 380 L570 1050 Q600 1500 560 1590 L240 1590 Q200 1500 230 1050 Z" fill="#f4f1ea" stroke="#c9a85a" stroke-width="8"/>' +
      '<path d="M250 640 L550 640" stroke="#c9a85a" stroke-width="14"/>';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1600" width="800" height="1600">' +
    '<path d="M' + (400 - 150) + " " + (headY - 20) + " Q400 " + (headY - 190) + " " + (400 + 150) + " " + (headY - 20) +
    " L" + (400 + 190) + " " + (headY + 520) + " L" + (400 - 190) + " " + (headY + 520) + ' Z" fill="#f1dea0" opacity="0.95"/>' +
    body +
    '<g transform="translate(400 ' + headY + ')">' +
    '<ellipse rx="96" ry="108" fill="#fde9d6" stroke="#b98d6a" stroke-width="5"/>' +
    '<path d="M-100 -30 Q0 -150 100 -30 Q40 -70 0 -40 Q-40 -70 -100 -30 Z" fill="#f1dea0"/>' +
    '<ellipse cx="-36" cy="-4" rx="11" ry="' + f.eye + '" fill="#3d5fa8"/><ellipse cx="36" cy="-4" rx="11" ry="' + f.eye + '" fill="#3d5fa8"/>' +
    '<path d="M-54 ' + (-26 + f.brow) + " L-20 " + (-30 - f.brow) + '" stroke="#8a6a3c" stroke-width="5"/>' +
    '<path d="M54 ' + (-26 + f.brow) + " L20 " + (-30 - f.brow) + '" stroke="#8a6a3c" stroke-width="5"/>' +
    '<path d="' + f.mouth + '" fill="none" stroke="#a0504a" stroke-width="5" stroke-linecap="round"/>' +
    "</g>" +
    '<rect x="150" y="1440" width="500" height="90" rx="14" fill="#1a1238" opacity="0.85"/>' +
    '<text x="400" y="1500" font-family="monospace" font-size="44" fill="#ffd27a" text-anchor="middle">仮 ' + pose + " / " + expr + "</text>" +
    "</svg>"
  );
}

function bgSvg(name) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27305e"/><stop offset="0.6" stop-color="#8d7fa8"/><stop offset="1" stop-color="#3f5a46"/></linearGradient></defs>' +
    '<rect width="1600" height="900" fill="url(#g)"/>' +
    '<rect x="690" y="-40" width="220" height="660" fill="#4a4460" stroke="#2c2840" stroke-width="6"/>' +
    '<circle cx="800" cy="150" r="74" fill="#cfe3ff" opacity="0.85"/>' +
    '<path d="M0 640 Q800 560 1600 640 L1600 900 L0 900 Z" fill="#35523f"/>' +
    '<path d="M560 620 L1040 620 L1080 680 L520 680 Z M520 680 L1080 680 L1130 750 L470 750 Z M470 750 L1130 750 L1190 830 L410 830 Z" fill="#6f7a6a" stroke="#48523f" stroke-width="5"/>' +
    '<text x="800" y="880" font-family="monospace" font-size="36" fill="#ffffff" opacity="0.7" text-anchor="middle">仮の背景 ' + name + "</text>" +
    "</svg>"
  );
}

function placeholderFor(rel) {
  var m = /^assets\/images\/chara\/[\w-]+\/([\w-]+)\.\w+$/.exec(rel);
  if (m) return charaSvg(m[1]);
  m = /^assets\/images\/bg\/([\w-]+)\.\w+$/.exec(rel);
  if (m) return bgSvg(m[1]);
  return null;
}

function createServer(options) {
  options = options || {};
  var ROOT = options.root ? path.resolve(options.root) : DEFAULT_ROOT;
  return http.createServer(function (req, res) {
    var rel;
    try {
      rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    } catch (e) {
      res.writeHead(400);
      res.end();
      return;
    }
    var file = path.resolve(ROOT, rel);
    if (file !== ROOT && file.indexOf(ROOT + path.sep) !== 0) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, function (err, data) {
      if (!err) {
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(data);
        return;
      }
      var svg = options.placeholders ? placeholderFor(rel) : null;
      if (svg) {
        res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
        res.end(svg);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
    });
  });
}

module.exports = { createServer: createServer };

if (require.main === module) {
  var args = process.argv.slice(2);
  var pi = args.indexOf("--port");
  var port = pi !== -1 ? parseInt(args[pi + 1], 10) || 8080 : 8080;
  var placeholders = args.indexOf("--placeholders") !== -1;
  createServer({ placeholders: placeholders }).listen(port, function () {
    console.log("http://localhost:" + port + "/  （仮の立ち絵・背景: " + (placeholders ? "あり" : "なし") + "）");
  });
}
