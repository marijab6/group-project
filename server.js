
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const FIREBASE_PROJECT_ID = "red-flag-4fb04";
const OLLAMA_TIMEOUT_MS = 115000;
const FIREBASE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// =====================================================
// CONFIG
// =====================================================

const PORT = 3000;

const GOOGLE_SAFE_BROWSING_KEY =
  process.env.GOOGLE_SAFE_BROWSING_KEY;

const OLLAMA_URL =
  "http://localhost:11434/api/generate";

const OLLAMA_MODEL = "llama3.2:1b";

// =====================================================
// SAFE BROWSING
// =====================================================


async function checkSafeBrowsing(url) {

  try {

    const endpoint =
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${GOOGLE_SAFE_BROWSING_KEY}`;

    const response = await fetch(endpoint, {
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

          platformTypes: [
            "ANY_PLATFORM"
          ],

          threatEntryTypes: [
            "URL"
          ],

          threatEntries: [
            { url }
          ]
        }
      })
    });

    const data = await response.json();

    return {
      unsafe: Boolean(data.matches)
    };

  } catch (error) {

    console.error(
      "Safe Browsing error:",
      error
    );

    return {
      unsafe: false
    };
  }
}



// =====================================================
// RULE-BASED DETECTION
// =====================================================

function ruleBasedDetection(url, pageText = "", pageSignals = {}) {

  let score = 0;

  const reasons = [];
  const scamPhrases = [];

  try {

    const parsed = new URL(url);

    const domain =
      parsed.hostname.toLowerCase();

    const text =
      pageText.toLowerCase();
      const trustedDomains = [
      "canvas",
      "instructure.com",
      "google.com",
      "microsoft.com",
      "github.com",
      "linkedin.com",
      "youtube.com",
      "stackoverflow.com"
    ];

    const isTrustedDomain =
      trustedDomains.some(name =>
        domain.includes(name)
      );
if (isTrustedDomain && score < 50) {
  score = Math.min(score, 10);
}
    // =========================================
    // HTTP
    // =========================================

    if (parsed.protocol === "http:") {

      score += 25;

      reasons.push(
        "Website does not use HTTPS"
      );
    }

    // =========================================
    // LONG URL
    // =========================================

    if (url.length > 100) {

      score += 15;

      reasons.push(
        "Very long URL detected"
      );
    }

    // =========================================
    // MANY SUBDOMAINS
    // =========================================

    if (domain.split(".").length > 3) {

      score += 15;

      reasons.push(
        "Website uses many subdomains"
      );
    }

    // =========================================
    // SUSPICIOUS TLD
    // =========================================

    const riskyTlds = [
      ".xyz",
      ".top",
      ".click",
      ".info",
      ".shop"
    ];

    if (
      riskyTlds.some(tld =>
        domain.endsWith(tld)
      )
    ) {

      score += 20;

      reasons.push(
        "Suspicious domain extension"
      );
    }

    // =========================================
    // DASHES
    // =========================================

    if (domain.includes("-")) {

      score += 10;

      reasons.push(
        "Domain contains dashes"
      );
    }

    // =========================================
    // GAMBLING / SCAM WORDS
    // =========================================

const suspiciousWords = [
  "urgent",
  "suspended",
  "act now",
  "limited time",
  "free money",
  "jackpot",
  "deposit",
  "withdraw",
  "crypto giveaway",
  "seed phrase",
  "recovery phrase",
  "gift card",
  "claim prize",
  "confirm identity",
  "payment failed",
  "bank alert",
  "€800/month (gas, water & electricity included)",
  "affordable rentals - move in now",
  "affordable rentals",
  "hurry",
  "€550/month (gas, water & electricity included)",
  "1 & 2 bedroom",
  "going fast",
  "all-in living",
  "€800/month (all utilities included)",


];

    let foundCount = 0;

    suspiciousWords.forEach(word => {

      if (text.includes(word)) {

        foundCount++;

        scamPhrases.push(word);
      }
    });

    if (foundCount >= 3) {

      score += 25;

      reasons.push(
        "Multiple suspicious phishing/scam keywords detected"
      );
    }

    // =========================================
    // PASSWORD FIELD
    // =========================================

if (pageSignals.hasPasswordField) {
  score += 0;
}

    // =========================================
    // URGENCY WORDING
    // =========================================

if (pageSignals.hasUrgencyWords && foundCount >= 1) {

  score += 10;

  reasons.push(
    "Urgency wording combined with suspicious scam language"
  );
}

  } catch (error) {

    reasons.push(
      "URL could not be analyzed"
    );
  }

  return {
    score: Math.min(score, 100),
    reasons,
    scamPhrases
  };
}

function cleanAiReasons(reasons = []) {

  const blockedPatterns = [
    /ruleBasedResult/i,
    /pageSignals/i,
    /safeBrowsing/i,
    /hasPasswordField/i,
    /hasUrgencyWords/i,
    /\.score/i,
    /\btrue\b/i,
    /\bfalse\b/i
  ];

  return reasons
    .filter(reason =>
      typeof reason === "string" &&
      reason.trim().length > 0
    )
    .map(reason =>
      reason.trim()
    )
    .filter(reason =>
      !blockedPatterns.some(pattern =>
        pattern.test(reason)
      )
    );
}

function cleanScamPhrases(phrases = []) {

  const genericWords = [
    "reply",
    "course",
    "password",
    "https"
  ];

  return phrases
    .filter(phrase =>
      typeof phrase === "string" &&
      phrase.trim().length > 2
    )
    .map(phrase =>
      phrase.trim()
    )
    .filter(phrase =>
      !genericWords.includes(
        phrase.toLowerCase()
      )
    );
}

// =====================================================
// OLLAMA AI ANALYSIS
// =====================================================

async function analyzeWithOllama(data) {

  try {

    const prompt = `
You are a professional cybersecurity threat analysis engine.

Analyze the website carefully.
Your job is to decide whether the page is likely safe, suspicious, or dangerous for a normal user.

Detect:
- phishing
- fake login systems
- credential theft
- scam behavior
- fake banking systems
- gambling scams
- crypto scams
- social engineering
- urgency manipulation
- suspicious payment requests
- impersonation attempts
- likelihood that the page text is AI-generated or heavily AI-assisted writing

Use the rule-based findings as supporting cybersecurity evidence, but make your own final risk decision from the full website data.

Important strict rules:
- Do not treat HTTPS as suspicious. HTTPS is normal and usually positive.
- Do not mark a page suspicious only because it has words like login, reply, course, account, password, or verify. These words can be normal on schools, banks, shops, and dashboards.
- Do not mark school, work, dashboard, learning platform, or internal portal pages as scams unless there is clear phishing, credential theft, impersonation, payment fraud, malware, or fake giveaway behavior.
- Do not use JSON field names in your reasons. Never write reasons like "ruleBasedResult.score < 50", "pageSignals.hasUrgencyWords", "hasPasswordField", or "safeBrowsing.unsafe".
- Reasons must be human-readable sentences that explain what a real user can understand.
- If the evidence is weak, choose a low score and explain that no clear scam indicators were found.
- Only assign 50 or higher when there are at least TWO strong dangerous indicators. Do not copy examples into the reasons. Only mention evidence that is actually found on the website.
- A login form alone must stay Safe or low Suspicious.
- Only include scamPhrases that are actual suspicious phrases found in the website text. Do not include generic single words unless they are clearly used in a scam context.
- If this looks like a legitimate educational, business, or service website, keep the score in the Safe range unless the content strongly suggests abuse.

Risk score guide:
- 0-20 = Safe. No clear scam evidence, or only normal website behavior.
- 21-49 = Suspicious. Some concerning signs exist, but not enough to call it dangerous.
- 50-100 = Dangerous. Clear phishing, scam, credential theft, malware, impersonation, or fraud behavior.

Write the summary like you are explaining it to a normal user.
Do not use technical JSON words.
Do not mention ruleBasedResult, pageSignals, score logic, or Safe Browsing fields.Explain what was found, why it matters, and whether the user should be careful.
Return valid JSON for the extension, but write the summary and reasons in simple human language.
The user will only see the summary and reasons, not the JSON format.
Start with { and end with }.
Do not use markdown.
Do not write anything outside the JSON.
{
  "score": 0-100,
  "status": "Safe | Suspicious | Dangerous",
  "reasons": [],
  "scamPhrases": [],
  "summary": ""
}

Website Data:
${JSON.stringify(data, null, 2)}
`;

const controller = new AbortController();

const timeout = setTimeout(() => {
  controller.abort();
}, OLLAMA_TIMEOUT_MS);

const response = await fetch(
  OLLAMA_URL,
  {
    method: "POST",
    signal: controller.signal,

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      model: OLLAMA_MODEL,

      prompt,

      stream: false,

format: "json",

      options: {
        temperature: 0.1,
        num_predict: 600
      }
    })
  }
);

clearTimeout(timeout);

    const raw = await response.text();

    console.log("========== RAW OLLAMA ==========");
    console.log(raw);

    if (!raw || raw.trim().length === 0) {

      throw new Error(
        "Empty Ollama response"
      );
    }

    const parsedRaw =
      JSON.parse(raw);

    const text =
      parsedRaw.response || "";

    const jsonStart =
      text.indexOf("{");

    const jsonEnd =
      text.lastIndexOf("}") + 1;

    if (
      jsonStart === -1 ||
      jsonEnd === 0
    ) {

      throw new Error(
        "No JSON found in Ollama response"
      );
    }

    const cleaned =
      text.slice(jsonStart, jsonEnd);

    const parsed =
      JSON.parse(cleaned);

    return {
      score: parsed.score || 0,

      status:
        parsed.status || "",

      reasons:
        parsed.reasons || [],

      scamPhrases:
        parsed.scamPhrases || [],

      summary:
        parsed.summary ||
        "Suspicious website detected",

      aiLikelihood: parsed.aiLikelihood || 0,
      aiWritingStyle: parsed.aiWritingStyle || ""
    };

  } catch (error) {

    console.error(
      "❌ Ollama error:",
      error
    );

    return {
      score: null,
      status: "",
      reasons: [],
      scamPhrases: [],
      summary:
        "AI analysis unavailable"
    };
  }
}

// =====================================================
// MAIN ANALYSIS ENDPOINT
// =====================================================

app.post("/analyze", async (req, res) => {

  try {

    const {
      url,
      pageText = "",
      pageSignals = {}
    } = req.body;

    // =========================================
    // SAFE BROWSING
    // =========================================

    const safeBrowsing =
      await checkSafeBrowsing(url);

    let ruleScore = 0;

    let reasons = [];

    let scamPhrases = [];

    let explanation =
      "No major threats detected.";

    if (safeBrowsing.unsafe) {

      ruleScore += 60;

      reasons.push(
        "Google Safe Browsing marked this website as dangerous"
      );
    }

    // =========================================
    // RULE ANALYSIS
    // =========================================

    const ruleResult =
      ruleBasedDetection(
        url,
        pageText,
        pageSignals
      );

    ruleScore += ruleResult.score;

    reasons = [
      ...new Set([
        ...reasons,
        ...ruleResult.reasons
      ])
    ];

    scamPhrases = [
      ...new Set([
        ...scamPhrases,
        ...ruleResult.scamPhrases
      ])
    ];

    ruleScore =
      Math.min(100, ruleScore);

    let finalScore = ruleScore;

    // =========================================
    // OLLAMA ANALYSIS
    // =========================================

    console.log(
        "⚠️ Triggering Ollama analysis..."
      );

      const aiResult =
        await analyzeWithOllama({
          url,

          pageText:
            pageText
              .replace(/\s+/g, " ")
              .slice(0, 3000),
          pageSignals,

          ruleBasedResult: {
            score: ruleScore,
            reasons,
            scamPhrases
          },

          safeBrowsing
        });

if (typeof aiResult.score === "number") {
  finalScore = Math.round(
    (ruleScore * 0.4) + (aiResult.score * 0.6)
  );

  finalScore = Math.max(
    0,
    Math.min(100, finalScore)
  );
}
const strongReasons = reasons.filter(reason => {
  const r = reason.toLowerCase();

  return (
    r.includes("safe browsing") ||
    r.includes("credential") ||
    r.includes("password") ||
    r.includes("bank") ||
    r.includes("payment") ||
    r.includes("crypto") ||
    r.includes("prize") ||
    r.includes("scam") ||
    r.includes("phishing") ||
    r.includes("malware") ||
    r.includes("impersonation")
  );
});

if (
  !safeBrowsing.unsafe &&
  finalScore >= 50 &&
  strongReasons.length < 2
) {
  finalScore = 35;
}

      reasons = [
        ...new Set([
          ...reasons,
          ...cleanAiReasons(aiResult.reasons || [])
        ])
      ];

      scamPhrases = [
        ...new Set([
          ...scamPhrases,
          ...cleanScamPhrases(aiResult.scamPhrases || [])
        ])
      ];

      explanation =
        aiResult.summary || explanation;

    // =========================================
    // FINAL SCORE
    // =========================================

    finalScore =
      Math.min(100, finalScore);

    let status = "Safe";

    if (finalScore >= 50) {
      status = "Dangerous";
    }
    else if (finalScore > 20) {
      status = "Suspicious";
    }

    if (safeBrowsing.unsafe && finalScore < 50) {
      finalScore = 50;
      status = "Dangerous";
    }

    if (finalScore >= 50) {
      status = "Dangerous";
    }
    else if (finalScore > 20) {
      status = "Suspicious";
    }
    else {
      status = "Safe";
    }

    // =========================================
    // SAFE CLEANUP
    // =========================================

if (finalScore <= 20 && !safeBrowsing.unsafe) {
      reasons = [];

      scamPhrases = [];

      explanation =
        "This website appears safe.";
    }

    res.json({
      score: finalScore,
      status,
      reasons,
      scamPhrases,
      explanation,
      source: "ollama-hybrid"
    });

  } catch (error) {

    console.error(error);

    res.json({
      score: 0,
      status: "Safe",
      reasons: [],
      scamPhrases: [],
      explanation:
        "Detection failed",
      source: "fallback"
    });
  }
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {

  console.log(
    `🚀 RedFlag backend running on http://localhost:${PORT}`
  );
});
