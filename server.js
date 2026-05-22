import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

function fallbackDetection(url, pageSignals = {}) {
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
    source: "fallback",
  };
}

app.post("/analyze", async (req, res) => {
  try {
    const { url, pageSignals = {} } = req.body;

    const prompt = `
You are a cybersecurity website risk detector for a browser extension called RedFlag.

Analyze the website using the given URL and browser-detected signals.

Website URL:
${url}

Detected technical signals:
${JSON.stringify(pageSignals, null, 2)}

Return ONLY valid JSON in this exact format:
{
  "score": 0,
  "status": "Safe",
  "reasons": ["reason 1", "reason 2"],
  "explanation": "short user-friendly explanation"
}

Rules:
- score must be between 0 and 100
- status must be one of: Safe, Suspicious, Dangerous
- 0-20 = Safe
- 21-50 = Suspicious
- 51-100 = Dangerous
- Do not exaggerate
- Do not say a site is definitely malicious unless there are strong indicators
- Keep reasons short and clear
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let text = response.text.trim();
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    const result = JSON.parse(text);

    res.json({
      score: Number(result.score) || 0,
      status: result.status || "Safe",
      reasons: result.reasons || [],
      explanation: result.explanation || "No explanation was generated.",
      source: "gemini",
    });
  } catch (error) {
    console.error("Gemini detection error:", error);

    const fallback = fallbackDetection(req.body.url, req.body.pageSignals);
    res.json(fallback);
  }
});

app.listen(3000, () => {
  console.log("RedFlag backend running on http://localhost:3000");
});