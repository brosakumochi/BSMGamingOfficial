# BSMGaming Portal

## デプロイ方法
1. このフォルダの内容をGitHubリポジトリにアップロードします。
2. VercelでそのリポジトリをImportしてデプロイします。
3. Vercelの Project Settings → Environment Variables で以下を設定します。
   - Name: `BRAWL_STARS_API_TOKEN`
   - Value: developer.brawlstars.com で取得した公式APIトークン
4. Redeployします。

## 使える機能
- BrawlAPIからキャラクター一覧・マップ一覧を取得
- 公式Brawl Stars APIからプレイヤー情報を検索
- 公式APIのイベントローテーションを表示（APIが正常に応答する場合）
- 15分ごとの自動再取得

## Tier表
統計ソースを接続していないため、Tier欄は手動評価用の枠です。最新勝率・使用率を取得したTier表ではありません。

## 注意
- APIトークンを `index.html` に書かないでください。
- BrawlAPIのデータ構造や利用制限が変更された場合、フロント側の調整が必要になる場合があります。
- APIがエラーを返す場合は、VercelのFunction Logsと公式APIポータルの利用状況を確認してください。
