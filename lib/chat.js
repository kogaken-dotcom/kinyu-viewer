// AIチャット：「知りたいこと」に合うニュースや動画を、ためてある全部の記事・動画から探して紹介する
//   1. AI（Sarashina nano）が、質問から検索キーワードを考える
//   2. アプリ側でキーワードに合う候補を30件まで探す
//   3. AI が候補の中から合うものを選び、ひとこと理由を付けて返事を書く
//   4. 同時に、質問そのものにもコーチ・マイクとして答える（候補の要点を参考にする）
// nano は1分に60回まで使えるので、解説づくり（mini・1分に6回）の順番待ちと取り合わない

// PC のサーバー用（ためてある記事を読む）。AI に頼む部分は chat-ai.js（Cloudflare と共通）

const { GENRES } = require("./genres");
const archive = require("./archive");
const explanations = require("./explanations");
const { CATEGORIES } = require("./sources");
const { MAX_CANDIDATES, cleanHistory, makeKeywords, choose, answerQuestion } = require("./chat-ai");

const genreLabel = (id) => GENRES.find((g) => g.id === id)?.label || "";

// すべてのカテゴリの記事・動画（重複なし）
function allItems() {
  const seen = new Map();
  for (const id of Object.keys(CATEGORIES)) for (const n of archive.list(id)) seen.set(String(n.id), n);
  return [...seen.values()];
}

// ---------- 2. 候補を探す ----------
const STOP = new Set([..."のをにがはでとてたいるもやかなしだですますこれそれあのこと"]);
function bigrams(text) {
  const t = text.replace(/[\s、。！？!?「」（）()・,.\-—]/g, "");
  const out = new Set();
  for (let i = 0; i < t.length - 1; i++) if (!STOP.has(t[i]) || !STOP.has(t[i + 1])) out.add(t.slice(i, i + 2));
  return out;
}

function search(query, keywords, kind, done) {
  const qGrams = bigrams(query);
  const scored = [];
  for (const n of allItems()) {
    if (kind === "video" && n.kind !== "video") continue;
    if (kind === "news" && n.kind === "video") continue;
    const e = done[n.id];
    const head = `${n.title} ${e?.oneLine || ""}`;
    const body = `${e?.simple || ""} ${(e?.terms || []).map((t) => t.term).join(" ")} ${(n.summary || "").slice(0, 400)} ${genreLabel(e?.genre)}`;
    let score = 0;
    for (const k of keywords) {
      if (n.title.includes(k)) score += 4;
      else if (head.includes(k)) score += 3;
      else if (body.includes(k)) score += 1;
    }
    let overlap = 0;
    for (const g of qGrams) if (head.includes(g)) overlap++;
    score += Math.min(overlap, 6) * 0.5;
    if (score <= 0) continue;
    const ageDays = (Date.now() - new Date(n.publishedAt)) / 86400000;
    score += Math.max(0, 1 - ageDays / 60) * 0.8; // 新しいものを少しだけ優先
    scored.push({ n, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES).map((x) => x.n);
}

// 会話（[{ role: "user" | "assistant", content }]）から、返事とおすすめの記事・動画を作る
async function answer(messages) {
  const history = cleanHistory(messages);
  const query = history.filter((m) => m.role === "user").at(-1)?.content || "";
  if (!query.trim()) return { reply: "知りたいことを入力してください。", picks: [] };

  const done = explanations.load();
  let kw = { keywords: [query], kind: "any" };
  try {
    const k = await makeKeywords(history);
    if (k.keywords.length) kw = { keywords: [...new Set([...k.keywords, query])], kind: k.kind };
  } catch (e) {
    if (/APIキー/.test(e.message)) throw e; // キーの問題は画面に伝える。それ以外は質問の言葉そのままで探す
  }
  const candidates = search(query, kw.keywords, kw.kind, done);
  const withSummary = candidates.map((n) => ({ ...n, oneLine: done[n.id]?.oneLine }));
  // 答えとおすすめ選びは、同時に頼む（待ち時間を短くする）
  const [ans, picked] = await Promise.all([
    answerQuestion(history, withSummary).catch((e) => {
      if (/APIキー/.test(e.message)) throw e;
      return "";
    }),
    candidates.length
      ? choose(history, withSummary).catch((e) => {
        if (/APIキー/.test(e.message)) throw e;
        // AI が選べなかったときは、検索で上位のものを出す
        return { reply: "関係がありそうな記事や動画を探しました。", picks: candidates.slice(0, 5).map((n, index) => ({ index, reason: "" })) };
      })
      : { reply: ans ? "" : "ごめんなさい、合いそうな記事や動画が見つかりませんでした。別の言葉で聞いてみてください。", picks: [] },
  ]);
  return { answer: ans, reply: picked.reply, picks: picked.picks.map((p) => ({ n: candidates[p.index], reason: p.reason })), keywords: kw.keywords };
}

module.exports = { answer };
