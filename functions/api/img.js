// 記事・動画の画像を取り寄せる（Cloudflare Pages Functions）
// ほかのサイトの画像はそのままだと画面の中で画像に描き込めないので、ここを通す
//   GET /api/img?u=画像のアドレス（決まった場所の画像だけ）

import { isAllowedImage } from "../../lib/story-ai.js";

const MAX_BYTES = 8 * 1024 * 1024;

export async function onRequest({ request }) {
  const u = new URL(request.url).searchParams.get("u") || "";
  if (request.method !== "GET" || !isAllowedImage(u)) return new Response("not allowed", { status: 400 });
  // 別の場所へ飛ばされても追わない（Cloudflare では redirect: "error" が使えない）
  const res = await fetch(u, { redirect: "manual" }).catch(() => null);
  const type = res?.headers.get("content-type") || "";
  if (!res?.ok || !type.startsWith("image/")) return new Response("not found", { status: 404 });
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response("too large", { status: 413 });
  return new Response(body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
}
