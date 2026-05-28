const GOOGLE_SAFE_BROWSING_KEY = "YOUR_API_KEY";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ANALYZE_WEBSITE") {
    analyzeWebsite(request.url, request.pageText).then(sendResponse);
    return true;
  }

  if (request.type === "ANALYZE_PAGE") {
    if (!request.buttons || !request.buttons.length) return;

    analyzeButtonsWithOllama(request.buttons)
      .then((result) => {
        const suspiciousIds = (result.results || [])
          .filter((r) => Number(r.score) >= 60)
          .map((r) => r.id);

        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: "AI_RESULT",
            suspiciousIds
          });
        }
      })
      .catch((error) => {
        console.error("Ollama button error:", error);
      });

    return true;
  }
});

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

  if (true) { 
    const aiResult = await analyzeWithOllama(pageText, url);

    const aiScore = Number(aiResult.score) || 0;

    if (aiScore > riskScore) {
      riskScore = aiScore;
    } else {
      riskScore += aiScore;
    }
    if (aiResult.reasons && aiResult.reasons.length > 0) {
      reasons = [...new Set([...reasons, ...aiResult.reasons])];
    }

    if (aiResult.scamPhrases && aiResult.scamPhrases.length > 0) {
      scamPhrases = [...new Set([...scamPhrases, ...aiResult.scamPhrases])];
    }


summary =
  aiResult.summary ||
  aiResult.explanation ||
  "This website contains suspicious phishing or scam patterns.";

  riskScore = Math.min(100, Math.round(riskScore));

  let status = "Safe";

  if (riskScore >= 50) {
    status = "High Risk";
  } else if (riskScore >= 20) {
    status = "Suspicious";
  }

  if (riskScore < 10) {
    reasons = [];
    scamPhrases = [];
    summary =
      "This website looks safe. No major phishing or scam indicators were found.";
  }

  if (!summary) {
    summary =
      riskScore >= 50
        ? "This website shows multiple high-risk indicators."
        : riskScore >= 20
        ? "This website shows some suspicious indicators."
        : "This website looks safe.";
  }

  return {
    status,
    riskScore,
    reasons,
    scamPhrases,
    summary
  };
}
}
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
    return { unsafe: false };
  }
}

function ruleBasedCheck(url, pageText) {
  let score = 0;
  let reasons = [];
  let scamPhrases = [];

  const parsedUrl = new URL(url);
  const lowerText = (pageText || "").toLowerCase();
  const domain = parsedUrl.hostname.toLowerCase();

if (domain.includes("-")) {
  score += 10;
  reasons.push("Domain contains dash characters, which can be used in fake websites");
}

if (domain.length > 30) {
  score += 10;
  reasons.push("Domain name is unusually long");
}

if (domain.split(".").length > 3) {
  score += 10;
  reasons.push("Website uses many subdomains");
}

if (
  domain.endsWith(".xyz") ||
  domain.endsWith(".top") ||
  domain.endsWith(".click") ||
  domain.endsWith(".link") ||
  domain.endsWith(".info")
) {
  score += 15;
  reasons.push("Website uses a high-risk domain extension");
}

if (url.includes("@")) {
  score += 20;
  reasons.push("URL contains @ symbol, which can hide the real destination");
}

if (/\d+\.\d+\.\d+\.\d+/.test(domain)) {
  score += 20;
  reasons.push("Website uses an IP address instead of a normal domain");
}

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

async function analyzeWithOllama(pageText, url) {
  try {
    const response = await fetch("http://localhost:3000/analyze-ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url,
        pageText: (pageText || "").slice(0, 2500)
      })
    });

    if (!response.ok) {
      throw new Error("Ollama backend failed");
    }

    return await response.json();
  } catch (error) {
    console.error("Ollama error:", error);

    return {
      score: 0,
      summary:
        "This website contains some suspicious indicators based on rule analysis.",
      reasons: [],
      scamPhrases: []
    };
  }
}

async function analyzeButtonsWithOllama(buttons) {
  try {
    const response = await fetch("http://localhost:3000/analyze-buttons", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        buttons: buttons.slice(0, 30)
      })
    });

    if (!response.ok) {
      throw new Error("Ollama button backend failed");
    }

    return await response.json();
  } catch (error) {
    console.error("Ollama button analysis failed:", error);
    return { results: [] };
  }
}

console.log("RedFlag background loaded with Ollama");