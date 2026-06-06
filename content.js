console.log("RedFlag popup script loaded");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_PAGE_TEXT") {
    const importantText = Array.from(
      document.querySelectorAll("h1, h2, h3, p, button, a, label, span")
    )
      .map((el) => el.innerText || "")
      .join(" ");

    sendResponse({
      text: importantText.slice(0, 3000)
    });
  }

  if (request.type === "HIGHLIGHT_SCAM_TEXT") {
    highlightScamText(request.scamPhrases || []);
    sendResponse({ success: true });
  }
});

function highlightScamText(scamPhrases) {
  if (!scamPhrases.length) return;

  const cleanPhrases = scamPhrases
    .filter((phrase) => phrase && phrase.length > 2)
    .map((phrase) => phrase.toLowerCase());

  const elements = document.querySelectorAll("p, span, h1, h2, h3, a, button, label");

  elements.forEach((element) => {
    const text = element.innerText || "";
    const lowerText = text.toLowerCase();

    const found = cleanPhrases.some((phrase) => lowerText.includes(phrase));

    if (found) {
      element.classList.add("RedFlag-high-risk");
    }
  });
}

let lastResult = { suspiciousIds: [] };

/**
 * Collect all clickable elements
 */
function collectButtons() {
  const elements = document.querySelectorAll(
    "button, a, input[type='button'], input[type='submit'], [role='button']"
  );

  return Array.from(elements).map((el) => {
    const id = crypto.randomUUID();

    el.setAttribute("data-redflag-id", id);

    return {
      id,
      text: (el.textContent || "").trim(),
      href: el.getAttribute("href") || "",
      tag: el.tagName,

      // extra context for AI
      pageTitle: document.title,
      domain: location.hostname
    };
  });
}

/**
 * Highlight suspicious buttons
 */
function highlightButtons(ids) {
  ids.forEach((id) => {
    const el = document.querySelector(`[data-redflag-id="${id}"]`);

    if (!el) return;

    el.style.border = "2px solid red";
    el.style.backgroundColor = "rgba(255,0,0,0.12)";
    el.style.borderRadius = "6px";
    el.style.boxShadow = "0 0 10px rgba(255,0,0,0.4)";
  });
}

/**
 * Send page data to background
 */
function analyzePage() {
  const buttons = collectButtons();

  console.log("📦 SENDING BUTTONS:", buttons.length);

  chrome.runtime.sendMessage({
    type: "ANALYZE_PAGE",
    buttons
  });
}

/**
 * Receive AI results
 */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "AI_RESULT") {
    console.log("🤖 AI RESULT RECEIVED:", msg);

    lastResult = msg;

    const ids = msg.suspiciousIds || [];

    highlightButtons(ids);

    console.log("🚨 Suspicious buttons:", ids.length);
  }
});

/**
 * Popup support (optional)
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_LAST_RESULT") {
    sendResponse(lastResult);
  }
});

/**
 * Run on page load
 */
window.addEventListener("load", () => {
  setTimeout(analyzePage, 800);
});
document.addEventListener("DOMContentLoaded", async () => {
  const content = document.getElementById("content");
  const text = document.getElementById("text");
  const expandLink = document.getElementById("expand-link");

  if (expandLink && text && content) {
    expandLink.addEventListener("click", () => {
      if (expandLink.textContent === "See More") {
        expandLink.textContent = "See Less";
        text.classList.remove("text-overflow");
      } else {
        expandLink.textContent = "See More";
        text.classList.add("text-overflow");
      }
    });

    if (text.scrollHeight > content.offsetHeight) {
      expandLink.style.display = "block";
    } else {
      expandLink.style.display = "none";
    }
  }

  const themeToggle = document.getElementById("themeToggle");
  const toggleCircle = document.getElementById("toggleCircle");

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");

      const isDark = document.body.classList.contains("dark-mode");

      if (toggleCircle) {
        toggleCircle.style.transform = isDark
          ? "translateX(24px)"
          : "translateX(0)";
      }
    });
  }

  const currentWebsite = document.getElementById("currentWebsite");
  const riskBar = document.getElementById("riskBar");
  const riskPercentage = document.getElementById("riskPercentage");
  const websiteStatus = document.getElementById("websiteStatus");
  const reasonsList = document.getElementById("reasonsList");
  const aiText = document.getElementById("text");

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab || !tab.url) return;

  const parsedUrl = new URL(tab.url);

  if (currentWebsite) {
    currentWebsite.textContent = parsedUrl.hostname;
  }

  const aiResult = await getGeminiWebsiteDetection(tab.url);

  const score = Number(aiResult.score) || 0;
  const status = aiResult.status || getStatusFromScore(score);
  const reasons = aiResult.reasons || [];
  const explanation =
    aiResult.explanation || "No explanation was generated.";

  riskPercentage.textContent = `${score}%`;
  riskBar.style.width = `${score}%`;
  websiteStatus.textContent = status;
  aiText.textContent = explanation;

  updateRiskColors(score, riskBar, websiteStatus);
  updateReasons(reasonsList, reasons);
});

function getStatusFromScore(score) {
  if (score <= 20) return "Safe";
  if (score <= 50) return "Suspicious";
  return "Dangerous";
}

function updateRiskColors(score, riskBar, websiteStatus) {
  if (score <= 20) {
    websiteStatus.style.color = "#00c853";
    riskBar.className =
      "h-full bg-green-500 rounded-full transition-all duration-500";
    riskBar.parentElement.className =
      "relative h-8 border border-green-500 rounded-full overflow-hidden bg-white";
  } else if (score <= 50) {
    websiteStatus.style.color = "#f97316";
    riskBar.className =
      "h-full bg-orange-500 rounded-full transition-all duration-500";
    riskBar.parentElement.className =
      "relative h-8 border border-orange-500 rounded-full overflow-hidden bg-white";
  } else {
    websiteStatus.style.color = "#ef4444";
    riskBar.className =
      "h-full bg-red-600 rounded-full transition-all duration-500";
    riskBar.parentElement.className =
      "relative h-8 border border-red-600 rounded-full overflow-hidden bg-white";
  }
}

function updateReasons(reasonsList, reasons) {
  reasonsList.innerHTML = "";

  if (!reasons || reasons.length === 0) {
    reasonsList.innerHTML = `
      <li class="flex items-center gap-2 text-gray-500">
        <span>✅</span>
        <span>No suspicious indicators detected</span>
      </li>
    `;
    return;
  }

  reasons.forEach((reason) => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-2";
    li.innerHTML = `
      <span>⚠️</span>
      <span>${reason}</span>
    `;
    reasonsList.appendChild(li);
  });
}

async function getGeminiWebsiteDetection(url) {
  try {
    const parsedUrl = new URL(url);

    const pageSignals = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      hasDashInDomain: parsedUrl.hostname.includes("-"),
      domainLength: parsedUrl.hostname.length,
      urlLength: url.length,
    };

    const response = await fetch("http://localhost:3000/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, pageSignals }),
    });

    return await response.json();
  } catch (error) {
    console.error("Gemini website detection failed:", error);

    return {
      score: 0,
      status: "Safe",
      reasons: ["Gemini detection unavailable"],
      explanation: "The AI detection service could not be reached.",
      source: "fallback",
    };
  }
}

