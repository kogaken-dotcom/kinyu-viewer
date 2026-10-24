// スマホ用の公開サイトを site/ フォルダに作る（Cloudflare Pages に置く）
//   - 画面（index.html）は PC 版と同じファイル。window.APP_MODE = "static" を入れて、データを静的ファイルから読むようにする
//   - data/ … 一覧・解説・金利・おすすめを JSON にしたもの
//   - functions/ … コーチ・マイクのチャット・深掘り質問・その場の解説（Cloudflare Pages Functions）
//   - lib/ … functions が使う AI の部分（PC 版と同じファイル）

const fs = require("fs");
const path = require("path");
const archive = require("../lib/archive");
const explanations = require("../lib/explanations");
const jsonfile = require("../lib/jsonfile");
const { CATEGORIES, DEFAULT_CATEGORY } = require("../lib/sources");
const { GENRES, guessGenre, normalizeGenre } = require("../lib/genres");
const { AUDIENCES, audiencesFor } = require("../lib/audiences");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "site");
const BUCKETS = 128;

// 記事ID → 解説ファイルの番号（画面側と同じ計算）
function bucketOf(id) {
  let h = 5381;
  for (const ch of String(id)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h % BUCKETS;
}

const write = (rel, value) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
};
const copy = (from, to = from) => {
  const dst = path.join(OUT, to);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(ROOT, from), dst);
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ---------- 一覧 ----------
const ex = explanations.load();
function compact(n) {
  const e = ex[n.id];
  const genre = e?.genre ? normalizeGenre(e.genre, n, e) : guessGenre(n, e);
  return {
    id: n.id, kind: n.kind || "news", title: n.title, publisher: n.publisher, publishedAt: n.publishedAt,
    image: n.image, url: n.url, pickCount: n.pickCount ?? null, views: n.views ?? null, paid: !!n.paid,
    summary: n.kind === "video" ? "" : (n.summary || "").slice(0, 160), // 動画の概要欄は宣伝が多く画面でも使わないので入れない（軽くするため）
    genre, audiences: audiencesFor(n, e, genre),
    oneLine: e?.oneLine || null, hasEx: !!e,
  };
}

const state = jsonfile.read("state.json", {});
const all = new Map();
for (const id of Object.keys(CATEGORIES)) {
  const items = archive.list(id).map(compact);
  for (const n of items) all.set(String(n.id), { ...n, cats: [...(all.get(String(n.id))?.cats || []), id] });
  write(`data/list-${id}.json`, { updatedAt: state.updatedAt || new Date().toISOString(), note: state.notes?.[id] || null, items });
}

// チャット用の検索データ（全カテゴリの記事・動画をまとめたもの）
write("data/search.json", [...all.values()].map((n) => ({
  id: n.id, kind: n.kind, title: n.title, publisher: n.publisher, publishedAt: n.publishedAt, image: n.image, url: n.url,
  genre: n.genre, audiences: n.audiences, oneLine: n.oneLine, pickCount: n.pickCount, views: n.views, paid: n.paid, hasEx: n.hasEx,
})));

// ---------- 解説（128個のファイルに分けて、開いた記事の分だけ読む） ----------
const buckets = Array.from({ length: BUCKETS }, () => ({}));
for (const [id, e] of Object.entries(ex)) if (all.has(String(id))) buckets[bucketOf(id)][id] = e;
buckets.forEach((b, i) => write(`data/ex/${i}.json`, b));

// ---------- 金利・おすすめ・設定 ----------
write("data/rates.json", jsonfile.read("rates.json", { jp: {}, us: {}, errors: ["まだ取得していません"] }));
const picks = jsonfile.read("picks.json", null);
write("data/picks.json", picks
  ? { date: picks.date, createdAt: picks.createdAt, byAi: picks.byAi, items: picks.picks.map((p) => all.get(String(p.id)) && { ...all.get(String(p.id)), reason: p.reason }).filter(Boolean) }
  : { items: [] });
write("data/meta.json", {
  updatedAt: state.updatedAt || new Date().toISOString(),
  defaultCategory: DEFAULT_CATEGORY,
  categories: Object.entries(CATEGORIES).map(([id, c]) => ({ id, label: c.label })),
  genres: GENRES.map(({ id, label, icon, hint }) => ({ id, label, icon, hint })),
  audiences: AUDIENCES.map(({ id, label, icon, hint }) => ({ id, label, icon, hint })),
  keepDays: archive.KEEP_DAYS,
  buckets: BUCKETS,
});

// ---------- 画面 ----------
let html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
html = html.replace("<head>", `<head>\n<meta name="robots" content="noindex, nofollow">\n<script>window.APP_MODE = "static";</script>`);
write("index.html", html);
copy("public/manifest.webmanifest", "manifest.webmanifest");
for (const f of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) copy(`public/icons/${f}`, `icons/${f}`);
copy("public/icons/apple-touch-icon.png", "apple-touch-icon.png");
write("robots.txt", "User-agent: *\nDisallow: /\n");

// ---------- Cloudflare 用の設定と関数 ----------
// /api/* だけ関数を動かす（それ以外はただのファイルなので無料枠を使わない）
write("_routes.json", { version: 1, include: ["/api/*"], exclude: [] });
write("_headers", [
  "/data/*",
  "  Cache-Control: public, max-age=300",
  "/index.html",
  "  Cache-Control: no-cache",
  "/",
  "  Cache-Control: no-cache",
  "",
].join("\n"));
for (const f of ["chat.js", "ask.js", "explain.js", "ai.js"]) copy(`functions/api/${f}`, `functions/api/${f}`);
for (const f of ["sarashina.js", "genres.js", "body.js", "ask.js", "chat-ai.js", "cf-util.js"]) copy(`lib/${f}`, `lib/${f}`);

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((s, d) => s + (d.isDirectory() ? size(path.join(dir, d.name)) : fs.statSync(path.join(dir, d.name)).size), 0);
console.log(`site/ を作りました（記事・動画 ${all.size}件、解説 ${Object.keys(ex).length}件、合計 ${(size(OUT) / 1e6).toFixed(1)}MB）`);
