
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const FIREBASE_PROJECT_ID = "red-flag-4fb04";
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
      "login",
      "verify",
      "password",
      "bank",
      "secure",
      "wallet",
      "crypto",
      "bonus",
      "jackpot",
      "deposit",
      "withdraw",
      "casino",
      "urgent",
      "confirm",
      "free money"
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

      score += 20;

      reasons.push(
        "Password field detected"
      );
    }

    // =========================================
    // URGENCY WORDING
    // =========================================

    if (pageSignals.hasUrgencyWords) {

      score += 15;

      reasons.push(
        "Urgency wording detected"
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

// =====================================================
// OLLAMA AI ANALYSIS
// =====================================================

async function analyzeWithOllama(data) {

  try {

    const prompt = `
You are a professional cybersecurity threat analysis engine.

Analyze the website carefully.

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

Return ONLY valid JSON.

{
  "score": 0-40,
  "reasons": [],
  "scamPhrases": [],
  "summary": ""
}

Website Data:
${JSON.stringify(data, null, 2)}
`;

    const response = await fetch(
      OLLAMA_URL,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          model: OLLAMA_MODEL,

          prompt,

          stream: false,

          format: {
            type: "object",

            properties: {

              score: {
                type: "number"
              },

              reasons: {
                type: "array",

                items: {
                  type: "string"
                }
              },

              scamPhrases: {
                type: "array",

                items: {
                  type: "string"
                }
              },

              summary: {
                type: "string"
              }
            },

            required: [
              "score",
              "reasons",
              "summary"
            ]
          },

          options: {
            temperature: 0.1
          }
        })
      }
    );

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

      reasons:
        parsed.reasons || [],

      scamPhrases:
        parsed.scamPhrases || [],

      summary:
        parsed.summary ||
        "Suspicious website detected"
    };

  } catch (error) {

    console.error(
      "❌ Ollama error:",
      error
    );

    return {
      score: 0,
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

    let finalScore = 0;

    let reasons = [];

    let scamPhrases = [];

    let explanation =
      "No major threats detected.";

    if (safeBrowsing.unsafe) {

      finalScore += 60;

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

    finalScore += ruleResult.score;

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

    // =========================================
    // OLLAMA ANALYSIS
    // =========================================

    if (finalScore >= 20) {

      console.log(
        "⚠️ Triggering Ollama analysis..."
      );

      const aiResult =
        await analyzeWithOllama({
          url,

          pageText:
            pageText
              .replace(/\s+/g, " ")
              .slice(0, 4000)
        });

      finalScore +=
        Math.min(
          aiResult.score || 0,
          40
        );

      reasons = [
        ...new Set([
          ...reasons,
          ...(aiResult.reasons || [])
        ])
      ];

      scamPhrases = [
        ...new Set([
          ...scamPhrases,
          ...(aiResult.scamPhrases || [])
        ])
      ];

      explanation =
        aiResult.summary || explanation;
    }

    // =========================================
    // FINAL SCORE
    // =========================================

    finalScore =
      Math.min(100, finalScore);

    let status = "Safe";

    if (finalScore >= 50) {
      status = "Dangerous";
    }
    else if (finalScore >= 20) {
      status = "Suspicious";
    }

    // =========================================
    // SAFE CLEANUP
    // =========================================

    if (finalScore < 10) {

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
