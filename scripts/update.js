// 定期更新（GitHub Actions で2時間ごとに動く。PC で試すときは npm run update）
//   1. NewsPicks と YouTube から記事・動画を集めて data/articles.json にためる
//   2. 日米の金利を取る
//   3. 決めた時間（AI_MINUTES 分）だけ、AI の解説を作る（ニュースが先、動画はあと）
//   4. 今日のおすすめ5選を選ぶ
// 必要な環境変数: SARASHINA_API_KEY（AI 解説）、YOUTUBE_API_KEY（過去の動画を全部取る。なくても新着だけは取れる）

const { CATEGORIES, fetchNews } = require("../lib/sources");
const archive = require("../lib/archive");
const explainer = require("../lib/explainer");
const sarashina = require("../lib/sarashina");
const jsonfile = require("../lib/jsonfile");
const { getRates } = require("../lib/rates");
const { getPicks } = require("../lib/picks");

const AI_MINUTES = Number(process.env.AI_MINUTES || 4);

(async () => {
  const started = Date.now();
  const notes = {};
  let aiError = null; // AI がうまく動かなかったときの理由（data/state.json に残して、あとで確認できるようにする）

  for (const [id, c] of Object.entries(CATEGORIES)) {
    try {
      const items = await fetchNews(id);
      archive.merge(id, items);
      console.log(`取得: ${c.label} ${items.length}件（ためている数 ${archive.list(id).length}件）`);
    } catch (e) {
      console.error(`取得に失敗: ${c.label}: ${e.message}`);
      notes[id] = `最新の取得に失敗しました（${e.message}）`;
    }
    const note = c.note?.();
    if (note) notes[id] = note;
  }

  try {
    jsonfile.write("rates.json", await getRates(true));
    console.log("金利を更新しました");
  } catch (e) {
    console.error("金利の取得に失敗:", e.message);
  }

  if (sarashina.hasKey()) {
    const r = await explainer.runUntil(Date.now() + AI_MINUTES * 60000);
    console.log(`AI 解説: ${r.made}件 作成（残り ${r.remaining}件）${r.lastError ? ` 最後のエラー: ${r.lastError}` : ""}`);
    if (!r.made && r.lastError) aiError = r.lastError;
    try {
      const p = await getPicks();
      console.log(`おすすめ5選: ${p.picks.length}件（${p.byAi ? "AI が選定" : "注目度順"}）${p.error ? ` エラー: ${p.error}` : ""}`);
      if (p.error) aiError ??= p.error;
    } catch (e) {
      console.error("おすすめ5選に失敗:", e.message);
      aiError ??= e.message;
    }
  } else {
    console.log("SARASHINA_API_KEY がないため、AI 解説とおすすめ5選は作りません");
  }

  const st = jsonfile.read("state.json", {});
  st.updatedAt = new Date().toISOString();
  st.notes = notes;
  st.aiError = aiError;
  jsonfile.write("state.json", st);
  console.log(`完了（${Math.round((Date.now() - started) / 1000)}秒）`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
