export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "GETリクエストのみ対応しています" });
  }

  const token = process.env.BRAWL_STARS_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Vercelの環境変数 BRAWL_STARS_API_TOKEN が未設定です" });
  }

  const tag = String(req.query.tag || "").replace(/^#/, "").toUpperCase();
  if (!/^[A-Z0-9]{3,15}$/.test(tag)) {
    return res.status(400).json({ error: "プレイヤータグを確認してください" });
  }

  try {
    const response = await fetch(
      `https://api.brawlstars.com/v1/players/%23${encodeURIComponent(tag)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(10000)
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || `公式APIエラー (${response.status})`
      });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error("Official player API error:", error);
    return res.status(502).json({ error: "公式APIへの接続に失敗しました" });
  }
}
