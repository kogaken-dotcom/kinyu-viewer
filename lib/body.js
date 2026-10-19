// 記事の本文と、NewsPicks の注目コメントを取ってくる（くわしい要約や深掘り質問の材料にする）
// - 提携媒体の記事（ロイター・ブルームバーグなど）は NewsPicks の本文ページに全文がある
// - 媒体のサイトへ移動する記事は、そのページの段落を拾う（取れないこともある）
// - 有料記事などで本文が取れないときは null（タイトルと冒頭だけで要約する）

const MAX_BODY = 5000;     // AI に渡す本文の長さの上限（文字）
const MAX_COMMENTS = 3;
const cache = new Map();   // 記事ID → { at, value }（同じ記事を何度も取りに行かない）
const CACHE_MS = 6 * 3600 * 1000;

const clean = (html) =>
  html
    .replace(/<(script|style|noscript|figure|figcaption|aside|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t　]+/g, " ")
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");

const japanese = (t) => (t.match(/[ぁ-んァ-ン一-龥]/g) || []).length;

// 媒体のサイトのページから、本文らしい段落だけを拾う
function fromPublisherPage(html) {
  const area = html.match(/<article[\s\S]*?<\/article>/i)?.[0] || html;
  const paras = [...area.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => clean(m[1]))
    .filter((t) => japanese(t) >= 25 && !/Copyright|著作権|無断転載|会員登録|ログイン|クッキー|Cookie/.test(t));
  return paras.join("\n");
}

async function fetchBody(n) {
  if (n.kind === "video") return null;
  const hit = cache.get(String(n.id));
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  let value = null;
  try {
    const res = await fetch(`https://newspicks.com/news/${n.id}/body/`, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (personal news viewer)", "Accept-Language": "ja" },
      signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    let text = "";
    let comments = [];
    if (new URL(res.url).host.endsWith("newspicks.com")) {
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (m) {
        const props = JSON.parse(m[1]).props?.pageProps || {};
        text = clean(props.newsBodyFragment?.body || "");
        // 1行目はタイトルと媒体名のことが多いので、タイトルと同じ行は除く
        text = text.split("\n").filter((l) => l !== n.title && l !== n.publisher).join("\n");
        comments = (props.topComments || [])
          .map((c) => clean(String(c.text || "")))
          .filter((t) => japanese(t) >= 30)
          .slice(0, MAX_COMMENTS)
          .map((t) => t.slice(0, 400));
      }
    } else {
      text = fromPublisherPage(html);
    }
    if (japanese(text) >= 150) value = { text: text.slice(0, MAX_BODY), comments };
    else if (comments.length) value = { text: "", comments };
  } catch {
    value = null;
  }
  cache.set(String(n.id), { at: Date.now(), value });
  return value;
}

module.exports = { fetchBody };
