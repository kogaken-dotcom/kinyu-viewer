// AI の中継（Vercel・東京）
// Sarashina は日本の外からの接続を断るので、GitHub Actions の自動更新は AI の呼び出しだけ、東京で動くここを通す。
// 合言葉は「SARASHINA_API_KEY の SHA-256」（functions/api/ai.js と同じ）。
// 置き方: vercel フォルダで `npx vercel deploy --prod`。Vercel に SARASHINA_API_KEY を登録しておく。

const crypto = require("crypto");

const ENDPOINT = "https://api.sarashina.ai/v1/chat/completions";

module.exports = async (req, res) => {
  const send = (status, body) => res.status(status).json(body);
  if (req.method !== "POST") return send(405, { error: "POST で呼んでください" });
  const key = process.env.SARASHINA_API_KEY;
  if (!key) return send(500, { error: "Vercel に SARASHINA_API_KEY が設定されていません" });
  const expected = crypto.createHash("sha256").update(key).digest("hex");
  if (req.headers["x-ai-auth"] !== expected) return send(403, { error: "合言葉が違います" });

  const b = req.body && typeof req.body === "object" ? req.body : {};
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "User-Agent": "newspicks-viewer/1.0" },
    body: JSON.stringify({
      model: String(b.model || "sarashina3-mini"),
      messages: Array.isArray(b.messages) ? b.messages : [],
      max_completion_tokens: Math.min(Number(b.maxTokens) || 2000, 8000),
      temperature: Number(b.temperature ?? 0.3),
      ...(b.schema && { response_format: { type: "json_schema", json_schema: { name: b.name || "result", schema: b.schema, strict: true } } }),
    }),
  }).catch((e) => ({ ok: false, status: 0, error: e }));

  const where = `［${process.env.VERCEL_REGION || "?"}］`;
  if (r.status === 429) {
    const after = Number(r.headers.get("retry-after")) || 60;
    return send(429, { error: "混み合っています（1分あたりの回数制限）", retryAfter: after, retryable: true });
  }
  if (!r.ok) {
    const detail = r.json ? await r.json().catch(() => ({})) : {};
    const msg = r.status === 401 ? "APIキーが正しくないか、使えなくなっています"
      : r.status === 403 ? "AI のサーバーに接続を断られました（403）"
      : `AIの呼び出しでエラーが起きました (${r.status}) ${detail.error?.message || detail.message || r.error?.message || ""}`.trim();
    return send(500, { error: msg + where, retryable: r.status >= 500 || r.status === 0 });
  }
  const body = await r.json().catch(() => ({}));
  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") return send(500, { error: "AIの返事が長すぎて途中で切れました", retryable: true });
  return send(200, { text: choice?.message?.content || "" });
};
