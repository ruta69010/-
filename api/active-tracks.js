export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  try {
    if (req.method === "GET") {
      const { date, type } = req.query;
      if (!type) return res.status(400).json({ error: "type is required" });

      // dateが無い場合：その種別(nar/jra)でデータがある日付一覧を返す（新しい順）
      if (!date) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/active_tracks?type=eq.${type}&select=date&order=date.desc`, {
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
          },
        });
        const rows = await r.json();
        return res.status(200).json({ dates: Array.isArray(rows) ? rows.map(r => r.date) : [] });
      }

      const r = await fetch(`${SUPABASE_URL}/rest/v1/active_tracks?date=eq.${date}&type=eq.${type}&select=track_ids`, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
      });
      const rows = await r.json();
      return res.status(200).json({ trackIds: rows?.[0]?.track_ids || [] });
    }

    if (req.method === "POST") {
      const { date, type, trackIds } = req.body;
      if (!date || !type || !Array.isArray(trackIds)) {
        return res.status(400).json({ error: "date, type, trackIds are required" });
      }

      await fetch(`${SUPABASE_URL}/rest/v1/active_tracks?on_conflict=date,type`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({ date, type, track_ids: trackIds }),
      });
      return res.status(200).json({ ok: true });
    }

    // 指定した日付のデータ（開催会場リスト＋予想すべて）を削除
    if (req.method === "DELETE") {
      const { date, type } = req.body;
      if (!date || !type) {
        return res.status(400).json({ error: "date, type are required" });
      }

      const headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      };

      await fetch(`${SUPABASE_URL}/rest/v1/active_tracks?date=eq.${date}&type=eq.${type}`, {
        method: "DELETE",
        headers,
      });
      await fetch(`${SUPABASE_URL}/rest/v1/predictions?date=eq.${date}&type=eq.${type}`, {
        method: "DELETE",
        headers,
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
