// 共有リンク（Cloudflare Pages Functions）
//   /s/記事ID → LINE などに貼ったときに、記事のタイトル・要点・写真が出るページを返し、アプリのその記事の解説へ移る
// 記事の情報は、build-site.js が作る data/og/番号.json（128個に分けた小さいファイル）から読む

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 記事ID → ファイルの番号（画面・build-site.js と同じ計算）
function bucketOf(id, n) {
  let h = 5381;
  for (const ch of String(id)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h % n;
}

export async function onRequest({ params, request, env }) {
  const id = String(params.id || "");
  const home = new URL("/", request.url);
  if (!/^(\d{1,12}|yt-[\w-]{6,20}|pv-\d{1,9})$/.test(id)) return Response.redirect(home.toString(), 302);
  const target = new URL(`/?a=${encodeURIComponent(id)}`, request.url).toString();

  let n = null;
  try {
    const meta = await (await env.ASSETS.fetch(new URL("/data/meta.json", request.url))).json();
    const og = await (await env.ASSETS.fetch(new URL(`/data/og/${bucketOf(id, meta.buckets)}.json`, request.url))).json();
    n = og[id] || null;
  } catch {}

  const title = n ? `${n.t}｜Finsight` : "Finsight｜ニュースから、気づきを。";
  const desc = n?.o || "金融ニュースと動画を、AI がやさしく解説します。";
  const html = `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Finsight">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(request.url)}">
${n?.i ? `<meta property="og:image" content="${esc(n.i)}">` : ""}
<meta name="twitter:card" content="${n?.i ? "summary_large_image" : "summary"}">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f6f4ef;color:#14213d;display:grid;place-items:center;min-height:100vh}a{color:#1e3a5f}</style>
</head><body>
<p>解説を開いています… <a href="${esc(target)}">開かないときはこちら</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
