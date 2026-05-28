const GOOGLE_SAFE_BROWSING_KEY = "AIzaSyCHLDX7fG7SA4mNLrxHneXsQPoV-gKrl6M";
const GEMINI_API_KEY = "AIzaSyCuidcWNvlE0KmehYAKtqH1D_H-lqjYk-w";
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ANALYZE_WEBSITE") {
    analyzeWebsite(request.url, request.pageText).then(sendResponse);
    return true;
  }
});

async function analyzeWebsite(url, pageText) {
  let riskScore = 0;
  let reasons = [];
  let scamPhrases = [];
  let summary = "";

  // ---------------- SAFE BROWSING ----------------

  const safeBrowsingResult = await checkSafeBrowsing(url);

  if (safeBrowsingResult.unsafe) {
    riskScore += 60;

    reasons.push(
      "Google Safe Browsing marked this website as dangerous"
    );
  }

  // ---------------- RULE BASED ----------------

  const ruleResult = ruleBasedCheck(url, pageText);

  riskScore += ruleResult.score;

  reasons = [...new Set([...reasons, ...ruleResult.reasons])];

  scamPhrases = [
    ...new Set([...scamPhrases, ...ruleResult.scamPhrases])
  ];

  // ---------------- AI ANALYSIS ----------------

  if (riskScore >= 25) {
    const aiResult = await analyzeWithGemini(pageText, url);

    riskScore += aiResult.score || 0;

    reasons = [...new Set([...reasons, ...(aiResult.reasons || [])])];

    scamPhrases = [
      ...new Set([
        ...scamPhrases,
        ...(aiResult.scamPhrases || [])
      ])
    ];

    summary =
      aiResult.summary ||
      "This website contains suspicious phishing patterns.";
  }

  // ---------------- FINAL SCORE ----------------

  riskScore = Math.min(100, Math.round(riskScore));

  // ---------------- STATUS ----------------

  let status = "Safe";

  if (riskScore >= 50) {
    status = "High Risk";
  } else if (riskScore >= 20) {
    status = "Suspicious";
  }

  // ---------------- SAFE MESSAGE ----------------

  if (riskScore < 10) {
    reasons = [];

    scamPhrases = [];

    summary =
      "This website looks safe. No major phishing or scam indicators were found.";
  }

  return {
    status,
    riskScore,
    reasons,
    scamPhrases,
    summary
  };
}

// =====================================================
// GOOGLE SAFE BROWSING
// =====================================================

async function checkSafeBrowsing(url) {
  try {
    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${GOOGLE_SAFE_BROWSING_KEY}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          client: {
            clientId: "redflag-extension",
            clientVersion: "1.0"
          },

          threatInfo: {
            threatTypes: [
              "MALWARE",
              "SOCIAL_ENGINEERING",
              "UNWANTED_SOFTWARE",
              "POTENTIALLY_HARMFUL_APPLICATION"
            ],

            platformTypes: ["ANY_PLATFORM"],

            threatEntryTypes: ["URL"],

            threatEntries: [{ url }]
          }
        })
      }
    );

    const data = await response.json();

    return {
      unsafe: Boolean(data.matches)
    };
  } catch (error) {
    console.error("Safe Browsing error:", error);

    return {
      unsafe: false
    };
  }
}

// =====================================================
// RULE BASED DETECTION
// =====================================================

function ruleBasedCheck(url, pageText) {
  let score = 0;
  let reasons = [];
  let scamPhrases = [];

  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname.toLowerCase();
  const lowerText = (pageText || "").toLowerCase();

  if (parsedUrl.protocol === "http:") {
    score += 20;
    reasons.push("Website does not use HTTPS");
  }

  if (url.length > 90) {
    score += 10;
    reasons.push("Very long URL");
  }

  const gamblingWords = [
    "toto",
    "situs toto",
    "wisdomtoto",
    "slot",
    "slot gacor",
    "gacor",
    "casino",
    "jackpot",
    "daftar",
    "deposit",
    "withdraw",
    "bonus",
    "freechip",
    "apk",
    "min dp",
    "min wd",
    "pemenang terakhir",
    "live feed"
  ];

  const foundGamblingWords = [];

  gamblingWords.forEach((word) => {
    if (lowerText.includes(word)) {
      foundGamblingWords.push(word);
      scamPhrases.push(word);
    }
  });

  const uniqueGamblingWords = [...new Set(foundGamblingWords)];

  if (uniqueGamblingWords.length >= 2) {
    score += 30;
    reasons.push("Multiple gambling/scam keywords found");
  }

  if (uniqueGamblingWords.length >= 4) {
    score += 25;
    reasons.push("Strong online gambling pattern detected");
  }

  if (uniqueGamblingWords.length >= 6) {
    score += 20;
    reasons.push("Very high amount of scam/gambling indicators");
  }

  const highRiskCombos = [
    ["login", "daftar"],
    ["deposit", "withdraw"],
    ["slot", "bonus"],
    ["toto", "daftar"],
    ["freechip", "apk"],
    ["gacor", "slot"],
    ["pemenang terakhir", "live feed"]
  ];

  highRiskCombos.forEach((combo) => {
    const found = combo.every((word) => lowerText.includes(word));

    if (found) {
      score += 15;
      reasons.push("High-risk pattern: " + combo.join(" + "));
      scamPhrases.push(...combo);
    }
  });

  const imageOrUrlWords = [
    "slot",
    "gacor",
    "wisdomtoto",
    "bonus",
    "freechip",
    "apk",
    "casino",
    "jackpot"
  ];

  imageOrUrlWords.forEach((word) => {
    if (lowerText.includes(word)) {
      score += 5;
    }
  });

  score = Math.min(score, 100);

  return {
    score,
    reasons: [...new Set(reasons)],
    scamPhrases: [...new Set(scamPhrases)]
  };
}

// =====================================================
// GEMINI AI ANALYSIS
// =====================================================

async function analyzeWithGemini(pageText, url) {
  try {
    const prompt = `
Analyze this webpage for phishing, scams, fake login systems, gambling scams, or malicious behavior.

Return ONLY valid JSON.

{
  "score": 0-30,
  "summary": "short explanation",
  "reasons": ["reason 1"],
  "scamPhrases": ["phrase 1"]
}

URL:
${url}

TEXT:
${pageText.slice(0, 3000)}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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

    if (!response.ok) {
      return {
        score: 0,

        summary:
          "This website contains some suspicious indicators based on rule analysis.",

        reasons: [],

        scamPhrases: []
      };
    }

    const data = await response.json();

    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    const cleanText = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const jsonStart = cleanText.indexOf("{");

    const jsonEnd = cleanText.lastIndexOf("}") + 1;

    return JSON.parse(
      cleanText.slice(jsonStart, jsonEnd)
    );
  } catch (error) {
    console.error("Gemini error:", error);

    return {
      score: 0,

      summary:
        "This website contains suspicious indicators based on rule analysis.",

      reasons: [],

      scamPhrases: []
    };
  }
}console.log("🔥 BACKGROUND IS RUNNING");
console.log("RedFlag background loaded");

const API_KEY = "YOUR_GEMINI_API_KEY";

/**
 * Listen for messages from content.js
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("📩 MESSAGE RECEIVED:", msg);

  if (msg.type !== "ANALYZE_PAGE") return;
  if (!msg.buttons || !msg.buttons.length) return;

  analyzeButtonsWithGemini(msg.buttons)
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
async function analyzeButtonsWithGemini(buttons) {
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