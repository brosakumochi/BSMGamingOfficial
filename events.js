export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "GETリクエストのみ対応しています" });
  }

  const token = process.env.BRAWL_STARS_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Vercelの環境変数 BRAWL_STARS_API_TOKEN が未設定です" });
  }

  try {
    const response = await fetch("https://api.brawlstars.com/v1/events/rotation", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(10000)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || `公式APIエラー (${response.status})`
      });
    }

    return res.status(200).json({
      updatedAt: new Date().toISOString(),
      events: Array.isArray(data) ? data : (data.items || data.events || [])
    });
  } catch (error) {
    console.error("Official rotation API error:", error);
    return res.status(502).json({ error: "公式APIへの接続に失敗しました" });
  }
}
