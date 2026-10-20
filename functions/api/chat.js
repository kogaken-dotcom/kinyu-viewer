// ふくろんのチャット（Cloudflare Pages Functions）
//   { action: "keywords", messages }            → 検索キーワード
//   { action: "choose", messages, candidates }  → 候補から選んだものと返事
// 記事の検索そのものは、スマホの画面側で行う（サーバーの処理を軽くするため）

import { handler } from "../../lib/cf-util.js";
import { cleanHistory, makeKeywords, choose, MAX_CANDIDATES } from "../../lib/chat-ai.js";

export const onRequest = handler(async (body) => {
  const history = cleanHistory(body.messages);
  if (!history.length || history.at(-1).role !== "user") throw new Error("知りたいことを入力してください");
  if (body.action === "keywords") return makeKeywords(history);
  if (body.action === "choose") {
    const candidates = (Array.isArray(body.candidates) ? body.candidates : []).slice(0, MAX_CANDIDATES).map((n) => ({
      kind: n.kind === "video" ? "video" : "news",
      title: String(n.title || "").slice(0, 200),
      publisher: String(n.publisher || "").slice(0, 80),
      publishedAt: String(n.publishedAt || "").slice(0, 30),
      oneLine: n.oneLine ? String(n.oneLine).slice(0, 120) : null,
    }));
    if (!candidates.length) return { reply: "合いそうな記事や動画が見つかりませんでした。別の言葉で聞いてみてください。", picks: [] };
    return choose(history, candidates);
  }
  throw new Error("action が正しくありません");
}, { perMinute: 20, maxBytes: 30000 });
