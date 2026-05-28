import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// =====================================================
// MAIN AI ENDPOINT (OLLAMA FIXED)
// =====================================================

app.post("/analyze-ai", async (req, res) => {
  try {
    const { prompt } = req.body;

    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "qwen3:4b",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        stream: false
      })
    });

    const data = await response.json();

    let text = data.message?.content || "";

    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      return res.json({
        score: 0,
        summary: "No AI result",
        reasons: [],
        scamPhrases: []
      });
    }

    try {
      return res.json(JSON.parse(match[0]));
    } catch (e) {
      return res.json({
        score: 0,
        summary: "Invalid JSON from AI",
        reasons: [],
        scamPhrases: []
      });
    }

  } catch (err) {
    console.error(err);

    return res.json({
      score: 0,
      summary: "AI failed",
      reasons: [],
      scamPhrases: []
    });
  }
});

// =====================================================
// SAFE FALLBACK (UNCHANGED STYLE)
// =====================================================

function fallback(url) {
  return {
    score: 10,
    status: "Safe",
    reasons: ["Fallback mode"],
    explanation: "No AI available",
    scamPhrases: []
  };
}

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});