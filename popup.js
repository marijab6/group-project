console.log("RedFlag popup loaded");

const currentWebsite = document.getElementById("currentWebsite");
const websiteStatus = document.getElementById("websiteStatus");
const riskBar = document.getElementById("riskBar");
const riskScore = document.getElementById("riskPercentage");
const reasonsList = document.getElementById("reasonsList");
const aiText = document.getElementById("text");
const analyzeAgainBtn = document.getElementById("analyzeAgainBtn");
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

if (analyzeAgainBtn) {
  analyzeAgainBtn.addEventListener("click", analyzeCurrentTab);
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(analyzeCurrentTab, 800);
    setupTabs();

});
function setupTabs() {
  const overviewBtn = document.getElementById("overviewBtn");
  const activityBtn = document.getElementById("activityBtn");
  const overviewTab = document.getElementById("overviewTab");
  const activityTab = document.getElementById("activityTab");

  if (!overviewBtn || !activityBtn || !overviewTab || !activityTab) {
    console.warn("Tab elements not found.");
    return;
  }

  overviewBtn.addEventListener("click", () => {
    overviewTab.classList.remove("hidden");
    activityTab.classList.add("hidden");
  });

  activityBtn.addEventListener("click", async () => {
    overviewTab.classList.add("hidden");
    activityTab.classList.remove("hidden");

    await loadActivityHistory();
  });
}
function setupAnalyzeAgainButton() {
  const analyzeAgainBtn = document.getElementById("analyzeAgainBtn");

  if (!analyzeAgainBtn) return;

  analyzeAgainBtn.addEventListener("click", analyzeCurrentTab);
}
async function analyzeCurrentTab() {
  try {
    websiteStatus.textContent = "Checking...";
    aiText.textContent = "Analyzing webpage...";
    reasonsList.innerHTML = "<li class='text-gray-500'>Checking...</li>";
    updateRisk(0);

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab || !tab.id || !tab.url) {
      throw new Error("No active tab found.");
    }

    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://")
    ) {
      throw new Error("RedFlag cannot scan browser system pages.");
    }

    currentWebsite.textContent = new URL(tab.url).hostname;

    await waitForPageReady(tab.id);

    const pageData = await getPageData(tab.id);

    const result = await chrome.runtime.sendMessage({
      type: "ANALYZE_WEBSITE",
      url: tab.url,
      pageText: pageData.combinedText
    });

    if (!result) {
      throw new Error("No result from background.js");
    }

    renderResult(result);
      await saveScanToHistory({
      site_url: tab.url,
      hostname: new URL(tab.url).hostname,
      risk_score: result.riskScore || 0,
      status: result.status || "Unknown",
      details: result.summary || "No analysis available.",
      scan_date: new Date().toLocaleString(),
    });

    await highlightPage(tab.id, result.scamPhrases || []);
  } catch (error) {
    console.error("Popup error:", error);

    websiteStatus.textContent = "Error";
    websiteStatus.className = "text-red-600 font-semibold mt-1 text-[30px]";
    aiText.textContent = error.message;
    reasonsList.innerHTML = "<li>⚠️ Extension failed.</li>";
    updateRisk(0);
  }
}

async function waitForPageReady(tabId) {
  for (let i = 0; i < 5; i++) {
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.readyState
      });

      const state = injected[0]?.result;

      if (state === "complete" || state === "interactive") {
        return;
      }
    } catch (error) {
      console.warn("Waiting for page:", error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function getPageData(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const textElements = document.querySelectorAll(
        "h1, h2, h3, h4, p, a, button, label, span, input, textarea, div"
      );

      const visibleText = Array.from(textElements)
        .map((el) => el.innerText || el.value || "")
        .filter((text) => text.trim().length > 2)
        .join(" ");

      const imageText = Array.from(document.images)
        .map((img) => {
          return [
            img.alt || "",
            img.title || "",
            img.src || "",
            img.currentSrc || ""
          ].join(" ");
        })
        .join(" ");

      const linkText = Array.from(document.links)
        .map((a) => {
          return [
            a.innerText || "",
            a.href || ""
          ].join(" ");
        })
        .join(" ");

      return {
        combinedText: `${visibleText} ${imageText} ${linkText}`.slice(0, 10000)
      };
    }
  });

  return injected[0]?.result || { combinedText: "" };
}

async function highlightPage(tabId, scamPhrases) {
  if (!scamPhrases || scamPhrases.length === 0) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    args: [scamPhrases],
    func: (phrases) => {
      const cleanPhrases = phrases
        .filter((phrase) => phrase && phrase.length > 2)
        .map((phrase) => phrase.toLowerCase());

      const elements = document.querySelectorAll(
        "p, span, h1, h2, h3, h4, a, button, label, div"
      );

      elements.forEach((element) => {
        const text = element.innerText || "";
        const lowerText = text.toLowerCase();

        const found = cleanPhrases.some((phrase) =>
          lowerText.includes(phrase)
        );

        if (found) {
          element.style.backgroundColor = "#dc2626";
          element.style.color = "white";
          element.style.padding = "2px 4px";
          element.style.borderRadius = "4px";
          element.style.outline = "2px solid #991b1b";
        }
      });
    }
  });
}
/* ---------------- RENDER RESULT ---------------- */

