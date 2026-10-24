// その場で解説を作る（Cloudflare Pages Functions）
// 定期更新でまだ解説がない記事・古い動画を、開いたときに作る。結果は画面側（スマホ）に残す
// 待たせないように、速い nano（数秒）で作る。定期更新で mini の解説ができたら、そちらが優先して表示される
//   { item } → 解説

import { handler, cleanItem } from "../../lib/cf-util.js";
import sarashina from "../../lib/sarashina.js";

export const onRequest = handler(async (body) => ({ ...(await sarashina.explain(cleanItem(body.item), { model: sarashina.CHAT_MODEL })), quick: true }), { perMinute: 10, maxBytes: 5000 });
