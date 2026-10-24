// Cloudflare Pages Functions 用の小さな共通処理
// サイトはだれでも開けるので、AI の使いすぎを防ぐ簡単な制限を入れる

const sarashina = require("./sarashina");

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

// 同じ人（IP）からの連続した呼び出しを、1分あたりの回数で制限する（同じサーバーの中だけの簡易版）
const hits = new Map();
function tooMany(request, perMinute) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > perMinute;
}

// 共通の入口：キーの設定・回数制限・JSON の読み込み・エラーの形をそろえる
function handler(fn, { perMinute = 20, maxBytes = 20000 } = {}) {
  return async ({ request, env }) => {
    if (request.method !== "POST") return json({ error: "POST で呼んでください" }, 405);
    if (!env.SARASHINA_API_KEY) return json({ error: "サーバーに SARASHINA_API_KEY が設定されていません" }, 500);
    if (tooMany(request, perMinute)) return json({ error: "少し時間をおいてから、もう一度試してください" }, 429);
    const text = await request.text();
    if (text.length > maxBytes) return json({ error: "送られた内容が長すぎます" }, 413);
    let body;
    try {
      body = JSON.parse(text || "{}");
    } catch {
      return json({ error: "送られた内容を読み取れませんでした" }, 400);
    }
    sarashina.setApiKey(env.SARASHINA_API_KEY);
    try {
      return json(await fn(body, env));
    } catch (e) {
      return json({ error: e.message || "うまくいきませんでした" }, e.retryAfter ? 429 : 500);
    }
  };
}

// 画面から送られてきた記事の情報を、必要な項目だけに整える
function cleanItem(n) {
  if (!n || typeof n !== "object") throw new Error("記事の情報がありません");
  const id = String(n.id || "");
  const isVideo = n.kind === "video";
  if (isVideo ? !/^(yt-[\w-]{6,20}|pv-\d{1,9})$/.test(id) : !/^\d{1,12}$/.test(id)) throw new Error("記事のIDが正しくありません");
  const s = (v, max) => String(v || "").slice(0, max);
  return {
    id: isVideo ? id : Number(id), kind: isVideo ? "video" : "news",
    title: s(n.title, 300), publisher: s(n.publisher, 100), publishedAt: s(n.publishedAt, 40), summary: s(n.summary, 1500), url: s(n.url, 300),
  };
}

module.exports = { json, handler, cleanItem };
