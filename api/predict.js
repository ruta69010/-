export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { system, user, maxTokens, cacheKey } = req.body;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

    // キャッシュ確認
    if (cacheKey) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/predictions?date=eq.${cacheKey.date}&type=eq.${cacheKey.type}&track_id=eq.${cacheKey.trackId}&race_num=eq.${cacheKey.raceNum}&select=data`, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
      });
      const rows = await r.json();
      if (rows && rows.length > 0) {
        return res.status(200).json(rows[0].data);
      }
    }

    // AI予想生成
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "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",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    const aiData = await response.json();
    const text = (aiData.content || []).map(c => c.type === "text" ? c.text : "").join("");
    const clean = text.replace(/```json[\s\S]*?```|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // Supabaseに保存
    if (cacheKey && parsed) {
      await fetch(`${SUPABASE_URL}/rest/v1/predictions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          date: cacheKey.date,
          type: cacheKey.type,
          track_id: cacheKey.trackId,
          race_num: cacheKey.raceNum,
          track_name: cacheKey.trackName,
          data: parsed,
        }),
      });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
