console.log("RedFlag popup script loaded");

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