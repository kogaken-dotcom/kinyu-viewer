// YouTube チャンネルの動画を取得する
// - fetchChannel: 公開されている RSS フィード（APIキー不要。最新15本まで）
// - fetchAllUploads: YouTube Data API v3 で過去の動画を全部（.env の YOUTUBE_API_KEY が必要。無料枠で足りる）

const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1].trim()) : "";
};

// 概要欄から宣伝リンクなどを除き、目次や説明文だけを残す（AIに渡す材料・検索用）
function cleanDescription(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/https?:\/\//.test(l) && !/^[↓🔻▼#＃※]+/.test(l) &&
      !/(インスタ|Instagram|^X$|尾崎X|Amazon|申し込み|申込|LINE|お問い合わせ|メンバーシップ|勉強会|講座|限定|抽選|マネトレ|告知|購入リンク)/i.test(l))
    .join("\n")
    .slice(0, 1200);
}

async function fetchChannel(channelId) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (personal news viewer)" },
  });
  if (!res.ok) throw new Error(`YouTube から取得できませんでした (HTTP ${res.status})`);
  const xml = await res.text();
  const channel = tag(xml.split("<entry>")[0], "title");
  return xml.split("<entry>").slice(1).map((e) => {
    const videoId = tag(e, "yt:videoId");
    const views = e.match(/<media:statistics views="(\d+)"/);
    return {
      id: `yt-${videoId}`,
      kind: "video",
      title: tag(e, "title"),
      summary: cleanDescription(tag(e, "media:description")),
      image: (e.match(/<media:thumbnail url="([^"]+)"/) || [])[1] || "",
      publisher: channel,
      publishedAt: new Date(tag(e, "published")).toISOString(),
      pickCount: null,
      views: views ? Number(views[1]) : null,
      paid: false,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }).filter((v) => v.title && v.id !== "yt-");
}

const API = "https://www.googleapis.com/youtube/v3";

async function api(path, params, key) {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key })}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body.error?.errors?.[0]?.reason || "";
    if (/keyInvalid|API_KEY_INVALID/.test(reason + JSON.stringify(body.error?.details || ""))) throw new Error("YouTube の APIキーが正しくありません");
    if (/accessNotConfigured|SERVICE_DISABLED/.test(reason + JSON.stringify(body.error?.details || ""))) throw new Error("Google Cloud で「YouTube Data API v3」が有効になっていません");
    if (/quotaExceeded/.test(reason)) throw new Error("YouTube API の1日の上限に達しました（明日また取得します）");
    throw new Error(`YouTube API でエラーが起きました (${res.status}) ${body.error?.message || ""}`.trim());
  }
  return body;
}

// チャンネルにアップロードされた動画を全部取得する（50本ずつ）
async function fetchAllUploads(channelId, key) {
  const playlistId = "UU" + channelId.slice(2); // チャンネルの「アップロード動画」再生リスト
  const videos = [];
  let pageToken = "";
  do {
    const page = await api("playlistItems", { part: "snippet,contentDetails", playlistId, maxResults: 50, ...(pageToken && { pageToken }) }, key);
    for (const it of page.items || []) {
      const sn = it.snippet || {};
      const videoId = it.contentDetails?.videoId || sn.resourceId?.videoId;
      if (!videoId || /^(Private|Deleted) video$/.test(sn.title)) continue;
      const th = sn.thumbnails || {};
      videos.push({
        id: `yt-${videoId}`,
        kind: "video",
        title: sn.title,
        summary: cleanDescription(sn.description || ""),
        image: (th.high || th.medium || th.default || {}).url || "",
        publisher: sn.channelTitle || "",
        publishedAt: new Date(it.contentDetails?.videoPublishedAt || sn.publishedAt).toISOString(),
        pickCount: null,
        views: null,
        paid: false,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }
    pageToken = page.nextPageToken || "";
  } while (pageToken);

  // 再生回数をまとめて取得（50本ずつ）
  for (let i = 0; i < videos.length; i += 50) {
    const chunk = videos.slice(i, i + 50);
    const stats = await api("videos", { part: "statistics", id: chunk.map((v) => v.id.slice(3)).join(",") }, key);
    for (const it of stats.items || []) {
      const v = chunk.find((x) => x.id === `yt-${it.id}`);
      if (v && it.statistics?.viewCount) v.views = Number(it.statistics.viewCount);
    }
  }
  return videos;
}

module.exports = { fetchChannel, fetchAllUploads };
