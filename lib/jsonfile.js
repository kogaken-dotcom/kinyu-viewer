// data/ フォルダの JSON ファイルを読み書きする小さなヘルパー
// 記事データは大きい（数MB〜十数MB）ので、ファイルが変わっていなければ読み込んだ結果を使い回す

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const cache = new Map(); // ファイル名 → { mtimeMs, size, value }

function read(name, fallback) {
  const file = path.join(DATA_DIR, name);
  try {
    const st = fs.statSync(file);
    const hit = cache.get(name);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.value;
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    cache.set(name, { mtimeMs: st.mtimeMs, size: st.size, value });
    return value;
  } catch {
    return fallback;
  }
}

// 書き込み途中で壊れないよう、一時ファイルに書いてから置き換える
function write(name, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, name);
  fs.writeFileSync(file + ".tmp", JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(file + ".tmp", file);
  const st = fs.statSync(file);
  cache.set(name, { mtimeMs: st.mtimeMs, size: st.size, value });
}

module.exports = { read, write };
