// 解説を作る順番待ちの列
// Sarashina mini は1分に6回までなので、11秒に1件ずつ順番に作る。
// 金融・経済の記事や YouTube 動画は、アプリが動いている間に自動で解説し、
// 画面で「その場で解説」を押した記事は列の先頭に割り込ませる。

const archive = require("./archive");
const { CATEGORIES } = require("./sources");
const explanations = require("./explanations");
const sarashina = require("./sarashina");

const INTERVAL_MS = 11 * 1000;

const queue = []; // { article, waiters: [{ resolve, reject }] }
let running = false;
let lastCallAt = 0;
let lastError = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function saveOne(id, explanation) {
  const all = explanations.load();
  all[id] = explanation;
  explanations.save(all);
}

let stopAt = Infinity; // runUntil で決めた終わりの時刻（GitHub Actions 用）
let madeCount = 0;

async function work() {
  if (running) return;
  running = true;
  while (queue.length && Date.now() < stopAt - INTERVAL_MS) {
    const wait = lastCallAt + INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    const job = queue[0];
    lastCallAt = Date.now();
    try {
      const ex = await sarashina.explain(job.article);
      saveOne(job.article.id, ex);
      madeCount++;
      lastError = null;
      queue.shift();
      job.waiters.forEach((w) => w.resolve(ex));
    } catch (e) {
      if (e.retryAfter) {
        // 回数制限: 少し待ってから同じ記事をやり直す
        lastCallAt = Date.now() + e.retryAfter * 1000 - INTERVAL_MS;
        continue;
      }
      lastError = e.message;
      queue.shift();
      job.waiters.forEach((w) => w.reject(e));
      // キーの問題などは続けても失敗するので、自動の分は止める
      if (!sarashina.hasKey() || /APIキー/.test(e.message)) {
        for (const j of queue.splice(0)) j.waiters.forEach((w) => w.reject(e));
      }
    }
  }
  running = false;
}

// 自動解説: 自動解説の対象（lib/sources.js の autoExplain）の記事を、次の順番で列に並べる
//   0. 解説がないニュース
//   1. 要点（points）がない古い形式のニュースの解説（本文を読んだ具体的な解説に作り直す）
//   2. 解説がない動画（過去の動画がたくさんあっても、ニュースを待たせない）
//   3. 作り直し（以前の Claude の解説）
// それぞれの中では新しいものから。作り直すまでは古い解説をそのまま表示する
// 動画は、公開から1年以内のものだけ自動で解説する（チャンネルによっては数千本あるため）。
// それより古い動画は、画面で開いたときにその場で作る
const VIDEO_AUTO_DAYS = 365;

function priority(n, done) {
  const e = done[n.id];
  if (!e && n.kind === "video" && Date.now() - new Date(n.publishedAt) > VIDEO_AUTO_DAYS * 86400000) return -1;
  if (!e) return n.kind === "video" ? 2 : 0;
  if (n.kind !== "video" && !e.points) return 1;
  if (e.source !== "sarashina") return 3;
  return -1; // 作る必要なし
}

function enqueuePending() {
  if (!sarashina.hasKey() || (lastError && /APIキー/.test(lastError))) return;
  const done = explanations.load();
  const articles = Object.entries(CATEGORIES)
    .filter(([, c]) => c.autoExplain)
    .flatMap(([id]) => archive.list(id));
  for (const n of articles) {
    if (priority(n, done) >= 0 && !queue.some((j) => j.article.id === n.id)) queue.push({ article: n, waiters: [] });
  }
  // 並べ直す（作成中の先頭と、画面から頼まれた記事はそのまま前に残す）
  const keep = queue.filter((j, i) => (running && i === 0) || j.waiters.length);
  const rest = queue
    .filter((j) => !keep.includes(j) && priority(j.article, done) >= 0)
    .sort((a, b) => priority(a.article, done) - priority(b.article, done) || new Date(b.article.publishedAt) - new Date(a.article.publishedAt));
  queue.splice(0, queue.length, ...keep, ...rest);
  work();
}

// 画面からの依頼: 列の先頭に入れて、できあがるまで待つ
function request(article) {
  const done = explanations.load()[article.id];
  if (done) return Promise.resolve(done);
  return new Promise((resolve, reject) => {
    let job = queue.find((j) => j.article.id === article.id);
    if (job && running && job === queue[0]) {
      job.waiters.push({ resolve, reject }); // すでに作成中
      return;
    }
    if (job) queue.splice(queue.indexOf(job), 1);
    else job = { article, waiters: [] };
    job.waiters.push({ resolve, reject });
    // 先頭が処理中のこともあるので、2番目に入れる（処理中でなければ先頭と同じ）
    queue.splice(running && queue.length ? 1 : 0, 0, job);
    work();
  });
}

function status() {
  return { enabled: sarashina.hasKey(), model: sarashina.MODEL, queued: queue.length, lastError };
}

// 決めた時刻まで解説を作り続けて止める（GitHub Actions で決まった時間だけ動かす用）
async function runUntil(deadline) {
  stopAt = deadline;
  madeCount = 0;
  enqueuePending();
  while (running && Date.now() < deadline + 60000) await sleep(1000);
  stopAt = Infinity;
  return { made: madeCount, remaining: queue.length, lastError };
}

module.exports = { enqueuePending, request, status, runUntil };
