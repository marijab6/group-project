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

// ─── THEME TOGGLE ─────────────────────────────────────────────
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    const isDark = document.body.classList.contains("dark-mode");
    if (toggleCircle) toggleCircle.style.transform = isDark ? "translateX(24px)" : "translateX(0)";
  });
}

if (analyzeAgainBtn) analyzeAgainBtn.addEventListener("click", analyzeCurrentTab);

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {

  // Zet hostname en report count direct bij openen
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://")) {
      const hostname = new URL(tab.url).hostname;
      if (currentWebsite) currentWebsite.textContent = hostname;
      await loadReportCount(hostname);
    }
  } catch (e) {
    console.warn("Could not set hostname on load:", e);
  }

  setTimeout(analyzeCurrentTab, 800);
  setupTabs();
  setupReportButton();

  // Expand / collapse
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
    if (text.scrollHeight > content.offsetHeight) expandLink.style.display = "block";
    else expandLink.style.display = "none";
  }

  // Suspicious button count
  const display = document.getElementById("button-count");
  if (display) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: "GET_LAST_RESULT" }, (response) => {
        if (chrome.runtime.lastError) { display.textContent = ""; return; }
        const count = response?.suspiciousIds?.length ?? 0;
        display.textContent = `⚠️ Suspicious buttons: ${count}`;
      });
    });
  }
});

// ─── TABS ─────────────────────────────────────────────────────
function setupTabs() {
  const overviewBtn = document.getElementById("overviewBtn");
  const activityBtn = document.getElementById("activityBtn");
  const overviewTab = document.getElementById("overviewTab");
  const activityTab = document.getElementById("activityTab");
  if (!overviewBtn || !activityBtn) return;

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

// ─── REPORT BUTTON ────────────────────────────────────────────
function setupReportButton() {
  const reportBtn = document.getElementById("reportBtn");
  if (!reportBtn) return;

  reportBtn.addEventListener("click", async () => {
    try {
      reportBtn.disabled = true;
      reportBtn.textContent = "Reporting...";

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) throw new Error("No tab found");

      const hostname = new URL(tab.url).hostname;
      const currentScore = parseInt(riskScore?.textContent) || 0;
      const currentStatus = websiteStatus?.textContent || "Unknown";
      const userId = await getOrCreateUserId();

      const response = await fetch("http://localhost:3000/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: tab.url,
          hostname,
          risk_score: currentScore,
          status: currentStatus,
          user_id: userId,
        }),
      });

      if (!response.ok) throw new Error("Server error");

      const data = await response.json();
      console.log("Report response:", data);

      // ✅ Update teller direct in de popup
      const reportCountEl = document.getElementById("reportCount");
      if (reportCountEl && data.total_reports !== undefined) {
        reportCountEl.textContent = `Reported users: ${data.total_reports}`;
      }

      reportBtn.textContent = "✓ Reported!";
      reportBtn.style.backgroundColor = "#16a34a";

    } catch (error) {
      console.error("Report failed:", error);
      reportBtn.disabled = false;
      reportBtn.textContent = "Report Website";
      alert("Report failed. Make sure the server is running (npm start).");
    }
  });
}

// ─── ANONYMOUS USER ID ────────────────────────────────────────
async function getOrCreateUserId() {
  const data = await chrome.storage.local.get(["redflag_user_id"]);
  if (data.redflag_user_id) return data.redflag_user_id;
  const newId = "user_" + crypto.randomUUID();
  await chrome.storage.local.set({ redflag_user_id: newId });
  return newId;
}

// ─── LOAD REPORT COUNT ────────────────────────────────────────
async function loadReportCount(hostname) {
  try {
    const response = await fetch(`http://localhost:3000/report-count?hostname=${encodeURIComponent(hostname)}`);
    const data = await response.json();
    console.log("loadReportCount response:", data);
    const reportCountEl = document.getElementById("reportCount");
    if (reportCountEl) reportCountEl.textContent = `Reported users: ${data.total_reports || 0}`;
  } catch (e) {
    console.warn("Could not load report count:", e);
  }
}

// ─── ANALYZE CURRENT TAB ──────────────────────────────────────
async function analyzeCurrentTab() {
  try {
    if (websiteStatus) websiteStatus.textContent = "Checking...";
    if (aiText) aiText.textContent = "Analyzing webpage...";
    if (reasonsList) reasonsList.innerHTML = "<li class='text-gray-500'>Checking...</li>";
    updateRisk(0);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url) throw new Error("No active tab found.");

    if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://")) {
      throw new Error("RedFlag cannot scan browser system pages.");
    }

    const hostname = new URL(tab.url).hostname;
    if (currentWebsite) currentWebsite.textContent = hostname;

    await waitForPageReady(tab.id);
    const pageData = await getPageData(tab.id);

    const result = await chrome.runtime.sendMessage({
      type: "ANALYZE_WEBSITE",
      url: tab.url,
      pageText: pageData.combinedText,
    });

    if (!result) throw new Error("No result from background.js");

    renderResult(result);

    await saveScanToHistory({
      site_url: tab.url,
      hostname,
      risk_score: result.riskScore || 0,
      status: result.status || "Unknown",
      details: result.summary || "No analysis available.",
      scan_date: new Date().toLocaleString(),
    });

    await highlightPage(tab.id, result.scamPhrases || []);

  } catch (error) {
    console.error("Popup error:", error);
    if (websiteStatus) {
      websiteStatus.textContent = "Error";
      websiteStatus.className = "text-red-600 font-semibold mt-1 text-[30px]";
    }
    if (aiText) aiText.textContent = error.message;
    if (reasonsList) reasonsList.innerHTML = "<li>⚠️ Extension failed.</li>";
    updateRisk(0);
  }
}

