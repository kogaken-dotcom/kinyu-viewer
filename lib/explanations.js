// やさしい解説の保存ファイル（data/explanations.json）の読み書き
// 解説は Sarashina で作って保存し、アプリはそれを表示する

const jsonfile = require("./jsonfile");

const FILE = "explanations.json";
const KEEP_DAYS = 31; // これより古いニュースの解説は自動で削除（保存した記事の解説は saved.json 側に残る。YouTube 動画の解説は消さない）

function load() {
  return jsonfile.read(FILE, {});
}

function save(all) {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const [id, e] of Object.entries(all)) {
    if (!id.startsWith("yt-") && new Date(e.generatedAt).getTime() < cutoff) delete all[id];
  }
  jsonfile.write(FILE, all);
}

module.exports = { load, save };
