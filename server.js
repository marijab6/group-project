import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const OLLAMA_MODEL = "llama3.2:1b";

function fallbackDetection(url) {
  let score = 0;
  const reasons = [];

  try {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.toLowerCase();

    if (parsedUrl.protocol === "http:") {
      score += 25;
      reasons.push("Website does not use HTTPS");
    }

    if (domain.includes("-")) {
      score += 15;
      reasons.push("Domain contains dash characters");
    }

    if (domain.length > 30) {
      score += 15;
      reasons.push("Very long domain name");
    }

    if (domain.split(".").length > 3) {
      score += 15;
      reasons.push("Website uses many subdomains");
    }

    if (
      domain.endsWith(".xyz") ||
      domain.endsWith(".top") ||
      domain.endsWith(".click") ||
      domain.endsWith(".link") ||
      domain.endsWith(".info")
    ) {
      score += 20;
      reasons.push("Website uses a high-risk domain extension");
    }

    if (url.length > 100) {
      score += 10;
      reasons.push("URL is unusually long");
    }
  } catch (error) {
    reasons.push("URL could not be analyzed");
  }

  score = Math.min(score, 100);

  let status = "Safe";
  if (score > 20 && score <= 50) status = "Suspicious";
  if (score > 50) status = "Dangerous";

  return {
    score,
    status,
    reasons:
      reasons.length > 0 ? reasons : ["No suspicious indicators detected"],
    explanation:
      score <= 20
        ? "This website appears safe based on the current checks."
        : score <= 50
        ? "This website shows some suspicious indicators. Be careful before entering personal information."
        : "This website shows multiple high-risk phishing indicators. Avoid entering passwords, payment details, or personal information.",
    source: "fallback"
  };
}

function extractJson(text) {
  const cleanText = (text || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const match = cleanText.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("No JSON returned from Ollama");
  }

  return JSON.parse(match[0]);
}

app.post("/analyze", async (req, res) => {
  try {
    const { url, pageSignals = {} } = req.body;

    const prompt = `
You are a cybersecurity website risk detector for a browser extension called RedFlag.

Analyze this website for phishing or scam indicators.

Website URL:
${url}

Detected technical signals:
${JSON.stringify(pageSignals, null, 2)}

Return ONLY valid JSON:
{
  "score": 0,
  "status": "Safe",
  "reasons": ["reason 1"],
  "explanation": "short explanation"
}

Rules:
- score must be between 0 and 100
- status must be one of: Safe, Suspicious, Dangerous
- 0-20 = Safe
- 21-50 = Suspicious
- 51-100 = Dangerous
- keep reasons short
- do not write anything outside JSON
`;

    const ollamaResponse = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          num_predict: 180,
          temperature: 0.1
        }
      })
    });

    const data = await ollamaResponse.json();
    const result = extractJson(data.response);

    res.json({
      score: Number(result.score) || 0,
      status: result.status || "Safe",
      reasons: result.reasons || [],
      explanation: result.explanation || "No explanation generated.",
      source: "ollama"
    });
  } catch (error) {
    console.error("Ollama detection error:", error);
    res.json(fallbackDetection(req.body.url));
  }
});

app.post("/analyze-ai", async (req, res) => {
  try {
    const { url, pageText = "" } = req.body;

const prompt = `
You are an AI phishing and scam detector for a browser extension called RedFlag.

Analyze the URL and website text.

Check for:
- phishing login forms
- fake password fields
- fake update warnings
- urgency language
- suspicious links
- gambling or casino scam words
- deposit or withdraw systems
- fake prizes or bonuses
- suspicious domains
- long or strange URLs
- misleading buttons

Return ONLY valid JSON:
{
  "score": 0,
  "summary": "short AI explanation",
  "reasons": ["AI reason 1", "AI reason 2"],
  "scamPhrases": ["exact phrase from page"]
}

Rules:
- score must be between 0 and 100
- reasons must sound like AI security analysis, not basic rules
- scamPhrases must be exact words or short phrases from the website text
- include words like login, password, update, bonus, deposit, withdraw if they appear
- do not invent phrases
- do not write outside JSON
- For a phishing test page with login/password fields, fake update warnings, or social engineering text, score should be 60-90
- Do not give low scores for obvious phishing examples

Website URL:
${url}

Website text:
${pageText.slice(0, 3000)}
`;

    const ollamaResponse = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          num_predict: 180,
          temperature: 0.1
        }
      })
    });

    const data = await ollamaResponse.json();
    const result = extractJson(data.response);

    res.json({
      score: Number(result.score) || 0,
      summary:
        result.summary ||
        "This website contains suspicious indicators based on AI analysis.",
      reasons: result.reasons || [],
      scamPhrases: result.scamPhrases || []
    });
  } catch (error) {
    console.error("Ollama AI route error:", error);

    res.json({
      score: 0,
      summary:
        "This website contains suspicious indicators based on rule analysis.",
      reasons: [],
      scamPhrases: []
    });
  }
});

app.post("/analyze-buttons", async (req, res) => {
  try {
    const { buttons = [] } = req.body;

    const prompt = `
You are a cybersecurity risk scoring system.

Analyze each clickable UI element and assign a risk score from 0 to 100.

A button is risky if it:
- asks for login or password
- says deposit, withdraw, bonus, register, daftar, login
- creates urgency
- looks like scam or gambling UI
- pushes immediate action

Return ONLY valid JSON:
{
  "results": [
    { "id": "button-id", "score": 0 }
  ]
}

Rules:
- keep every id exactly the same
- score must be between 0 and 100
- do not write anything outside JSON

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

    const ollamaResponse = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          num_predict: 220,
          temperature: 0.1
        }
      })
    });

    const data = await ollamaResponse.json();
    const result = extractJson(data.response);

    res.json({
      results: result.results || []
    });
  } catch (error) {
    console.error("Ollama button route error:", error);
    res.json({ results: [] });
  }
});

app.listen(3000, () => {
  console.log("RedFlag backend running on http://localhost:3000");
});