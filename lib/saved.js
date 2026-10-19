// 「保存」した重要な記事（data/saved.json）
// 1か月を過ぎて一覧から消えても残るよう、記事と解説をまるごと保存する

const jsonfile = require("./jsonfile");

const FILE = "saved.json";

function all() {
  return jsonfile.read(FILE, {});
}

function add(article, explanation) {
  const saved = all();
  saved[article.id] = { article, explanation: explanation || null, savedAt: new Date().toISOString() };
  jsonfile.write(FILE, saved);
}

function remove(id) {
  const saved = all();
  delete saved[id];
  jsonfile.write(FILE, saved);
}

// 保存後に解説ができた・作り直された場合に、保存済みの解説を最新にする
function refreshExplanations(explanations) {
  const saved = all();
  let changed = false;
  for (const [id, s] of Object.entries(saved)) {
    const latest = explanations[id];
    if (latest && latest.generatedAt !== s.explanation?.generatedAt) {
      s.explanation = explanations[id];
      changed = true;
    }
  }
  if (changed) jsonfile.write(FILE, saved);
  return saved;
}

module.exports = { all, add, remove, refreshExplanations };
