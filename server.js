import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const FIREBASE_PROJECT_ID = "red-flag-4fb04";
const FIREBASE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── FIRESTORE HELPERS ────────────────────────────────────────
function toFirestore(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string")      fields[key] = { stringValue: value };
    else if (typeof value === "number") fields[key] = { integerValue: value };
    else if (typeof value === "boolean") fields[key] = { booleanValue: value };
  }
  return { fields };
}

function fromFirestore(doc) {
  if (!doc || !doc.fields) return null;
  const result = {};
  for (const [key, val] of Object.entries(doc.fields)) {
    if      (val.stringValue  !== undefined) result[key] = val.stringValue;
    else if (val.integerValue !== undefined) result[key] = parseInt(val.integerValue);
    else if (val.doubleValue  !== undefined) result[key] = parseFloat(val.doubleValue);
    else if (val.booleanValue !== undefined) result[key] = val.booleanValue;
    else result[key] = null;
  }
  return result;
}

async function addDocument(collection, data) {
  const url = `${FIREBASE_BASE_URL}/${collection}`;
  const body = toFirestore({ ...data, date_reported: new Date().toISOString() });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log("addDocument result:", JSON.stringify(json).slice(0, 200));
  return json;
}

async function getDocument(collection, docId) {
  const safeId = encodeURIComponent(docId);
  const url = `${FIREBASE_BASE_URL}/${collection}/${safeId}`;
  console.log("getDocument URL:", url);
  const res = await fetch(url);
  const json = await res.json();
  console.log("getDocument raw response:", JSON.stringify(json).slice(0, 300));
  if (json.error) return null;
  return fromFirestore(json);
}

async function setDocument(collection, docId, data) {
  const safeId = encodeURIComponent(docId);
  const url = `${FIREBASE_BASE_URL}/${collection}/${safeId}`;
  const body = toFirestore(data);
  console.log("setDocument body:", JSON.stringify(body));
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log("setDocument result:", JSON.stringify(json).slice(0, 300));
  return json;
}

// ─── FALLBACK DETECTION ───────────────────────────────────────
function fallbackDetection(url, pageSignals = {}) {
  let score = 0;
  const reasons = [];
  try {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.toLowerCase();
    if (parsedUrl.protocol === "http:") { score += 25; reasons.push("Website does not use HTTPS"); }
    if (domain.includes("-")) { score += 15; reasons.push("Domain contains dash characters"); }
    if (domain.length > 30) { score += 15; reasons.push("Very long domain name"); }
    if (domain.split(".").length > 3) { score += 15; reasons.push("Website uses many subdomains"); }
    if ([".xyz",".top",".click",".link",".info"].some(ext => domain.endsWith(ext))) {
      score += 20; reasons.push("Website uses a high-risk domain extension");
    }
    if (url.length > 100) { score += 10; reasons.push("URL is unusually long"); }
  } catch { reasons.push("URL could not be analyzed"); }
  score = Math.min(score, 100);
  const status = score > 50 ? "Dangerous" : score > 20 ? "Suspicious" : "Safe";
  return {
    score, status,
    reasons: reasons.length > 0 ? reasons : ["No suspicious indicators detected"],
    explanation: score <= 20 ? "This website appears safe." : score <= 50 ? "Some suspicious indicators found." : "High-risk website detected.",
    source: "fallback",
  };
}

// ─── POST /analyze ────────────────────────────────────────────
app.post("/analyze", async (req, res) => {
  try {
    const { url, pageSignals = {} } = req.body;
    const prompt = `You are a cybersecurity website risk detector for RedFlag.
Analyze: ${url}
Signals: ${JSON.stringify(pageSignals)}
Return ONLY valid JSON: {"score":0,"status":"Safe","reasons":[],"explanation":""}
Rules: score 0-100, status=Safe/Suspicious/Dangerous.`;
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    let text = response.text.trim().replace(/```json/g,"").replace(/```/g,"").trim();
    const result = JSON.parse(text);
    res.json({ score: Number(result.score)||0, status: result.status||"Safe", reasons: result.reasons||[], explanation: result.explanation||"", source: "gemini" });
  } catch (error) {
    console.error("Gemini error:", error);
    res.json(fallbackDetection(req.body.url, req.body.pageSignals));
  }
});

// ─── POST /report ─────────────────────────────────────────────
app.post("/report", async (req, res) => {
  try {
    const { url, hostname, risk_score, status, user_id } = req.body;
    console.log("📥 Report received:", { url, hostname, risk_score, status, user_id });

    if (!url || !user_id) return res.status(400).json({ error: "Missing required fields." });

    // 1. Sla op in community_reports
    await addDocument("community_reports", {
      url,
      hostname: hostname || "unknown",
      risk_score: risk_score || 0,
      status: status || "Unknown",
      user_id,
    });

    // 2. Haal bestaande count op
    const existing = await getDocument("reported_sites", hostname);
    console.log("📄 Existing doc for", hostname, ":", existing);

    const newCount = (existing?.count || 0) + 1;
    console.log("🔢 New count:", newCount);

    // 3. Sla nieuwe count op
    await setDocument("reported_sites", hostname, {
      source: url,
      count: newCount,
      risk_score: risk_score || 0,
      reason: status || "",
      date_update: new Date().toISOString(),
    });

    // 4. Lees terug
    const updated = await getDocument("reported_sites", hostname);
    console.log("✅ Updated doc:", updated);

    const total_reports = updated?.count ?? newCount;
    console.log(`🚩 Final total for ${hostname}: ${total_reports}`);

    res.json({ success: true, total_reports });

  } catch (error) {
    console.error("❌ Report error:", error);
    res.status(500).json({ error: "Failed to save report." });
  }
});

// ─── GET /report-count ────────────────────────────────────────
app.get("/report-count", async (req, res) => {
  try {
    const { hostname } = req.query;
    if (!hostname) return res.json({ total_reports: 0 });
    const doc = await getDocument("reported_sites", hostname);
    console.log(`📊 Count request for ${hostname}:`, doc);
    res.json({ total_reports: doc?.count || 0 });
  } catch (error) {
    console.error("❌ Count error:", error);
    res.json({ total_reports: 0 });
  }
});

app.listen(3000, () => console.log("🚩 RedFlag backend running on http://localhost:3000"));
