// 「お客様のタイプ」の分け方（1つの記事に複数つくこともある）
// AI に任せると何にでも「投資家」が付いてしまったので、ジャンルとキーワードの決まったルールで分ける

const AUDIENCES = [
  { id: "household", label: "一般家庭", icon: "👪", hint: "くらし・家計・物価・ローン・給付など、ふつうの家庭に関係する" },
  { id: "senior", label: "シニア・老後", icon: "🧓", hint: "年金・老後資金・相続・医療など、50代以上の方に関係する" },
  { id: "investor", label: "投資家", icon: "💹", hint: "株・NISA・投資信託・相場など、投資をしている方に関係する" },
  { id: "owner", label: "経営者", icon: "🏢", hint: "事業承継・法人税・会社経営・業界の動きなど、経営者に関係する" },
];
const AUDIENCE_IDS = AUDIENCES.map((a) => a.id);

const RULES = {
  senior: /老後|年金|50代|60代|70代|70歳|シニア|定年|退職|相続|贈与|介護|75歳|高齢|終活/,
  owner: /事業承継|法人税|経営者|中小企業|非上場|起業|M&A|買収|決算|業績|賃上げ|人手不足/,
  investor: /株価|株式|投資|NISA|ＮＩＳＡ|銘柄|相場|為替|円安|円高|債券|投資信託|オルカン|S&P|配当|日経平均|IPO|上場|暴落/,
  household: /家計|物価|値上げ|ローン|給付|預金|保険|キャッシュレス|本人確認|節約|貯金|税|医療|子育て|教育費|生活/,
};

// ジャンルごとの基本の相手
const BY_GENRE = {
  policy: ["household", "investor"],
  market: ["investor"],
  invest: ["investor"],
  life: ["household"],
  finance: ["household"],
  company: ["investor", "owner"],
  world: ["household"],
};

function audiencesFor(n, e, genre) {
  // 動画の概要欄は宣伝やチャンネル紹介が多いので使わない
  const text = `${n.title} ${n.kind === "video" ? "" : n.summary || ""} ${e?.oneLine || ""} ${e?.impact || ""}`;
  const set = new Set(BY_GENRE[genre] || ["household"]);
  for (const [id, re] of Object.entries(RULES)) if (re.test(text)) set.add(id);
  return AUDIENCE_IDS.filter((id) => set.has(id));
}

module.exports = { AUDIENCES, AUDIENCE_IDS, audiencesFor };
