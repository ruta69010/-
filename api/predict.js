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

    const system = `競馬AI。渡された出走馬データから実際の馬名・騎手・調教師・斤量・前走成績・発走時刻などを抽出し、それに基づいて分析せよ。オッズはデータ抽出のみ行い、指数評価には一切使用しないこと（オッズは人気であって実力ではない）。データに無い情報の創作・改変は禁止。発走時刻はページ内の「12:10」「15:35」などの時刻表記を必ず正確に抽出してpostTimeに"HH:MM"形式で記載すること。時刻が複数ある場合は対象レースの時刻を選ぶこと。不明な場合のみ空文字にする。

新馬戦の定義:年齢(2歳・3歳など)は関係なく、出走馬データに前走成績の記載が一切無い（1レースも走っていない）場合のみ新馬戦として扱う。出走馬データに「前走」「着順」「タイム」などの過去レース情報が1つでも記載されている馬は、新馬ではない。年齢が若い・「2歳」という表記だけで新馬と判断するのは厳禁。前走成績が実際に存在しない馬のみrecentIdx・distIdx・trackIdxをnullにし、prevResultsを"新馬"とする。前走成績がある馬は必ず実データに基づいて指数を算出すること。

recentIdx(近走指数)の算出は特に厳密に行うこと:
- 直近5走分の着順・着差・タイム・相手関係・レース展開を個別に評価する
- 1着・2着が多い馬は80以上、3〜5着中心の馬は50〜70、大敗が続く馬は0〜40を目安に、着順の傾向をそのまま指数に反映させる
- 着差が小さい敗戦（僅差負け）は着順より高めに評価し、着差が大きい敗戦は低めに評価する
- 格上挑戦での好走は高評価、格下相手での凡走は低評価とする
- 直近のレースほど重みを大きくする（前走>2走前>3走前）
- 出走馬データに前走成績の記載が薄い場合でも、記載されている情報の範囲で必ず差をつけて評価し、不明を理由に平均値（50前後）に逃げないこと
- recentIdxは直近5走の加重平均的な総合評価値とする
- recentIdxMaxには、直近5走の中で最も評価の高かった1走（最高のパフォーマンスを発揮したレース）の評価値を入れること。例えば直近は不調でも、3走前に格上相手で僅差好走していればその走の評価値をrecentIdxMaxに入れる。前走実績が無い馬はnullにする。

各指数は0〜130の範囲で、レースクラスと実力を正直に反映して評価せよ。無理に高い数字を出さず、実データから判断した妥当な数値にすること。以下を目安とするが、あくまで実力に基づいて判断せよ。地方下級条件(C3/C2/C1):上限目安70〜80。地方上級・重賞:上限目安85〜100。JRA条件戦:上限目安85〜105。JRA重賞・G1:上限目安100〜130。レース内で実力差がある場合は数値に差をつけ、横並びにしないこと。

distIdx(距離適性):今回距離での過去成績・タイム・末脚持続力から適性評価。
trackIdx(馬場適性):今回馬場状態(良/稍重/重/不良)・コース形態での過去成績から評価。
aiScoreはrecentIdx・distIdx・trackIdxの実力評価から算出し、オッズの数値は一切参照しないこと。人気馬だから高い、人気薄だから低いという判断は禁止。

trackTypeには"芝"または"ダート"を正確に抽出すること。horseCountには実際の出走頭数（horses配列の要素数と一致する数値）を入れること。

JSONのみ、前後の説明文は一切不要。各文字列フィールドは指定字数以内で簡潔に。{"raceName":"名","postTime":"11:00","distance":"1400m","trackType":"ダート","surface":"良","horseCount":12,"analysisNote":"20字以内","horses":[{"num":1,"name":"馬名","jockey":"騎手","trainer":"調教師","weight":55,"bodyWeight":"498(-2)","recentIdx":75,"recentIdxMax":88,"distIdx":70,"trackIdx":65,"aiScore":73,"odds":3.5,"comment":"20字以内","prevResults":"前走2着","strengths":"8字以内","weaknesses":"8字以内"}]}`;

    const user = `${cacheKey.date} ${label} 第${cacheKey.raceNum}R\n\n【出走馬データ】\n${sourceNote}${raceDataText}\n\n上記データに基づいてJSONを作成せよ。HTMLに記載されている出走馬を全頭漏れなく含めること。前走成績が実際に記載されている馬は新馬として扱わず、必ず指数を算出すること。データに無い項目は妥当な値を補ってよいが、馬名・騎手・調教師・オッズなど実データに含まれる項目は改変しないこと。出走馬の頭数は実データと完全に一致させること。JSONのみ返せ。`;

    async function callAI() {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
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
      return r.json();
    }

    let aiData;
    let lastError = null;
    let parsed = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        aiData = await callAI();

        if (aiData?.stop_reason === "max_tokens") {
          lastError = { error: "AIの出力が途中で切れました。", stopReason: "max_tokens" };
          continue;
        }
        if (aiData?.error) {
          lastError = { error: "AI APIエラー: " + (aiData.error.message || JSON.stringify(aiData.error)) };
          continue;
        }

        const text = (aiData.content || []).map(c => c.type === "text" ? c.text : "").join("");
        let clean = text;
        const startIdx = text.indexOf("{");
        const endIdx = text.lastIndexOf("}");
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          clean = text.slice(startIdx, endIdx + 1);
        } else {
          clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
        }

        let candidate;
        try {
          candidate = JSON.parse(clean);
        } catch (e) {
          lastError = { error: "JSON parse failed: " + e.message, stopReason: aiData?.stop_reason, rawText: text };
          continue;
        }

        if (!candidate?.horses || !Array.isArray(candidate.horses) || candidate.horses.length === 0) {
          lastError = { error: "予想データの生成に失敗しました。", rawText: text };
          continue;
        }

        candidate.horses = candidate.horses.map(h => ({ ...h, aiScore: calcScore(h) }));
        parsed = candidate;
        break;
      } catch (e) {
        lastError = { error: "通信エラー: " + e.message };
      }
    }

    if (!parsed) {
      return res.status(500).json(lastError || { error: "予想生成に3回失敗しました。再度お試しください。" });
    }

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
