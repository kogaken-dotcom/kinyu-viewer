// 日本とアメリカの金利（公的機関が公開しているデータ。APIキー不要）
// - 日本の政策金利の目安: 日本銀行「時系列統計データ」API の無担保コール翌日物（日次）
// - 日本の国債金利: 財務省「国債金利情報」CSV（日次）
// - アメリカの政策金利: FRED（セントルイス連銀）の FF 金利誘導目標の上限・下限（日次）
// - アメリカの国債金利: FRED の 2年・10年国債利回り（日次）
// どれも1日1回の更新（取引時間中の動きではない）。30分ごとに取り直す。

const CACHE_MS = 30 * 60 * 1000;
const DAYS = 45; // グラフに使う日数
let cache = { at: 0, data: null };

async function getText(url, encoding = "utf-8") {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (personal news viewer)" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${new URL(url).host} から取得できませんでした (HTTP ${res.status})`);
  return new TextDecoder(encoding).decode(await res.arrayBuffer());
}

const since = () => new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);

// FRED の CSV（DATE,VALUE）→ [{ date, value }]
async function fred(id) {
  const csv = await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${since()}`);
  return csv.trim().split("\n").slice(1)
    .map((l) => l.split(","))
    .filter(([, v]) => v && v !== "." && !isNaN(Number(v)))
    .map(([d, v]) => ({ date: d, value: Number(v) }));
}

// 日本銀行 API → [{ date, value }]
async function boj(db, code) {
  const start = since().slice(0, 7).replace("-", "");
  const json = JSON.parse(await getText(`https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=jp&db=${db}&code=${code}&startDate=${start}`));
  const v = json.RESULTSET?.[0]?.VALUES;
  if (!v) throw new Error("日本銀行のデータを読み取れませんでした");
  return v.SURVEY_DATES.map((d, i) => ({ date: `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`, value: v.VALUES[i] }))
    .filter((x) => x.value != null);
}

// 財務省の国債金利 CSV（Shift_JIS、日付は「R8.10.15」の和暦）→ { "2年": [...], "10年": [...] }
async function mofJgb() {
  const parse = (csv) => {
    const lines = csv.split(/\r?\n/);
    const head = lines.find((l) => l.startsWith("基準日"))?.split(",") || [];
    const col = (name) => head.indexOf(name);
    const rows = [];
    for (const l of lines) {
      const m = l.match(/^R(\d+)\.(\d+)\.(\d+),/);
      if (!m) continue;
      const cells = l.split(",");
      const date = `${2018 + Number(m[1])}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      rows.push({ date, y2: Number(cells[col("2年")]), y10: Number(cells[col("10年")]) });
    }
    return rows;
  };
  // 今月分のファイルと、先月までの全部のファイル（大きいので先月分の確認にだけ使う）
  const [now, all] = await Promise.all([
    getText("https://www.mof.go.jp/jgbs/reference/interest_rate/jgbcm.csv", "shift_jis"),
    getText("https://www.mof.go.jp/jgbs/reference/interest_rate/data/jgbcm_all.csv", "shift_jis"),
  ]);
  const byDate = new Map();
  for (const r of [...parse(all), ...parse(now)]) byDate.set(r.date, r);
  const rows = [...byDate.values()].filter((r) => r.date >= since()).sort((a, b) => a.date.localeCompare(b.date));
  return {
    y2: rows.filter((r) => !isNaN(r.y2)).map((r) => ({ date: r.date, value: r.y2 })),
    y10: rows.filter((r) => !isNaN(r.y10)).map((r) => ({ date: r.date, value: r.y10 })),
  };
}

// 最新値・前回との差・グラフ用の値をまとめる
function summarize(series) {
  if (!series?.length) return null;
  const last = series.at(-1);
  const prev = series.at(-2);
  return {
    value: last.value,
    date: last.date,
    change: prev ? Math.round((last.value - prev.value) * 1000) / 1000 : null,
    history: series.map((x) => x.value),
  };
}

async function settle(p) {
  try { return { ok: await p }; } catch (e) { return { error: e.message }; }
}

async function getRates(force) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const [call, jgb, us10, us2, ffU, ffL] = await Promise.all([
    settle(boj("FM01", "STRDCLUCON")),
    settle(mofJgb()),
    settle(fred("DGS10")),
    settle(fred("DGS2")),
    settle(fred("DFEDTARU")),
    settle(fred("DFEDTARL")),
  ]);
  const errors = [call, jgb, us10, us2, ffU, ffL].filter((x) => x.error).map((x) => x.error);
  const upper = summarize(ffU.ok);
  const lower = summarize(ffL.ok);
  const data = {
    fetchedAt: new Date().toISOString(),
    jp: {
      policy: summarize(call.ok) && { ...summarize(call.ok), label: "政策金利（無担保コール翌日物）" },
      y2: summarize(jgb.ok?.y2),
      y10: summarize(jgb.ok?.y10),
    },
    us: {
      policy: upper && lower ? { ...upper, lower: lower.value, upper: upper.value, label: "政策金利（FF金利 誘導目標）" } : null,
      y2: summarize(us2.ok),
      y10: summarize(us10.ok),
    },
    errors: [...new Set(errors)],
  };
  // 一部だけ失敗したときは、前回うまく取れた値を残す
  if (cache.data) {
    for (const c of ["jp", "us"]) for (const k of Object.keys(data[c])) data[c][k] ??= cache.data[c][k];
  }
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { getRates };
