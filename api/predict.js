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

    // 15アカウント分のトークンとIDを配列で管理
    const CF_ACCOUNTS = [
      { token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID },
      { token: process.env.CF_TOKEN_2,  accountId: process.env.CF_ACCOUNT_2  },
      { token: process.env.CF_TOKEN_3,  accountId: process.env.CF_ACCOUNT_3  },
      { token: process.env.CF_TOKEN_4,  accountId: process.env.CF_ACCOUNT_4  },
      { token: process.env.CF_TOKEN_5,  accountId: process.env.CF_ACCOUNT_5  },
      { token: process.env.CF_TOKEN_6,  accountId: process.env.CF_ACCOUNT_6  },
      { token: process.env.CF_TOKEN_7,  accountId: process.env.CF_ACCOUNT_7  },
      { token: process.env.CF_TOKEN_8,  accountId: process.env.CF_ACCOUNT_8  },
      { token: process.env.CF_TOKEN_9,  accountId: process.env.CF_ACCOUNT_9  },
      { token: process.env.CF_TOKEN_10, accountId: process.env.CF_ACCOUNT_10 },
      { token: process.env.CF_TOKEN_11, accountId: process.env.CF_ACCOUNT_11 },
      { token: process.env.CF_TOKEN_12, accountId: process.env.CF_ACCOUNT_12 },
      { token: process.env.CF_TOKEN_13, accountId: process.env.CF_ACCOUNT_13 },
      { token: process.env.CF_TOKEN_14, accountId: process.env.CF_ACCOUNT_14 },
      { token: process.env.CF_TOKEN_15, accountId: process.env.CF_ACCOUNT_15 },
    ].filter(a => a.token && a.accountId);

    if (!cacheKey?.date || !cacheKey?.type || !cacheKey?.trackId || !cacheKey?.raceNum) {
      return res.status(400).json({ error: "cacheKey(date, type, trackId, raceNum) is required" });
    }

    const cacheUrl = `${SUPABASE_URL}/rest/v1/predictions?date=eq.${cacheKey.date}&type=eq.${cacheKey.type}&track_id=eq.${cacheKey.trackId}&race_num=eq.${cacheKey.raceNum}&select=data`;

    if (mode === "read") {
      const r = await fetch(cacheUrl, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
      });
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length > 0) return res.status(200).json(rows[0].data);
      return res.status(200).json({ notReady: true });
    }

    if (mode === "delete") {
      const delRes = await fetch(`${SUPABASE_URL}/rest/v1/predictions?date=eq.${cacheKey.date}&type=eq.${cacheKey.type}&track_id=eq.${cacheKey.trackId}&race_num=eq.${cacheKey.raceNum}`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
      });
      if (!delRes.ok) {
        const errBody = await delRes.json().catch(() => ({}));
        return res.status(500).json({ error: "削除に失敗: " + (errBody.message || `HTTP ${delRes.status}`) });
      }
      return res.status(200).json({ ok: true });
    }

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
        .replace(/<aside[\s\S]*?<\/aside>/gi, "")
        .replace(/<div[^>]*class="[^"]*ad[^"]*"[\s\S]*?<\/div>/gi, "")
        .replace(/<div[^>]*class="[^"]*banner[^"]*"[\s\S]*?<\/div>/gi, "")
        .replace(/<div[^>]*class="[^"]*sponsor[^"]*"[\s\S]*?<\/div>/gi, "")
        .replace(/<ins[\s\S]*?<\/ins>/gi, "");

      const tablePatterns = [
        /(<table[^>]*class="[^"]*Shutuba[^"]*"[\s\S]*?<\/table>)/gi,
        /(<table[^>]*class="[^"]*shutuba[^"]*"[\s\S]*?<\/table>)/gi,
        /(<table[^>]*class="[^"]*RaceTable[^"]*"[\s\S]*?<\/table>)/gi,
        /(<table[^>]*class="[^"]*race_table[^"]*"[\s\S]*?<\/table>)/gi,
        /(<table[^>]*class="[^"]*entry[^"]*"[\s\S]*?<\/table>)/gi,
        /(<table[^>]*id="[^"]*shutuba[^"]*"[\s\S]*?<\/table>)/gi,
      ];

      let extracted = "";
      for (const pattern of tablePatterns) {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) { extracted = matches.join("\n"); break; }
      }
      if (!extracted) extracted = html;

      // コード側でpostTimeを直接抽出
      let extractedPostTime = "";
      const raceNum = parseInt(cacheKey.raceNum);
      const timePatterns = [
        new RegExp(`${raceNum}R[\\s　]*([0-9]{1,2}:[0-9]{2})`),
        new RegExp(`第${raceNum}R[\\s　]*([0-9]{1,2}:[0-9]{2})`),
        new RegExp(`([0-9]{1,2}:[0-9]{2})[\\s　]*${raceNum}R`),
      ];
      for (const pattern of timePatterns) {
        const m = extracted.match(pattern) || html.match(pattern);
        if (m) { extractedPostTime = m[1]; break; }
      }

      extracted = extracted
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s{2,}/g, " ")
        .trim();

      raceDataText = extracted.slice(0, 60000);
      sourceNote = `以下は出走表データです。馬名・騎手・調教師・斤量・前走成績・オッズなどを抽出してください。${extractedPostTime ? `\n\n【重要】このレースの発走時刻は「${extractedPostTime}」です。postTimeには必ず「${extractedPostTime}」を入れてください。` : ""}\n\n`;
    }

    const isBanei = cacheKey.trackId === "40";
    const label = cacheKey.type === "nar"
      ? (isBanei ? "ばんえい(帯広)" : `地方 ${cacheKey.trackName}`)
      : `JRA ${cacheKey.trackName}`;

    const system = `競馬AI。渡された出走馬データから実際の馬名・騎手・調教師・斤量・近走成績（直近5走）・発走時刻・性別・年齢などを抽出し、それに基づいて分析せよ。オッズはデータ抽出のみ行い、指数評価には一切使用しないこと（オッズは人気であって実力ではない）。データに無い情報の創作・改変は禁止。

性別はデータから「牡」「牝」「セ」を正確に抽出すること。年齢は数字で抽出すること。

新馬戦の定義:出走馬データに前走成績の記載が一切無い馬のみ新馬戦として扱う。前走成績がある馬は必ず指数を算出すること。前走成績が実際に存在しない馬のみrecentIdx・distIdx・trackIdx・recentIdxMin・recentIdxMax・distIdxMin・distIdxMax・trackIdxMin・trackIdxMaxをnullにし、prevResultsを"新馬"とする。

recentIdx(近走指数)の算出は特に厳密に行うこと:
- 直近5走分の着順・着差・タイム・相手関係・レース展開を個別に評価する
- 指数は必ず1刻みで算出すること。5の倍数（45,50,55,60,65,70,75,80,85...）は絶対禁止。必ず53、67、72、84、91など端数を含む数値で出すこと
- 1着・2着が多い馬は80以上、3〜5着中心の馬は50〜70、大敗が続く馬は30〜49を目安に、着順の傾向をそのまま指数に反映させる
- 着差が小さい敗戦（僅差負け）は着順より高めに評価し、着差が大きい敗戦は低めに評価する
- 格上挑戦での好走は高評価、格下相手での凡走は低評価とする
- 直近のレースほど重みを大きくする（前走>2走前>3走前>4走前>5走前）
- 出走馬データに前走成績の記載が薄い場合でも、記載されている情報の範囲で必ず差をつけて評価し、不明を理由に平均値（50前後）に逃げないこと
- recentIdxは直近5走の加重平均的な総合評価値とする
- recentIdxMinには直近5走の中で最も評価の低かった1走の評価値を入れること
- recentIdxMaxは【必ず】recentIdxと独立して評価すること。全馬のrecentIdxMaxがaiScore順（総合順位順）に並ぶことは統計的にあり得ない。必ず数頭は「平均は低いが最大値は高い」馬が存在するはずである。例えば総合3位の馬のrecentIdxMaxが総合1位より高くなることは十分あり得る。これを無視して総合順位通りに並べるのは分析していない証拠であり禁止する。各馬の直近5走を個別に見て、その中の最高パフォーマンスを独立して評価せよ

distIdx(距離適性):今回の距離（例:1000m）での過去成績・タイム・末脚持続力から適性評価。同距離での出走歴がある場合は必ず指数を出すこと。絶対にnullにしない。同距離の出走歴が全くない場合のみnullにすること。distIdxMin・distIdxMaxも同様に1刻みで出すこと。
trackIdx(馬場適性):今回の馬場状態（良・稍重・重・不良）での過去成績から評価。同馬場での出走歴がある場合は必ず指数を出すこと。絶対にnullにしない。同馬場の出走歴が全くない場合のみnullにすること。trackIdxMin・trackIdxMaxも同様に1刻みで出すこと。
距離・馬場指数も必ず1刻みで算出すること。5刻みは禁止。

各指数は0〜130の範囲で評価。地方下級条件(C4/C3/C2/C1):上限目安60〜75、下限目安25〜35。地方上級条件:上限目安75〜85。地方重賞:上限目安85〜100。JRA条件戦:上限目安85〜105。JRA重賞・G1:上限目安100〜130。同じレースに出走している馬は同じレベルの競争に参加しているため、指数差は最大でも40〜50程度にとどめること。突出して弱い馬（指数20以下）は極めて稀であり、通常の地方競馬では30以下になることはほとんどない。レース内で最も弱い馬でも最強馬との差は30〜40程度とすること。

aiScoreはrecentIdx・distIdx・trackIdxの加重平均（近走50%・距離30%・馬場20%）で算出。nullの指数は除外して計算すること。オッズは一切参照しないこと。

raceNameには正式なレース名（例:「3歳以上C4-2」「北海道スプリントカップ」）を入れること。レース番号だけをraceNameにするのは禁止。trackTypeには"芝"または"ダート"を正確に抽出すること。

JSONのみ、前後の説明文は一切不要。{"raceName":"3歳以上C4-2","postTime":"14:45","distance":"1000m","trackType":"ダート","surface":"良","horseCount":10,"analysisNote":"20字以内","horses":[{"num":1,"name":"馬名","gender":"牡","age":4,"jockey":"騎手","trainer":"調教師","weight":55,"bodyWeight":"466(+4)","recentIdx":75,"recentIdxMin":60,"recentIdxMax":88,"distIdx":70,"distIdxMin":55,"distIdxMax":80,"trackIdx":65,"trackIdxMin":50,"trackIdxMax":75,"aiScore":73,"odds":3.5,"comment":"20字以内","prevResults":"前走2着","strengths":"8字以内","weaknesses":"8字以内"}]}`;

    const user = `${cacheKey.date} ${label} 第${cacheKey.raceNum}R\n\n【出走馬データ】\n${sourceNote}${raceDataText}\n\n上記データに基づいてJSONを作成せよ。出走馬を全頭漏れなく含めること。前走成績が記載されている馬は新馬として扱わず必ず指数を算出すること。馬の性別（牡・牝・セ）と年齢を必ず抽出すること。距離・馬場のデータが不足している場合は0ではなくnullにすること。レース内で強い馬と弱い馬の指数に必ず差をつけること。JSONのみ返せ。`;

    async function callAI(token, accountId) {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: 4096,
          temperature: 0,
        }),
      });
      return r.json();
    }

    // 全アカウントをランダム順で試す（1つ成功したら即終了）
    const shuffled = [...CF_ACCOUNTS].sort(() => Math.random() - 0.5);
    const available = shuffled;

    // デバッグ：有効なアカウント数を確認
    const totalAccounts = CF_ACCOUNTS.length;
    let lastError = null;
    let parsed = null;
    const errorLog = [];

    for (const account of available) {
      try {
        const aiData = await callAI(account.token, account.accountId);

        if (aiData?.errors?.length > 0) {
          const errMsg = aiData.errors.map(e => e.message).join(", ");
          errorLog.push(`アカウント${account.accountId.slice(0,8)}: ${errMsg.slice(0,50)}`);
          lastError = { error: "Cloudflare AIエラー: " + errMsg };
          continue;
        }

        const text = aiData?.result?.response || "";
        if (!text) {
          lastError = { error: "AIからの応答が空でした。" };
          continue;
        }

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
          lastError = { error: "JSON parse failed: " + e.message, rawText: text };
          continue;
        }

        if (!candidate?.horses || !Array.isArray(candidate.horses) || candidate.horses.length === 0) {
          lastError = { error: "予想データの生成に失敗しました。", rawText: text };
          continue;
        }

        candidate.horses = candidate.horses.map(h => ({
          ...h,
          aiScore: calcScore(h),
          recentIdx: h.recentIdx != null ? Math.round(h.recentIdx) : null,
          recentIdxMin: h.recentIdxMin != null ? Math.round(h.recentIdxMin) : null,
          recentIdxMax: h.recentIdxMax != null ? Math.round(h.recentIdxMax) : null,
          distIdx: h.distIdx != null ? Math.round(h.distIdx) : null,
          distIdxMin: h.distIdxMin != null ? Math.round(h.distIdxMin) : null,
          distIdxMax: h.distIdxMax != null ? Math.round(h.distIdxMax) : null,
          trackIdx: h.trackIdx != null ? Math.round(h.trackIdx) : null,
          trackIdxMin: h.trackIdxMin != null ? Math.round(h.trackIdxMin) : null,
          trackIdxMax: h.trackIdxMax != null ? Math.round(h.trackIdxMax) : null,
        }));
        parsed = candidate;
        break;
      } catch (e) {
        lastError = { error: "通信エラー: " + e.message };
      }
    }

    if (!parsed) {
      return res.status(500).json({
        ...(lastError || { error: "予想生成に失敗しました。" }),
        debug: { totalAccounts, triedAccounts: available.length, errorLog },
      });
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
