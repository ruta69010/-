export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  try {
    if (req.method === "GET") {
      const { date, type } = req.query;
      if (!date || !type) return res.status(400).json({ error: "date and type are required" });

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

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
