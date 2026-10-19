// その場で解説を作る（Cloudflare Pages Functions）
// 定期更新でまだ解説がない記事・古い動画を、開いたときに作る。結果は画面側（スマホ）に残す
//   { item } → 解説

import { handler, cleanItem } from "../../lib/cf-util.js";
import sarashina from "../../lib/sarashina.js";

export const onRequest = handler(async (body) => sarashina.explain(cleanItem(body.item)), { perMinute: 4, maxBytes: 5000 });