function renderResult(result) {
  const websiteStatus = document.getElementById("websiteStatus");
  const reasonsList = document.getElementById("reasonsList");
  const aiText = document.getElementById("text");

  const score = result.riskScore || 0;

  updateRisk(score);

  websiteStatus.textContent = result.status || "Unknown";

  if (score >= 50) {
    websiteStatus.className = "text-red-600 font-semibold mt-1 text-[30px]";
  } else if (score >= 20) {
    websiteStatus.className = "text-orange-500 font-semibold mt-1 text-[30px]";
  } else {
    websiteStatus.className = "text-green-600 font-semibold mt-1 text-[30px]";
  }

  aiText.textContent = result.summary || "No analysis available.";
  reasonsList.innerHTML = "";

  const reasons = result.reasons || [];

  if (score < 10) {
    reasonsList.innerHTML =
      "<li class='text-gray-500'>Website looks safe.</li>";
    return;
  }

  if (reasons.length === 0) {
    reasonsList.innerHTML =
      "<li class='text-gray-500'>No suspicious reasons found.</li>";
    return;
  }

  reasons.forEach((reason) => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-2";
    li.innerHTML = `<span>ΓÜá∩╕Å</span><span>${reason}</span>`;
    reasonsList.appendChild(li);
  });
}

/* ---------------- UPDATE RISK BAR ---------------- */

function updateRisk(score) {
  const riskScore = document.getElementById("riskPercentage");
  const riskBar = document.getElementById("riskBar");

  if (!riskScore || !riskBar) return;

  riskScore.textContent = score + "%";
  riskBar.style.width = score + "%";

  if (score >= 50) {
    riskBar.style.backgroundColor = "#dc2626";
  } else if (score >= 20) {
    riskBar.style.backgroundColor = "#f97316";
  } else {
    riskBar.style.backgroundColor = "#22c55e";
  }
}

/* ---------------- LOCAL ACTIVITY HISTORY ---------------- */

async function saveScanToHistory(scanResult) {
  const data = await chrome.storage.local.get(["scan_results"]);
  const history = data.scan_results || [];

  history.unshift(scanResult);

  const limitedHistory = history.slice(0, 10);

  await chrome.storage.local.set({
    scan_results: limitedHistory,
  });
}

async function loadActivityHistory() {
  const historyList = document.getElementById("historyList");

  if (!historyList) return;

  const data = await chrome.storage.local.get(["scan_results"]);
  const history = data.scan_results || [];

  historyList.innerHTML = "";

  if (history.length === 0) {
    historyList.innerHTML = `
      <p class="text-gray-500 text-sm">No analysis history yet.</p>
    `;
    return;
  }

  history.forEach((item) => {
    const color =
      item.status === "Dangerous"
        ? "text-red-500"
        : item.status === "Suspicious"
          ? "text-orange-500"
          : "text-green-600";

    const card = document.createElement("div");

    card.className =
      "activity-card border border-gray-200 rounded-2xl p-4 bg-white shadow-sm";

    card.innerHTML = `
      <div class="flex justify-between items-center gap-3">
        <div>
          <p class="font-bold text-sm break-all">${item.hostname}</p>
<p class="activity-date text-xs text-gray-500">${item.scan_date}</p>
        </div>
        <span class="${color} font-bold text-sm">${item.status}</span>
      </div>

      <div class="mt-3">
        <p class="text-sm font-semibold">Risk Score: ${item.risk_score}%</p>
<p class="activity-details text-xs text-gray-600 mt-1">
  ${item.details}
</p>
      </div>
    `;

    historyList.appendChild(card);
  });
}

function renderResult(result) {
  const score = result.riskScore || 0;

  updateRisk(score);

  websiteStatus.textContent = result.status || "Unknown";

  if (score >= 50) {
    websiteStatus.className = "text-red-600 font-semibold mt-1 text-[30px]";
  } else if (score >= 20) {
    websiteStatus.className = "text-orange-500 font-semibold mt-1 text-[30px]";
  } else {
    websiteStatus.className = "text-green-600 font-semibold mt-1 text-[30px]";
  }

  aiText.textContent = result.summary || "No analysis available.";
  reasonsList.innerHTML = "";

  const reasons = result.reasons || [];

  if (score < 10) {
    reasonsList.innerHTML = "<li class='text-gray-500'>Website looks safe.</li>";
    return;
  }

  if (reasons.length === 0) {
    reasonsList.innerHTML =
      "<li class='text-gray-500'>No suspicious reasons found.</li>";
    return;
  }

  reasons.forEach((reason) => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-2";
    li.innerHTML = `<span>⚠️</span><span>${reason}</span>`;
    reasonsList.appendChild(li);
  });
}

document.addEventListener("DOMContentLoaded", () => {
    // ---------------- EXPAND / COLLAPSE ----------------
    const content = document.getElementById("content");
    const text = document.getElementById("text");
    const expandLink = document.getElementById("expand-link");
    
  
    if (content && text && expandLink) {
      expandLink.addEventListener("click", () => {
        if (expandLink.textContent === "See More") {
          expandLink.textContent = "See Less";
          text.classList.remove("text-overflow");
        } else {
          expandLink.textContent = "See More";
          text.classList.add("text-overflow");
        }
      });
  
      // overflow detection
      if (text.scrollHeight > content.offsetHeight) {
        expandLink.style.display = "block";
      } else {
        expandLink.style.display = "none";
      }
    }
  
    // ---------------- AI BUTTON COUNT ----------------
    const display = document.getElementById("button-count");

    display.textContent = "Analyzing page...";
  
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: "GET_LAST_RESULT" },
        (response) => {
          if (chrome.runtime.lastError) {
            display.textContent = "";
            return;
          }
  
        const count = response?.suspiciousIds?.length ?? 0;  
          display.textContent = `⚠️ Suspicious buttons: ${count}`;
        }
      );
    });
  });