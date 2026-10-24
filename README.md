# Finsight（フィンサイト）

**ニュースから、気づきを。**

NewsPicks の金融ニュースと YouTube の金融チャンネルを集めて、AI（Sarashina）がやさしく・具体的に解説するアプリです。
体育会系のアメリカ人キャラクター「コーチ・マイク」に、記事探しや深掘り質問ができます。

## 2つの使い方

| | PC 版 | スマホ版（公開サイト） |
|---|---|---|
| 動かす場所 | 自分の PC（`npm start`） | GitHub Actions ＋ Cloudflare Pages（無料） |
| 更新 | 5分ごと | 2時間ごと |
| 保存（★）・既読 | PC に保存 | 見ている端末ごとに保存 |

## PC 版

```bash
npm start
```

`.env` に `SARASHINA_API_KEY` と `YOUTUBE_API_KEY` を書いておきます。http://localhost:3000 で開きます。

## スマホ版のしくみ

1. **GitHub Actions** が2時間ごとに `scripts/update.js` を動かし、記事・動画を集め、AI 解説・金利・おすすめ5選を作る
2. `scripts/build-site.js` がスマホ用サイト（`site/`）を作る
3. データは `state` ブランチ、サイトは `site` ブランチに置く（毎回1コミットだけ）
4. **Cloudflare Pages** が `site` ブランチを公開する。チャット・深掘り質問・その場の解説は `functions/api/` の関数が動く

## スマホ版の準備（最初に1回）

1. GitHub でこのリポジトリを作って、コードを上げる（公開リポジトリにすると Actions を無料で好きなだけ使える）
2. GitHub の **Settings → Secrets and variables → Actions** に、次の2つを登録する
   - `SARASHINA_API_KEY`
   - `YOUTUBE_API_KEY`
3. **Actions → 更新（記事・動画・AI解説） → Run workflow** で1回動かす（`state` と `site` ブランチができる）
4. Cloudflare の **Workers & Pages → 作成 → Pages → Git に接続** で、このリポジトリを選ぶ
   - 本番ブランチ: `site`
   - フレームワーク: なし／ビルドコマンド: 空／ビルド出力ディレクトリ: `/`
5. Cloudflare の Pages プロジェクトの **設定 → 変数とシークレット** に `SARASHINA_API_KEY` を（暗号化して）登録し、もう一度デプロイする
6. `https://（プロジェクト名）.pages.dev` をスマホで開き、「ホーム画面に追加」
7. AI の中継（`worker/`）を置く。Sarashina は日本の外からの接続を断るので、アメリカで動く GitHub Actions は、東京に固定したこの中継を通して AI を呼ぶ
   - `worker` フォルダで `npx wrangler deploy` と `npx wrangler secret put SARASHINA_API_KEY`
   - 出てきたアドレスを `.github/workflows/update.yml` の `AI_PROXY_URL` に書く

## 調整できること

- 更新の間隔: `.github/workflows/update.yml` の `cron`
- 1回の更新で AI 解説を作る時間: 同じファイルの `AI_MINUTES`（分）
- 集めるチャンネル: `lib/sources.js`
