// NewsPicks 金融ニュースビューア（個人利用向け・依存パッケージなし）
// 起動: npm start → http://localhost:3000
// やさしい解説は Sarashina（国産AI・無料ベータ）で作り、data/explanations.json に保存する
// APIキーは .env の SARASHINA_API_KEY に書く
// 記事は取得のたびに data/articles.json にためて、1か月分を表示する
// 取得元（NewsPicks・YouTube チャンネル）は lib/sources.js で設定する

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { CATEGORIES, DEFAULT_CATEGORY, fetchNews } = require("./lib/sources");
const archive = require("./lib/archive");
const explanations = require("./lib/explanations");
const saved = require("./lib/saved");
const explainer = require("./lib/explainer");
const chat = require("./lib/chat");
const { askAbout } = require("./lib/ask");
const { getRates } = require("./lib/rates");
const { getPicks } = require("./lib/picks");
const { GENRES, guessGenre, normalizeGenre } = require("./lib/genres");
const { AUDIENCES, audiencesFor } = require("./lib/audiences");

const PORT = process.env.PORT || 3000;
const CACHE_MS = 5 * 60 * 1000; // NewsPicks への負荷を抑えるため5分に1回まで取得

const lastFetch = {}; // カテゴリごとの { at, error }

// 必要なら NewsPicks から取得してためる。失敗してもためてある記事は表示できるようにする
async function refresh(category, force) {
  const last = lastFetch[category];
  if (!force && last && Date.now() - last.at < CACHE_MS) return last;
  try {
    archive.merge(category, await fetchNews(category));
    explainer.enqueuePending(); // 新しい記事の解説を順番に作る
    return (lastFetch[category] = { at: Date.now(), error: null });
  } catch (e) {
    return (lastFetch[category] = { at: last?.at || 0, error: e.message });
  }
}

// 記事にジャンル・対象・解説・保存状態をつける
function decorate(n, ex, savedMap) {
  const e = ex[n.id] || savedMap[n.id]?.explanation || null;
  // ジャンルは AI の判定（古い分け方は読みかえ）、お客様のタイプはルールで決める
  const genre = e?.genre ? normalizeGenre(e.genre, n, e) : guessGenre(n, e);
  const audiences = audiencesFor(n, e, genre);
  return { ...n, genre, audiences, explanation: e, saved: !!savedMap[n.id], savedAt: savedMap[n.id]?.savedAt || null };
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch (e) { reject(e); } });
  });
}

