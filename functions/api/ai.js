// AI の中継（Cloudflare Pages Functions）
// Sarashina は GitHub のサーバーからの接続を断るので、2時間ごとの自動更新は AI の呼び出しだけここを通す。
// 合言葉は「SARASHINA_API_KEY の SHA-256」。GitHub と Cloudflare の両方が同じキーを持っているので、別の合言葉を増やさずに済む。

import { json } from "../../lib/cf-util.js";
import sarashina from "../../lib/sarashina.js";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "POST で呼んでください" }, 405);
  if (!env.SARASHINA_API_KEY) return json({ error: "サーバーに SARASHINA_API_KEY が設定されていません" }, 500);
  const expected = await sarashina.keyFingerprint(env.SARASHINA_API_KEY);
  if (request.headers.get("X-AI-Auth") !== expected) return json({ error: "合言葉が違います" }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "送られた内容を読み取れませんでした" }, 400);
  }
  sarashina.setApiKey(env.SARASHINA_API_KEY);
  try {
    const text = await sarashina.directCall({
      model: String(body.model || sarashina.MODEL),
      messages: Array.isArray(body.messages) ? body.messages : [],
      schema: body.schema || undefined,
      name: body.name || undefined,
      maxTokens: Math.min(Number(body.maxTokens) || 2000, 8000),
      temperature: Number(body.temperature ?? 0.3),
    });
    return json({ text });
  } catch (e) {
    return json({ error: e.message, retryAfter: e.retryAfter || null, retryable: !!e.retryable }, e.retryAfter ? 429 : 500);
  }
}
