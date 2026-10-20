// ジャンル（テーマ）の分け方
// 解説を作るとき AI がジャンルを決める。解説がまだないものはキーワードで仮に振り分ける。
// 以前のジャンル（tax / economy）で保存された解説は、表示するときに新しいジャンルへ読みかえる。

const GENRES = [
  { id: "policy", label: "金利・物価", icon: "🏦", hint: "日銀・FRB・利上げ・インフレ・物価",
    keywords: ["日銀", "FRB", "利上げ", "利下げ", "金利", "物価", "インフレ", "デフレ", "中銀", "中央銀行", "総裁", "消費者物価"] },
  { id: "market", label: "株・マーケット", icon: "📈", hint: "株価・相場・為替・銘柄・市場の動き",
    keywords: ["株価", "株式市場", "相場", "銘柄", "日経平均", "為替", "円安", "円高", "暴落", "急落", "上場", "IPO", "株"] },
  { id: "invest", label: "資産運用・NISA", icon: "🌱", hint: "NISA・投資信託・積立・資産形成・ポートフォリオ",
    keywords: ["NISA", "ＮＩＳＡ", "投資信託", "インデックス", "オルカン", "S&P", "Ｓ＆Ｐ", "積立", "積み立て", "資産形成", "資産運用", "高配当", "ポートフォリオ", "ゴールド", "債券", "億り人", "富裕層"] },
  { id: "life", label: "家計・税・老後", icon: "🏠", hint: "家計・年金・税金・医療・給付・制度の変更",
    keywords: ["家計", "年金", "老後", "税", "医療", "介護", "給付", "制度", "相続", "贈与", "貯金", "節約", "キャッシュレス", "住宅ローン", "定年"] },
  { id: "finance", label: "銀行・保険", icon: "🏛", hint: "銀行・保険会社・証券会社・金融庁",
    keywords: ["銀行", "金融庁", "保険", "生命", "証券会社", "FG", "信金", "本人確認", "口座"] },
  { id: "company", label: "企業・テクノロジー", icon: "🚀", hint: "企業の動き・買収・AI・新しい技術",
    keywords: ["買収", "AI", "ＡＩ", "決算", "CEO", "社長", "企業", "半導体", "エヌビディア", "テスラ", "アップル"] },
  { id: "world", label: "景気・世界情勢", icon: "🌏", hint: "景気・GDP・財政・国際情勢・政治・地政学",
    keywords: ["GDP", "ＧＤＰ", "景気", "財政", "IMF", "ＩＭＦ", "中国", "アメリカ", "米国", "ロシア", "北朝鮮", "台湾", "戦争", "選挙", "トランプ", "政権", "世界", "日本経済"] },
];
const GENRE_IDS = GENRES.map((g) => g.id);

const INVEST_RE = /NISA|ＮＩＳＡ|投資信託|インデックス|オルカン|S&P|Ｓ＆Ｐ|積立|積み立て|資産形成|資産運用|高配当|ポートフォリオ|億り人/;

// 動画の概要欄は宣伝やチャンネル紹介が多いので使わず、タイトルと AI の要約だけを見る
const textOf = (n, e) => `${n.title} ${n.kind === "video" ? "" : n.summary || ""} ${e?.oneLine || ""}`;

// 仮の振り分けで見る順番（「資産運用・NISA」を「株・マーケット」より先に見る）
const GUESS_ORDER = ["invest", "policy", "life", "finance", "market", "company", "world"];

// 解説がまだない記事を、タイトルと冒頭文のキーワードで仮に振り分ける（上のジャンルから順に見る）
function guessGenre(n, e) {
  const text = textOf(n, e);
  for (const id of GUESS_ORDER) if (GENRES.find((g) => g.id === id).keywords.some((k) => text.includes(k))) return id;
  return "world";
}

// AI が決めたジャンル（古い分け方のものも含む）を、今のジャンルにそろえる
function normalizeGenre(id, n, e) {
  const text = textOf(n, e);
  if (id === "tax") id = "life";
  if (id === "economy") id = "world";
  // 「資産運用・NISA」は新しく作ったジャンルなので、古い解説は中身を見て振り分け直す
  if ((id === "life" || id === "market") && INVEST_RE.test(text)) id = "invest";
  return GENRE_IDS.includes(id) ? id : guessGenre(n, e);
}

module.exports = { GENRES, GENRE_IDS, guessGenre, normalizeGenre };
