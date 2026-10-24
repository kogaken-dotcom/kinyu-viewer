// AI の中継（Cloudflare Workers・東京）
//   POST /  { model, messages, schema?, name?, maxTokens?, temperature? } → { text }
//   GET  /where → どこの Cloudflare から外に出ているか（東京で動いているかの確認用）
// 合言葉は「SARASHINA_API_KEY の SHA-256」（lib/sarashina.js の keyFingerprint と同じ）。

const ENDPOINT = "https://api.sarashina.ai/v1/chat/completions";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function where() {
  const t = await fetch("https://www.cloudflare.com/cdn-cgi/trace").then((r) => r.text()).catch(() => "");
  return (t.match(/^colo=(.*)$/m) || [])[1] || "?";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/where") return json({ colo: await where(), entry: request.cf?.colo || "?" });
    if (request.method !== "POST") return json({ error: "POST で呼んでください" }, 405);
    const key = env.SARASHINA_API_KEY;
    if (!key) return json({ error: "Cloudflare に SARASHINA_API_KEY が設定されていません" }, 500);
    if (request.headers.get("X-AI-Auth") !== (await sha256(key))) return json({ error: "合言葉が違います" }, 403);

    let b;
    try {
      b = await request.json();
    } catch {
      return json({ error: "送られた内容を読み取れませんでした" }, 400);
    }
    const r = await fetch(ENDPOINT, {
      method: "POST",
      // User-Agent がないと Sarashina 側で 403 になる
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "User-Agent": "newspicks-viewer/1.0" },
      body: JSON.stringify({
        model: String(b.model || "sarashina3-mini"),
        messages: Array.isArray(b.messages) ? b.messages : [],
        max_completion_tokens: Math.min(Number(b.maxTokens) || 2000, 8000),
        temperature: Number(b.temperature ?? 0.3),
        ...(b.schema && { response_format: { type: "json_schema", json_schema: { name: b.name || "result", schema: b.schema, strict: true } } }),
      }),
    }).catch((e) => ({ ok: false, status: 0, error: e }));

    if (r.status === 429) {
      return json({ error: "混み合っています（1分あたりの回数制限）", retryAfter: Number(r.headers.get("retry-after")) || 60, retryable: true }, 429);
    }
    if (!r.ok) {
      const d = r.json ? await r.json().catch(() => ({})) : {};
      const msg = r.status === 401 ? "APIキーが正しくないか、使えなくなっています"
        : r.status === 403 ? "AI のサーバーに接続を断られました（403）"
        : `AIの呼び出しでエラーが起きました (${r.status}) ${d.error?.message || d.message || r.error?.message || ""}`.trim();
      return json({ error: `${msg}［${await where()}］`, retryable: r.status >= 500 || r.status === 0 }, 500);
    }
    const body = await r.json().catch(() => ({}));
    const choice = body.choices?.[0];
    if (choice?.finish_reason === "length") return json({ error: "AIの返事が長すぎて途中で切れました", retryable: true }, 500);
    return json({ text: choice?.message?.content || "" });
  },
};