const meta = () => ({
  genres: GENRES.map(({ id, label, icon, hint }) => ({ id, label, icon, hint })),
  audiences: AUDIENCES.map(({ id, label, icon, hint }) => ({ id, label, icon, hint })),
  keepDays: archive.KEEP_DAYS,
  ai: explainer.status(),
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/categories") {
    return sendJson(res, 200, Object.entries(CATEGORIES).map(([id, c]) => ({ id, label: c.label })));
  }

  if (url.pathname === "/api/news") {
    const category = url.searchParams.get("category") || DEFAULT_CATEGORY;
    if (!CATEGORIES[category]) return sendJson(res, 400, { error: "不明なカテゴリです" });
    const { at, error } = await refresh(category, url.searchParams.has("refresh"));
    const items = archive.list(category);
    if (!items.length && error) return sendJson(res, 502, { error });
    const ex = explanations.load(); // 定期タスクが更新するので毎回読み直す
    const savedMap = saved.refreshExplanations(ex);
    return sendJson(res, 200, {
      ...meta(),
      fetchedAt: at ? new Date(at).toISOString() : null,
      warning: error ? `最新の取得に失敗したため、ためてある記事を表示しています（${error}）` : CATEGORIES[category].note?.() || null,
      // 一覧では冒頭・概要欄を短くして送る（動画が数千本あるため。全文はポップアップで使わない）
      items: items.map((n) => ({ ...decorate(n, ex, savedMap), summary: (n.summary || "").slice(0, 160) })),
    });
  }

  // その場で解説を作る（できあがるまで待って返す）
  if (url.pathname === "/api/explain" && req.method === "POST") {
    try {
      const id = String((await readJson(req)).id);
      const article = archive.get(id) || saved.all()[id]?.article;
      if (!article) return sendJson(res, 404, { error: "記事が見つかりません。一覧を更新してください" });
      const e = await explainer.request(article);
      saved.refreshExplanations(explanations.load());
      return sendJson(res, 200, e);
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 今日のおすすめ5選（AI が選ぶ。3時間に1回まで選び直す）
  if (url.pathname === "/api/picks") {
    try {
      const p = await getPicks(url.searchParams.has("refresh"));
      const ex = explanations.load();
      const savedMap = saved.all();
      const items = p.picks
        .map((x) => ({ x, n: archive.get(x.id) }))
        .filter(({ n }) => n)
        .map(({ x, n }) => ({ ...decorate(n, ex, savedMap), reason: x.reason }));
      return sendJson(res, 200, { date: p.date, createdAt: p.createdAt, byAi: p.byAi, items });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 日本とアメリカの金利（30分ごとに取り直す）
  if (url.pathname === "/api/rates") {
    try {
      return sendJson(res, 200, await getRates(url.searchParams.has("refresh")));
    } catch (e) {
      return sendJson(res, 502, { error: e.message });
    }
  }

  // 深掘り質問：ポップアップで開いている記事・動画について AI に聞く
  if (url.pathname === "/api/ask" && req.method === "POST") {
    try {
      const { id, messages } = await readJson(req);
      const article = archive.get(String(id)) || saved.all()[String(id)]?.article;
      if (!article) return sendJson(res, 404, { error: "記事が見つかりません。一覧を更新してください" });
      const e = explanations.load()[article.id] || saved.all()[String(id)]?.explanation || null;
      return sendJson(res, 200, await askAbout(article, e, messages));
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // AIチャット：質問に答えて、合う記事・動画を探す
  if (url.pathname === "/api/chat" && req.method === "POST") {
    try {
      const { messages } = await readJson(req);
      const r = await chat.answer(messages);
      const ex = explanations.load();
      const savedMap = saved.all();
      return sendJson(res, 200, {
        answer: r.answer || "",
        reply: r.reply,
        keywords: r.keywords || [],
        items: r.picks.map((p) => ({ ...decorate(p.n, ex, savedMap), reason: p.reason })),
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 保存した記事の一覧（1か月を過ぎた記事も含む）
  if (url.pathname === "/api/saved" && req.method === "GET") {
    const ex = explanations.load();
    const savedMap = saved.refreshExplanations(ex);
    const items = Object.values(savedMap)
      .map((s) => decorate(archive.get(s.article.id) || s.article, ex, savedMap))
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    return sendJson(res, 200, { ...meta(), items });
  }

  // 保存する / 保存をやめる
  if (url.pathname === "/api/saved" && (req.method === "POST" || req.method === "DELETE")) {
    try {
      const id = String((await readJson(req)).id);
      if (req.method === "DELETE") {
        saved.remove(id);
        return sendJson(res, 200, { ok: true });
      }
      const article = archive.get(id);
      if (!article) return sendJson(res, 404, { error: "記事が見つかりません。一覧を更新してください" });
      saved.add(article, explanations.load()[id]);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // スマホのホーム画面に追加するための設定とアイコン
  const STATIC = {
    "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json; charset=utf-8"],
    "/icons/icon-192.png": ["icons/icon-192.png", "image/png"],
    "/icons/icon-512.png": ["icons/icon-512.png", "image/png"],
    "/icons/apple-touch-icon.png": ["icons/apple-touch-icon.png", "image/png"],
    "/apple-touch-icon.png": ["icons/apple-touch-icon.png", "image/png"],
  };
  if (STATIC[url.pathname]) {
    const [file, type] = STATIC[url.pathname];
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=86400" });
    fs.createReadStream(path.join(__dirname, "public", file)).pipe(res);
    return;
  }

  // スマホから開くための、このPCの Wi-Fi 上のアドレス
  if (url.pathname === "/api/lan") {
    const addrs = Object.values(os.networkInterfaces()).flat()
      .filter((a) => a && a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254."))
      .map((a) => `http://${a.address}:${PORT}/`);
    return sendJson(res, 200, { urls: addrs });
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(path.join(__dirname, "public", "index.html")).pipe(res);
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`NewsPicks Viewer: http://localhost:${PORT}`);
  for (const a of Object.values(os.networkInterfaces()).flat()) {
    if (a && a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) console.log(`  スマホ（同じWi-Fi）から: http://${a.address}:${PORT}/`);
  }
  const ai = explainer.status();
  console.log(ai.enabled ? `やさしい解説: Sarashina (${ai.model}) を使います` : "やさしい解説: APIキー未設定のため停止中（.env に SARASHINA_API_KEY を設定）");
  // 自動解説の対象は、画面で開いていなくても15分ごとに取得して解説する
  const refreshAuto = () => Object.entries(CATEGORIES).filter(([, c]) => c.autoExplain).forEach(([id]) => refresh(id));
  refreshAuto();
  setInterval(refreshAuto, 15 * 60 * 1000);
});
