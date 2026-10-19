// NewsPicks のページから記事一覧を取得する

// 広告・タイアップ記事は除外
function isPromotion(o) {
  const pub = o.publisher || "";
  return !!(o.adId || o.sponsorName || pub.startsWith("PR:") || pub.includes("Brand Design"));
}

// ページに埋め込まれた Next.js のデータ(__NEXT_DATA__)から記事を抽出
function extractNews(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("ページ構造が変わった可能性があります（__NEXT_DATA__ が見つかりません）");
  const data = JSON.parse(m[1]);
  // テーマページはメイン/サブフィードだけを対象にする（横の関連記事欄は別カテゴリが混ざるため）
  const feed = data.props?.pageProps?.themeNewsPage?.themeNewsV2;
  const root = feed ? [feed.categoryMainFeed, feed.categorySubFeed] : data;
  const found = new Map();
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") {
      if (o.__typename === "News" && o.newsId && o.title && !isPromotion(o)) {
        found.set(o.newsId, {
          id: o.newsId,
          title: o.title,
          summary: o.summary || "",
          image: o.image || "",
          publisher: o.publisher || "",
          publishedAt: o.publishedAt,
          pickCount: o.pickCount ?? null,
          paid: !!o.paid,
          url: `https://newspicks.com/news/${o.newsId}/`,
        });
      }
      Object.values(o).forEach(walk);
    }
  })(root);
  return [...found.values()];
}

async function fetchNewsPicks(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (personal NewsPicks viewer)", "Accept-Language": "ja" },
  });
  if (!res.ok) throw new Error(`NewsPicks から取得できませんでした (HTTP ${res.status})`);
  const items = extractNews(await res.text());
  items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return items;
}

module.exports = { fetchNewsPicks };
