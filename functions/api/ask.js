// ふくろんに深掘り質問（Cloudflare Pages Functions）
//   { item, explanation, messages } → { answer, followups }
// ニュースは、その場で NewsPicks から本文を読んで答える（本文はどこにも保存しない）

import { handler, cleanItem } from "../../lib/cf-util.js";
import { askAbout } from "../../lib/ask.js";

export const onRequest = handler(async (body) => {
  const n = cleanItem(body.item);
  const e = body.explanation && typeof body.explanation === "object" ? body.explanation : null;
  return askAbout(n, e, body.messages);
}, { perMinute: 15, maxBytes: 40000 });
