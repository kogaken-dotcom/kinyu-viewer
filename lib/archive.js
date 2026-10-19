// 取得した記事をためておく（data/articles.json）
// NewsPicks のページには直近数日分しか出ないため、取得のたびに追加して1か月分を保つ
// YouTube の動画は期限なしで全部残す

const jsonfile = require("./jsonfile");

const FILE = "articles.json";
const KEEP_DAYS = 31;

const cutoff = () => Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
const expired = (n) => n.kind !== "video" && new Date(n.publishedAt).getTime() < cutoff();

// 新しく取得した記事を追加（同じ記事は最新の情報で上書き）して、古いものを消す
function merge(category, items) {
  const all = jsonfile.read(FILE, {});
  const now = new Date().toISOString();
  for (const n of items) {
    const prev = all[n.id];
    all[n.id] = {
      ...n,
      categories: [...new Set([...(prev?.categories || []), category])],
      firstSeenAt: prev?.firstSeenAt || now,
    };
  }
  for (const [id, n] of Object.entries(all)) {
    if (expired(n)) delete all[id];
  }
  jsonfile.write(FILE, all);
  return all;
}

function list(category) {
  const all = jsonfile.read(FILE, {});
  return Object.values(all)
    .filter((n) => n.categories.includes(category) && !expired(n))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function get(id) {
  return jsonfile.read(FILE, {})[id] || null;
}

module.exports = { KEEP_DAYS, merge, list, get };