// ─── WAIT FOR PAGE ────────────────────────────────────────────
async function waitForPageReady(tabId) {
  for (let i = 0; i < 5; i++) {
    try {
      const injected = await chrome.scripting.executeScript({ target: { tabId }, func: () => document.readyState });
      if (injected[0]?.result === "complete" || injected[0]?.result === "interactive") return;
    } catch (e) { console.warn("Waiting:", e.message); }
    await new Promise(r => setTimeout(r, 500));
  }
}

// ─── GET PAGE DATA ────────────────────────────────────────────
async function getPageData(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const visibleText = Array.from(document.querySelectorAll("h1,h2,h3,h4,p,a,button,label,span,input,textarea,div"))
        .map(el => el.innerText || el.value || "").filter(t => t.trim().length > 2).join(" ");
      const imageText = Array.from(document.images).map(img => [img.alt||"",img.title||"",img.src||""].join(" ")).join(" ");
      const linkText = Array.from(document.links).map(a => [a.innerText||"",a.href||""].join(" ")).join(" ");
      return { combinedText: `${visibleText} ${imageText} ${linkText}`.slice(0, 10000) };
    },
  });
  return injected[0]?.result || { combinedText: "" };
}

// ─── HIGHLIGHT PAGE ───────────────────────────────────────────
async function highlightPage(tabId, scamPhrases) {
  if (!scamPhrases || scamPhrases.length === 0) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [scamPhrases],
    func: (phrases) => {
      const clean = phrases.filter(p => p && p.length > 2).map(p => p.toLowerCase());
      document.querySelectorAll("p,span,h1,h2,h3,h4,a,button,label,div").forEach(el => {
        if (clean.some(phrase => (el.innerText||"").toLowerCase().includes(phrase))) {
          el.style.backgroundColor = "#dc2626";
          el.style.color = "white";
          el.style.padding = "2px 4px";
          el.style.borderRadius = "4px";
        }
      });
    },
  });
}

// ─── RENDER RESULT ────────────────────────────────────────────
function renderResult(result) {
  const score = result.riskScore || 0;
  updateRisk(score);

  if (websiteStatus) {
    websiteStatus.textContent = result.status || "Unknown";
    websiteStatus.className = score >= 50
      ? "text-red-600 font-semibold mt-1 text-[30px]"
      : score >= 20
      ? "text-orange-500 font-semibold mt-1 text-[30px]"
      : "text-green-600 font-semibold mt-1 text-[30px]";
  }

  if (aiText) aiText.textContent = result.summary || "No analysis available.";
  if (reasonsList) {
    reasonsList.innerHTML = "";
    const reasons = result.reasons || [];
    if (score < 10) { reasonsList.innerHTML = "<li class='text-gray-500'>Website looks safe.</li>"; return; }
    if (reasons.length === 0) { reasonsList.innerHTML = "<li class='text-gray-500'>No suspicious reasons found.</li>"; return; }
    reasons.forEach((reason) => {
      const li = document.createElement("li");
      li.className = "flex items-center gap-2";
      li.innerHTML = `<span>⚠️</span><span>${reason}</span>`;
      reasonsList.appendChild(li);
    });
  }
}

// ─── UPDATE RISK BAR ──────────────────────────────────────────
function updateRisk(score) {
  if (!riskScore || !riskBar) return;
  riskScore.textContent = score + "%";
  riskBar.style.width = score + "%";
  riskBar.style.backgroundColor = score >= 50 ? "#dc2626" : score >= 20 ? "#f97316" : "#22c55e";
}

// ─── LOCAL ACTIVITY HISTORY ───────────────────────────────────
async function saveScanToHistory(scanResult) {
  const data = await chrome.storage.local.get(["scan_results"]);
  const history = data.scan_results || [];
  history.unshift(scanResult);
  await chrome.storage.local.set({ scan_results: history.slice(0, 10) });
}

async function loadActivityHistory() {
  const historyList = document.getElementById("historyList");
  if (!historyList) return;
  const data = await chrome.storage.local.get(["scan_results"]);
  const history = data.scan_results || [];
  historyList.innerHTML = "";
  if (history.length === 0) {
    historyList.innerHTML = `<p class="text-gray-500 text-sm">No analysis history yet.</p>`;
    return;
  }
  history.forEach((item) => {
    const color = item.status === "Dangerous" ? "text-red-500" : item.status === "Suspicious" ? "text-orange-500" : "text-green-600";
    const card = document.createElement("div");
    card.className = "activity-card border border-gray-200 rounded-2xl p-4 bg-white shadow-sm";
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
        <p class="activity-details text-xs text-gray-600 mt-1">${item.details}</p>
      </div>`;
    historyList.appendChild(card);
  });
}