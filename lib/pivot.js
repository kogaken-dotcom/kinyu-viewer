// PIVOT（https://pivotmedia.co.jp/ ・ビジネス映像メディア）の動画を取得する
// サイトの「サイトマップ」（検索エンジン向けの、全エピソードの一覧。1ページ50本・新しい順）を読む。
// タイトル・説明文・目次・サムネイル・公開日が入っているので、YouTube と同じ「動画」として扱う。
// PIVOT は健康・スポーツ・キャリアなども扱うので、お金・経済に関係するものだけを残す

const SITEMAP = "https://pivotmedia.co.jp/sitemap-episode.xml";

const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1].trim()) : "";
};

// お金・経済に関係する動画か（タイトルと、説明文の最初の段落で判断する。ゲスト紹介や目次は見ない）
const FINANCE = /経済|金融|金利|日銀|FRB|株価|株式|日本株|米国株|投資|資産|NISA|iDeCo|年金|税|為替|円安|円高|ドル|インフレ|物価|景気|GDP|財政|国債|債券|マーケット|相場|決算|銀行|保険|証券|不動産|住宅|ローン|お金|マネー|富裕層|貯金|貯蓄|節約|家計|賃金|賃上げ|年収|老後|相続|仮想通貨|暗号資産|ビットコイン|ファンド|ファイナンス|会計|M&A|買収|関税|貿易|中央銀行|ECB|利上げ|利下げ|バブル|リセッション|クレカ|クレジットカード|キャッシュレス|IPO|上場/;

async function getXml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (personal news viewer)", "Accept-Language": "ja" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`PIVOT から取得できませんでした (HTTP ${res.status})`);
  return res.text();
}

function parse(xml) {
  const out = [];
  for (const block of xml.split("<url>").slice(1)) {
    if (!block.includes("<video:video>")) continue; // 「/article」など、動画でないページは飛ばす
    const url = tag(block, "loc");
    const id = (url.match(/\/movie\/(\d+)$/) || [])[1];
    const title = tag(block, "video:title");
    if (!id || !title) continue;
    const description = tag(block, "video:description");
    const lead = description.split(/＜ゲスト＞|＜目次＞|＜出演者＞/)[0];
    if (!FINANCE.test(`${title} ${lead}`)) continue;
    out.push({
      id: `pv-${id}`,
      kind: "video",
      title,
      // 「サムネイル 写真：〜」などの注記は除く（AI に渡す材料・検索用）
      summary: description.replace(/\n*サムネイル[\s\S]*$/, "").slice(0, 1200),
      image: tag(block, "video:thumbnail_loc"),
      publisher: "PIVOT",
      publishedAt: new Date(tag(block, "video:publication_date") || tag(block, "lastmod")).toISOString(),
      pickCount: null,
      views: null,
      paid: false,
      url,
    });
  }
  return out;
}

// all = true のときは全ページ（100ページ以上ある）、false のときは1ページ目（新着50本）だけ読む
async function fetchPivot({ all = false } = {}) {
  let pages = [1];
  if (all) {
    const index = await getXml(SITEMAP);
    const n = (index.match(/<loc>/g) || []).length;
    pages = Array.from({ length: Math.max(n, 1) }, (_, i) => i + 1);
  }
  const items = [];
  // サイトに負担をかけないよう、3ページずつ読む
  for (let i = 0; i < pages.length; i += 3) {
    const chunk = await Promise.all(pages.slice(i, i + 3).map((p) => getXml(`${SITEMAP}?page=${p}`).then(parse)));
    items.push(...chunk.flat());
  }
  return items;
}

module.exports = { fetchPivot };
