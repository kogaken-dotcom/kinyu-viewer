// インスタのストーリー用の文章を作る（Cloudflare Pages Functions）
//   { item, explanation } → { hook, lines }

import { handler, cleanItem } from "../../lib/cf-util.js";
import { storyCopy } from "../../lib/story-ai.js";

export const onRequest = handler(async (body) => {
  const e = body.explanation && typeof body.explanation === "object" ? body.explanation : null;
  return storyCopy(cleanItem(body.item), e);
}, { perMinute: 15, maxBytes: 20000 });
