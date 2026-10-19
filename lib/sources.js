// 記事の取得元（画面の「カテゴリ」）の一覧
// autoExplain: アプリの起動中に、まだ解説がない記事を自動で解説する

const { fetchNewsPicks } = require("./newspicks");
const { fetchChannel, fetchAllUploads } = require("./youtube");
const jsonfile = require("./jsonfile");

// 全動画を最後に取った時刻は data/state.json に残す（GitHub Actions は毎回まっさらな状態で動くため）
const lastFullOf = (id) => jsonfile.read("state.json", {}).lastFull?.[id] || 0;
function saveLastFull(id, at) {
  const st = jsonfile.read("state.json", {});
  st.lastFull = { ...(st.lastFull || {}), [id]: at };
  jsonfile.write("state.json", st);
}

// YouTube チャンネル: APIキーがあれば1日1回すべての動画を取得し、それ以外は RSS で新着だけ取得する
function youtubeSource(channelId) {
  const state = { note: null };
  return {
    state,
    async fetch() {
      const key = process.env.YOUTUBE_API_KEY;
      if (!key) {
        state.note = "過去の動画も全部表示するには、.env に YOUTUBE_API_KEY を設定してください（今は新着15本ずつ集めています）";
        return fetchChannel(channelId);
      }
      if (Date.now() - lastFullOf(channelId) > 24 * 3600 * 1000) {
        try {
          const all = await fetchAllUploads(channelId, key);
          saveLastFull(channelId, Date.now());
          state.note = null;
          return all;
        } catch (e) {
          state.note = `過去の動画の取得に失敗しました：${e.message}（新着だけ表示しています）`;
        }
      }
      return fetchChannel(channelId);
    },
  };
}
const ochan = youtubeSource("UC4Ub-Y_yj43aouqFbA7PwhQ"); // @o-chan_goldman
const suasi = youtubeSource("UCNJRaN9NIAbCXpDa_hAKd3g"); // @suasi_shacho
const horie = youtubeSource("UCXjTiSGclQLVVU83GVrRM4w"); // @takaponjp
const nakata = youtubeSource("UCFo4kqllbcQ4nV83WCyraiw"); // @NKTofficial

const CATEGORIES = {
  market: { label: "金融・経済", autoExplain: true, fetch: () => fetchNewsPicks("https://newspicks.com/theme-news/market/") },
  top: { label: "NewsPicks トップ", autoExplain: false, fetch: () => fetchNewsPicks("https://newspicks.com/") },
  "yt-ochan": { label: "YouTube：おーちゃん【元外銀マン】", autoExplain: true, fetch: () => ochan.fetch(), note: () => ochan.state.note },
  "yt-suasi": { label: "YouTube：大人の学び直しTV", autoExplain: true, fetch: () => suasi.fetch(), note: () => suasi.state.note },
  "yt-horie": { label: "YouTube：堀江貴文 ホリエモン", autoExplain: true, fetch: () => horie.fetch(), note: () => horie.state.note },
  "yt-nakata": { label: "YouTube：中田敦彦のYouTube大学", autoExplain: true, fetch: () => nakata.fetch(), note: () => nakata.state.note },
};
const DEFAULT_CATEGORY = "market";

const fetchNews = (category) => CATEGORIES[category].fetch();

module.exports = { CATEGORIES, DEFAULT_CATEGORY, fetchNews };
