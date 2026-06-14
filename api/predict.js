const AXES = [
  { key: "recentIdx", w: 0.30 },
  { key: "distIdx", w: 0.20 },
  { key: "trackIdx", w: 0.15 },
  { key: "jockeyIdx", w: 0.15 },
  { key: "trainerIdx", w: 0.10 },
  { key: "peakIdx", w: 0.10 },
];

function calcScore(h) {
  let s = 0, w = 0;
  for (const a of AXES) {
    const v = h[a.key];
    if (typeof v === "number") { s += v * a.w; w += a.w; }
  }
  return w > 0 ? Math.round(s / w) : h.aiScore ?? 50;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { system, user, cacheKey, mode } = req.body;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!cacheKey?.date || !cacheKey?.type || !cacheKey?.trackId || !cacheKey?.raceNum) {
      return res.status(400).json({ error: "cacheKey(date, type, trackId, raceNum) is required" });
    }

    const cacheUrl = `${SUPABASE_URL}/rest/v1/predictions?date=eq.${cacheKey.date}&type=eq.${cacheKey.type}&track_id=eq.${cacheKey.trackId}&race_num=eq.${cacheKey.raceNum}&select=data`;

    // ---- 一般ユーザー用：キャッシュ確認のみ。無ければ notReady（AI呼び出しはしない） ----
    if (mode === "read") {
      const r = await fetch(cacheUrl, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
      });
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length > 0) {
        return res.status(200).json(rows[0].data);
      }
      return res.status(200).json({ notReady: true });
    }

    // ---- 管理者用：AIで生成して保存（上書き） ----
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "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",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    const aiData = await response.json();
    const text = (aiData.content || []).map(c => c.type === "text" ? c.text : "").join("");

    let clean = text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      clean = jsonMatch[0];
    } else {
      clean = text.replace(/```json[\s\S]*?```|```/g, "").trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return res.status(500).json({
        error: "JSON parse failed: " + e.message,
        stopReason: aiData?.stop_reason,
        rawText: text,
      });
    }

    if (Array.isArray(parsed.horses)) {
      parsed.horses = parsed.horses.map(h => ({ ...h, aiScore: calcScore(h) }));
    }

    // Supabaseに保存（同じレースなら上書き）
    await fetch(`${SUPABASE_URL}/rest/v1/predictions?on_conflict=date,type,track_id,race_num`, {
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

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
