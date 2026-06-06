export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { system, user, maxTokens } = req.body;
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
        system: system,
        messages: [{ role: "user", content: user }],
      }),
    });
    const data = await response.json();
    const text = (data.content || []).map(c => c.type === "text" ? c.text : "").join("");
    const clean = text.replace(/```json[\s\S]*?```|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
