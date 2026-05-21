console.log("🔥 BACKGROUND IS RUNNING");
console.log("RedFlag background loaded");

const API_KEY = "YOUR_GEMINI_API_KEY";

/**
 * Listen for messages from content.js
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("📩 MESSAGE RECEIVED:", msg);

  if (msg.type !== "ANALYZE_PAGE") return;
  if (!msg.buttons || !msg.buttons.length) return;

  analyzeWithGemini(msg.buttons)
    .then((result) => {
      console.log("🤖 RAW AI RESULT:", result);

      // convert AI results → suspicious IDs
      const suspiciousIds = (result.results || [])
        .filter((r) => r.score >= 60)
        .map((r) => r.id);

      console.log("🚨 FINAL SUSPICIOUS IDS:", suspiciousIds);

      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: "AI_RESULT",
          suspiciousIds
        });
      }
    })
    .catch((err) => {
      console.error("❌ Gemini error:", err);
    });
});

/**
 * Call Gemini API
 */
async function analyzeWithGemini(buttons) {
  console.log("📦 BUTTONS SENT TO AI:", buttons.length);

  const prompt = `
You are a cybersecurity risk scoring system.

Analyze each clickable UI element and assign a risk score from 0 to 100.

Be aggressive in detection (prefer over-detection instead of missing phishing).

A button is risky if it:
- requests login, password, verification
- creates urgency or fear
- says "update", "confirm", "secure account"
- looks like phishing or scam UI
- pushes immediate action

Return ONLY valid JSON in this format:

{
  "results": [
    { "id": "button-id", "score": 0-100 }
  ]
}

Buttons:
${buttons
  .map(
    (b) => `
ID: ${b.id}
TEXT: ${b.text}
HREF: ${b.href}
TAG: ${b.tag}
`
  )
  .join("\n")}
`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    }
  );

  const data = await res.json();

  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  console.log("🧠 RAW GEMINI OUTPUT:", text);

  // clean markdown formatting
  text = text.replace(/```json|```/g, "").trim();

  // extract JSON safely
  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    console.error("❌ No JSON found in AI output");
    return { results: [] };
  }

  try {
    const parsed = JSON.parse(match[0]);
    console.log("✅ PARSED AI RESULT:", parsed);
    return parsed;
  } catch (e) {
    console.error("❌ JSON parse failed:", match[0]);
    return { results: [] };
  }
}