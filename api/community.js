
const TABLES = {
  announcements: ["title", "body"],
  tournaments: ["title", "body", "date_text"],
  members: ["name", "role", "player_tag", "body"],
  tiers: ["brawler_name", "tier", "body"]
};

const BOARD_TABLES = new Set(["board_posts", "board_comments"]);

function jsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    return {};
  }
}

function cleanText(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

function sbHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function sbRequest(path, { method = "GET", key, body, prefer } = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const headers = sbHeaders(key, prefer ? { Prefer: prefer } : {});
  const response = await fetch(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {}

  if (!response.ok) {
    throw new Error(
      data?.message || data?.hint || `Supabase error ${response.status}`
    );
  }

  return data;
}

async function requireAdmin(req) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) throw new Error("ログインしてください");

  const userRes = await fetch(
    `${process.env.SUPABASE_URL}/auth/v1/user`,
    {
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`
      }
    }
  );

  const user = await userRes.json().catch(() => ({}));

  if (!userRes.ok || !user.email) {
    throw new Error("ログイン期限が切れました。再ログインしてください");
  }

  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.includes(String(user.email).toLowerCase())) {
    throw new Error("このアカウントは管理者として許可されていません");
  }

  return user;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const action = String(req.query?.action || "");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY ||
    !service
  ) {
    return res.status(500).json({
      error: "Supabaseの環境変数が未設定です。READMEの設定を確認してください。"
    });
  }

  try {
    // 公開用データ
    if (req.method === "GET" && action === "site") {
      const [
        announcements,
        tournaments,
        members,
        tiers,
        posts,
        comments
      ] = await Promise.all([
        sbRequest("announcements?select=*&order=created_at.desc&limit=30", { key: service }),
        sbRequest("tournaments?select=*&order=created_at.desc&limit=30", { key: service }),
        sbRequest("members?select=*&order=created_at.desc&limit=100", { key: service }),
        sbRequest("tiers?select=*&order=brawler_name.asc&limit=100", { key: service }),
        sbRequest("board_posts?select=*&status=eq.approved&order=created_at.desc&limit=50", { key: service }),
        sbRequest("board_comments?select=*&status=eq.approved&order=created_at.asc&limit=200", { key: service })
      ]);

      return res.status(200).json({
        announcements,
        tournaments,
        members,
        tiers,
        board_posts: posts,
        board_comments: comments
      });
    }

    // 掲示板の新規投稿・返信
    if (
      req.method === "POST" &&
      (action === "post" || action === "comment")
    ) {
      const b = jsonBody(req);
      const nickname = cleanText(b.nickname, 24);
      const body = cleanText(b.body, action === "post" ? 1500 : 1000);

      if (nickname.length < 1 || body.length < 2) {
        return res.status(400).json({
          error: "名前と本文を入力してください"
        });
      }

      if (action === "post") {
        const title = cleanText(b.title, 80);

        if (title.length < 2) {
          return res.status(400).json({ error: "タイトルを入力してください" });
        }

        await sbRequest("board_posts", {
          method: "POST",
          key: service,
          body: { nickname, title, body, status: "pending" },
          prefer: "return=minimal"
        });
      } else {
        const postId = cleanText(b.post_id, 60);

        if (!/^[0-9a-f-]{36}$/i.test(postId)) {
          return res.status(400).json({ error: "返信先が不正です" });
        }

        const parents = await sbRequest(
          `board_posts?select=id&id=eq.${encodeURIComponent(postId)}&status=eq.approved&limit=1`,
          { key: service }
        );

        if (!parents?.length) {
          return res.status(404).json({
            error: "公開中の投稿が見つかりません"
          });
        }

        await sbRequest("board_comments", {
          method: "POST",
          key: service,
          body: { post_id: postId, nickname, body, status: "pending" },
          prefer: "return=minimal"
        });
      }

      return res.status(201).json({
        ok: true,
        message: "管理者の承認待ちです"
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        error: "この操作にはPOSTが必要です"
      });
    }

    // ここから管理者専用
    await requireAdmin(req);
    const b = jsonBody(req);

    if (action === "admin_data") {
      const [
        announcements,
        tournaments,
        members,
        tiers,
        pending_posts,
        pending_comments
      ] = await Promise.all([
        sbRequest("announcements?select=*&order=created_at.desc", { key: service }),
        sbRequest("tournaments?select=*&order=created_at.desc", { key: service }),
        sbRequest("members?select=*&order=created_at.desc", { key: service }),
        sbRequest("tiers?select=*&order=brawler_name.asc", { key: service }),
        sbRequest("board_posts?select=*&status=eq.pending&order=created_at.asc", { key: service }),
        sbRequest("board_comments?select=*&status=eq.pending&order=created_at.asc", { key: service })
      ]);

      return res.status(200).json({
        announcements,
        tournaments,
        members,
        tiers,
        pending_posts,
        pending_comments
      });
    }

    // お知らせ・大会・メンバー・Tierの保存
    if (action === "save") {
      const table = String(b.table || "");
      const allowedFields = TABLES[table];

      if (!allowedFields) {
        return res.status(400).json({ error: "保存先が不正です" });
      }

      const record = {};

      for (const field of allowedFields) {
        if (b.record?.[field] !== undefined) {
          record[field] = cleanText(
            b.record[field],
            field === "body" ? 2000 : 120
          );
        }
      }

      if (table === "members" && !record.name) {
        record.name = cleanText(b.record?.title, 100);
      }

      if (table === "announcements" || table === "tournaments") {
        if (!record.title) {
          return res.status(400).json({ error: "タイトルを入力してください" });
        }
      }

      if (table === "tiers") {
        record.brawler_name =
          record.brawler_name || cleanText(b.record?.title, 100);

        if (!["S", "A", "B", "C"].includes(record.tier)) {
          return res.status(400).json({
            error: "TierはS/A/B/Cから選んでください"
          });
        }
      }

      if (table === "members" && !record.name) {
        return res.status(400).json({
          error: "メンバー名を入力してください"
        });
      }

      await sbRequest(table, {
        method: "POST",
        key: service,
        body: record,
        prefer: "return=minimal"
      });

      return res.status(201).json({ ok: true });
    }

    // 登録データ・掲示板投稿の削除
    if (action === "delete") {
      const table = String(b.table || "");
      const id = cleanText(b.id, 60);

      if (
        ![...Object.keys(TABLES), ...BOARD_TABLES].includes(table) ||
        !/^[0-9a-f-]{36}$/i.test(id)
      ) {
        return res.status(400).json({ error: "削除対象が不正です" });
      }

      await sbRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        key: service,
        prefer: "return=minimal"
      });

      return res.status(200).json({ ok: true });
    }

    // 掲示板の承認・却下
    if (action === "moderate") {
      const table = String(b.table || "");
      const id = cleanText(b.id, 60);
      const status = String(b.status || "");

      if (
        !BOARD_TABLES.has(table) ||
        !/^[0-9a-f-]{36}$/i.test(id) ||
        !["approved", "rejected"].includes(status)
      ) {
        return res.status(400).json({ error: "承認データが不正です" });
      }

      await sbRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        key: service,
        body: { status },
        prefer: "return=minimal"
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "不明な操作です" });
  } catch (error) {
    const message = error?.message || "サーバーエラー";
    const status = /ログイン|管理者/.test(message) ? 401 : 500;

    console.error("Community API error:", message);

    return res.status(status).json({ error: message });
  }
}
