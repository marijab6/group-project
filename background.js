const GOOGLE_SAFE_BROWSING_KEY = "YOUR_API_KEY";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ANALYZE_WEBSITE") {
    analyzeWebsite(request.url, request.pageText).then(sendResponse);
    return true;
  }
});

// =====================================================
// MAIN ANALYSIS
// =====================================================

async function analyzeWebsite(url, pageText) {
  let riskScore = 0;
  let reasons = [];
  let scamPhrases = [];
  let summary = "";

  const safeBrowsingResult = await checkSafeBrowsing(url);

  if (safeBrowsingResult.unsafe) {
    riskScore += 60;
    reasons.push("Google Safe Browsing marked this website as dangerous");
  }

  const ruleResult = ruleBasedCheck(url, pageText);

  riskScore += ruleResult.score;
  reasons = [...new Set([...reasons, ...ruleResult.reasons])];
  scamPhrases = [...new Set([...scamPhrases, ...ruleResult.scamPhrases])];

  // =====================================================
  // AI ANALYSIS (REPLACED GEMINI → OLLAMA)
  // =====================================================

  if (riskScore >= 25) {
    const aiResult = await analyzeWithOllama(pageText, url);

    riskScore += aiResult.score || 0;

    reasons = [...new Set([...reasons, ...(aiResult.reasons || [])])];

    scamPhrases = [
      ...new Set([...scamPhrases, ...(aiResult.scamPhrases || [])])
    ];

    summary =
      aiResult.summary ||
      "This website contains suspicious phishing patterns.";
  }

  riskScore = Math.min(100, Math.round(riskScore));

  let status = "Safe";

  if (riskScore >= 50) status = "High Risk";
  else if (riskScore >= 20) status = "Suspicious";

  if (riskScore < 10) {
    reasons = [];
    scamPhrases = [];
    summary = "This website looks safe.";
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
// SAFE BROWSING (UNCHANGED)
// =====================================================

async function checkSafeBrowsing(url) {
  try {
    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${GOOGLE_SAFE_BROWSING_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    return { unsafe: Boolean(data.matches) };
  } catch {
    return { unsafe: false };
  }
}

// =====================================================
// RULE BASED CHECK (UNCHANGED)
// =====================================================

function ruleBasedCheck(url, pageText) {
  let score = 0;
  let reasons = [];
  let scamPhrases = [];

  const parsedUrl = new URL(url);
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
    "slot",
    "casino",
    "jackpot",
    "bonus",
    "deposit",
    "withdraw",
    "apk",
    "gacor"
  ];

  const found = gamblingWords.filter(w => lowerText.includes(w));

  if (found.length >= 2) {
    score += 30;
    reasons.push("Multiple scam keywords detected");
  }

  scamPhrases = found;

  return {
    score,
    reasons,
    scamPhrases
  };
}

// =====================================================
// 🔥 REPLACED AI FUNCTION (OLLAMA)
// =====================================================

async function analyzeWithOllama(pageText, url) {
  try {
    const prompt = `
Analyze this webpage for phishing, scams, gambling, or malicious behavior.

Return ONLY JSON:

{
  "score": 0-30,
  "summary": "",
  "reasons": [],
  "scamPhrases": []
}

URL:
${url}

TEXT:
${pageText.slice(0, 3000)}
`;

    const response = await fetch("http://localhost:3000/analyze-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    return await response.json();

  } catch (err) {
    console.error("Ollama error:", err);

    return {
      score: 0,
      summary: "AI unavailable",
      reasons: [],
      scamPhrases: []
    };
  }
}