const AXES = [
  { key: "recentIdx", w: 0.50 },
  { key: "distIdx", w: 0.30 },
  { key: "trackIdx", w: 0.20 },
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
    const { cacheKey, mode, input } = req.body;
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

    // ---- 管理者用：このレースの予想を削除 ----
    if (mode === "delete") {
      const delRes = await fetch(`${SUPABASE_URL}/rest/v1/predictions?date=eq.${cacheKey.date}&type=eq.${cacheKey.type}&track_id=eq.${cacheKey.trackId}&race_num=eq.${cacheKey.raceNum}`, {
        method: "DELETE",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
      });
      if (!delRes.ok) {
        const errBody = await delRes.json().catch(() => ({}));
        return res.status(500).json({ error: "削除に失敗: " + (errBody.message || `HTTP ${delRes.status}`) });
      }
      return res.status(200).json({ ok: true });
    }

    // ---- 管理者用：AIで生成して保存（上書き） ----
    if (!input || !input.trim()) {
      return res.status(400).json({ error: "出走馬データ（URLまたはテキスト）が空です" });
    }

    let raceDataText = input.trim();
    let sourceNote = "";

    // URLが渡された場合は、サーバー側でページを取得して実データを抽出させる
    if (/^https?:\/\/\S+$/.test(raceDataText)) {
      let pageRes;
      try {
        pageRes = await fetch(raceDataText, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
        });
      } catch (e) {
        return res.status(500).json({ error: "URLの取得に失敗しました: " + e.message });
      }
      if (!pageRes.ok) {
        return res.status(500).json({ error: `URLの取得に失敗しました: HTTP ${pageRes.status}` });
      }
      let html = await pageRes.text();
      // スクリプト・スタイル・広告・ナビゲーション等を除去
      html = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<header[\s\S]*?<\/header>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      raceDataText = html.slice(0, 60000);
      sourceNote = "以下は出走表ページのHTMLです。出走馬テーブルから馬名・騎手・調教師・斤量・予想オッズなどの実データを抽出してください。\n\n";
    }

    const isBanei = cacheKey.trackId === "40";
    const label = cacheKey.type === "nar"
      ? (isBanei ? "ばんえい(帯広)" : `地方 ${cacheKey.trackName}`)
      : `JRA ${cacheKey.trackName}`;

    const system = `競馬AI。渡された出走馬データから実際の馬名・騎手・調教師・斤量・オッズ・前走成績・発走時刻などを抽出し、それに基づいて分析せよ。データに無い情報の創作・改変は禁止。発走時刻はページ内の「12:10」「15:35」などの時刻表記を必ず正確に抽出してpostTimeに"HH:MM"形式で記載すること。時刻が複数ある場合は対象レースの時刻を選ぶこと。不明な場合のみ空文字にする。新馬戦（出走馬に前走実績が無いレース）の場合、recentIdx・distIdx・trackIdxは全てnullにしてよい。その場合でもaiScoreには血統・騎手・調教師・調教評価などから判断した勝利可能性を0-100の数値で必ず入れること。新馬戦のprevResultsは"新馬"とする。各指数は以下の基準で厳密に算出せよ。recentIdx(近走指数):直近3〜5走の着順・着差・タイム・相手関係を総合評価(100=連続好走、50=平凡、0=惨敗続き)。distIdx(距離適性):今回距離での過去成績・タイム・末脚持続力から適性評価(100=得意距離で好走歴多数、50=普通、0=苦手距離)。trackIdx(馬場適性):今回馬場状態(良/稍重/重/不良)・コース形態での過去成績から評価(100=得意馬場で好走歴多数、50=普通、0=苦手馬場)。オッズだけに依存せず、実データから独立して評価すること。JSONのみ、前後の説明文は一切不要。各文字列フィールドは指定字数以内で簡潔に。{"raceName":"名","postTime":"11:00","distance":"1400m","surface":"良","analysisNote":"20字以内","horses":[{"num":1,"name":"馬名","jockey":"騎手","trainer":"調教師","weight":55,"bodyWeight":"498(-2)","recentIdx":75,"distIdx":70,"trackIdx":65,"aiScore":73,"odds":3.5,"comment":"20字以内","prevResults":"前走2着","strengths":"8字以内","weaknesses":"8字以内"}]}`;

    const user = `${cacheKey.date} ${label} 第${cacheKey.raceNum}R\n\n【出走馬データ】\n${sourceNote}${raceDataText}\n\n上記データに基づいてJSONを作成せよ。HTMLに記載されている出走馬を全頭漏れなく含めること（新馬戦でも同様）。データに無い項目は妥当な値を補ってよいが、馬名・騎手・調教師・オッズなど実データに含まれる項目は改変しないこと。出走馬の頭数は実データと完全に一致させること。JSONのみ返せ。`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "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",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,
        temperature: 0,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    const aiData = await response.json();

    // max_tokensで途中切れた場合はエラーを返す
    if (aiData?.stop_reason === "max_tokens") {
      return res.status(500).json({ error: "AIの出力が途中で切れました。再度お試しください。", stopReason: "max_tokens" });
    }

    const text = (aiData.content || []).map(c => c.type === "text" ? c.text : "").join("");

    // JSONブロックを安全に抽出（正規表現のバックトラッキング問題を回避）
    let clean = text;
    const startIdx = text.indexOf("{");
    const endIdx = text.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      clean = text.slice(startIdx, endIdx + 1);
    } else {
      clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
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

    // 必須フィールドの検証
    if (!parsed?.horses || !Array.isArray(parsed.horses) || parsed.horses.length === 0) {
      return res.status(500).json({ error: "予想データの生成に失敗しました。再度お試しください。", rawText: text });
    }

    if (Array.isArray(parsed.horses)) {
      parsed.horses = parsed.horses.map(h => ({ ...h, aiScore: calcScore(h) }));
    }

    // Supabaseに保存（同じレースなら上書き）
    const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/predictions?on_conflict=date,type,track_id,race_num`, {
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

    if (!saveRes.ok) {
      const errBody = await saveRes.json().catch(() => ({}));
      return res.status(500).json({
        error: "Supabaseへの保存に失敗: " + (errBody.message || `HTTP ${saveRes.status}`),
        detail: errBody,
      });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
