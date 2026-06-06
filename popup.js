console.log("RedFlag popup loaded");

// =====================================================
// ELEMENTS
// =====================================================

const currentWebsite = document.getElementById("currentWebsite");
const websiteStatus = document.getElementById("websiteStatus");
const riskBar = document.getElementById("riskBar");
const riskScore = document.getElementById("riskPercentage");
const reasonsList = document.getElementById("reasonsList");
const aiText = document.getElementById("text");

const analyzeAgainBtn = document.getElementById("analyzeAgainBtn");
const reportBtn = document.getElementById("reportBtn");
const reportCount = document.getElementById("reportCount");
const overviewBtn = document.getElementById("overviewBtn");
const activityBtn = document.getElementById("activityBtn");
const overviewTab = document.getElementById("overviewTab");
const activityTab = document.getElementById("activityTab");
const historyList = document.getElementById("historyList");

const themeToggle = document.getElementById("themeToggle");
const toggleCircle = document.getElementById("toggleCircle");

const SCAN_HISTORY_KEY = "redflag_scan_history";
const REPORTS_KEY = "redflag_reports";

// =====================================================
// THEME TOGGLE
// =====================================================

// ─── THEME TOGGLE ─────────────────────────────────────────────
if (themeToggle) {
  themeToggle.addEventListener("click", () => {

    document.body.classList.toggle("dark-mode");

    const isDark =
      document.body.classList.contains("dark-mode");

    if (toggleCircle) {
      toggleCircle.style.transform = isDark
        ? "translateX(24px)"
        : "translateX(0)";
    }
  });
}

// =====================================================
// ANALYZE BUTTON
// =====================================================

if (analyzeAgainBtn) {
  analyzeAgainBtn.addEventListener(
    "click",
    analyzeCurrentTab
  );
}

if (reportBtn) {
  reportBtn.addEventListener(
    "click",
    reportCurrentWebsite
  );
}

if (overviewBtn && activityBtn) {
  overviewBtn.addEventListener("click", () => {
    showTab("overview");
  });

  activityBtn.addEventListener("click", () => {
    showTab("activity");
  });
}

// =====================================================
// INITIAL LOAD
// =====================================================

document.addEventListener("DOMContentLoaded", () => {

  setTimeout(() => {
    analyzeCurrentTab();
    setupExpandLogic();
    loadButtonCount();
    loadReportCount();
    loadHistory();
  }, 800);

});

// =====================================================
// MAIN ANALYSIS
// =====================================================

async function analyzeCurrentTab() {

  try {

    // loading state

    websiteStatus.textContent = "Checking...";
    aiText.textContent = "Analyzing webpage...";
    reasonsList.innerHTML =
      "<li class='text-gray-500'>Scanning website...</li>";

    updateRisk(0);

    // get active tab

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab || !tab.id || !tab.url) {
      throw new Error("No active tab found.");
    }

    // block browser pages

    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("chrome-extension://")
    ) {
      throw new Error(
        "RedFlag cannot scan browser system pages."
      );
    }

    // show domain

    currentWebsite.textContent =
      new URL(tab.url).hostname;

    // wait page ready

    await waitForPageReady(tab.id);

    // collect page data

    const pageData =
      await getPageData(tab.id);

    const parsedUrl =
      new URL(tab.url);

    // signals

    const pageSignals = {

      protocol: parsedUrl.protocol,

      hostname: parsedUrl.hostname,

      hasDashInDomain:
        parsedUrl.hostname.includes("-"),

      domainLength:
        parsedUrl.hostname.length,
        internalLinks: pageData.internalLinks || [],

      urlLength:
        tab.url.length,

      hasPasswordField:
        pageData.hasPasswordField,

      hasUrgencyWords:
        pageData.hasUrgencyWords
    };

    // send to background

    const result =
      await chrome.runtime.sendMessage({

        type: "ANALYZE_WEBSITE",

        url: tab.url,

        pageText: pageData.combinedText,

        pageSignals
      });

    if (!result) {
      throw new Error(
        "No result received from background."
      );
    }

    // render UI

    renderResult(result);

    await saveScanToHistory({
      site_url: tab.url,
      hostname: parsedUrl.hostname,
      risk_score: result.riskScore || result.score || 0,
      status: result.status || "Unknown",
      details:
        result.summary ||
        result.explanation ||
        "No analysis available.",
      scan_date: new Date().toLocaleString(),
    });

    await loadHistory();

    // highlight scam phrases

if ((result.score || 0) > 20) {
const phrasesToHighlight = [
  ...(result.scamPhrases || []),
  ...(result.reasons || [])
];

await highlightPage(
  tab.id,
  phrasesToHighlight,
  result.score || 0
);}

  } catch (error) {

    console.error("Popup error:", error);

    websiteStatus.textContent = "Error";

    websiteStatus.className =
      "text-red-600 font-semibold mt-1 text-[30px]";

    aiText.textContent =
      error.message || "Unknown error.";

    reasonsList.innerHTML =
      "<li>⚠️ Extension failed.</li>";

    updateRisk(0);
  }
}

// =====================================================
// WAIT PAGE READY
// =====================================================

// =====================================================
// WAIT PAGE READY
// =====================================================

// ─── WAIT FOR PAGE ────────────────────────────────────────────
async function waitForPageReady(tabId) {

  for (let i = 0; i < 5; i++) {

    try {

      const injected =
        await chrome.scripting.executeScript({

          target: { tabId },

          func: () => document.readyState
        });

      const state =
        injected[0]?.result;

      if (
        state === "complete" ||
        state === "interactive"
      ) {
        return;
      }

    } catch (error) {

      console.warn(
        "Waiting for page:",
        error.message
      );
    }

    await new Promise(resolve =>
      setTimeout(resolve, 500)
    );
  }
}

// =====================================================
// COLLECT PAGE DATA
// =====================================================

// =====================================================
// COLLECT PAGE DATA
// =====================================================

// ─── GET PAGE DATA ────────────────────────────────────────────
async function getPageData(tabId) {

  const injected =
    await chrome.scripting.executeScript({

      target: { tabId },

      func: () => {

        const textElements =
          document.querySelectorAll(
            "h1,h2,h3,h4,p,a,button,label,span,input,textarea,div"
          );

        const visibleText =
          Array.from(textElements)

            .map(el =>
              el.innerText ||
              el.value ||
              ""
            )

            .filter(text =>
              text.trim().length > 2
            )

            .join(" ");

        // password fields

        const hasPasswordField =
          document.querySelectorAll(
            'input[type="password"]'
          ).length > 0;

        // urgency words

        const urgencyWords = [

          "verify",
          "urgent",
          "suspended",
          "confirm",
          "secure account",
          "immediately",
          "limited time",
          "act now",
          "login required"
        ];

        const hasUrgencyWords =
          urgencyWords.some(word =>
            visibleText
              .toLowerCase()
              .includes(word)
          );

        // image metadata

        const imageText =
          Array.from(document.images)

            .map(img => {

              return [

                img.alt || "",
                img.title || "",
                img.src || "",
                img.currentSrc || ""

              ].join(" ");

            })

            .join(" ");

        // links

        const linkText =
          Array.from(document.links)

            .map(a => {

              return [

                a.innerText || "",
                a.href || ""

              ].join(" ");

            })

            .join(" ");
const internalLinks =
  Array.from(document.links)
    .map(a => a.href)
    .filter(href =>
      href.startsWith(location.origin)
    )
    .slice(0, 20);
        return {

          combinedText:
            `${visibleText} ${imageText} ${linkText}`
              .replace(/\s+/g, " ")
              .slice(0, 12000),

          hasPasswordField,

          hasUrgencyWords,
          internalLinks
        };
      }
    });
    

  return injected[0]?.result || {
    combinedText: ""
  };
}

// =====================================================
// HIGHLIGHT SCAM PHRASES
// =====================================================

async function highlightPage(tabId, scamPhrases, score) {
  if (!scamPhrases || !scamPhrases.length) return;
  if (score <= 20) return;

  const color = score >= 50 ? "#dc2626" : "#f97316";

  await chrome.scripting.executeScript({
    target: { tabId },
    args: [scamPhrases, color],
    func: (phrases, color) => {
      const cleanPhrases = phrases
        .filter(p => p && p.length > 2)
        .map(p => p.toLowerCase());

      const elements = document.querySelectorAll(
        "p,span,h1,h2,h3,h4,a,button,label,div"
      );

      elements.forEach(element => {
        const text = element.innerText || "";
        const lower = text.toLowerCase();

        const found = cleanPhrases.some(phrase =>
          lower.includes(phrase)
        );

        if (found) {
          element.style.backgroundColor = color;
          element.style.color = "white";
          element.style.padding = "2px 4px";
          element.style.borderRadius = "4px";
        }
      });
    }
  });
}

// =====================================================
// HISTORY / REPORTS
// =====================================================

function storageGet(defaults) {
  return new Promise(resolve => {
    chrome.storage.local.get(defaults, resolve);
  });
}

function storageSet(data) {
  return new Promise(resolve => {
    chrome.storage.local.set(data, resolve);
  });
}

async function saveScanToHistory(scan) {
  const data =
    await storageGet({
      [SCAN_HISTORY_KEY]: []
    });

  const history =
    data[SCAN_HISTORY_KEY] || [];

  history.unshift(scan);

  await storageSet({
    [SCAN_HISTORY_KEY]: history.slice(0, 25)
  });
}

async function loadHistory() {
  if (!historyList) return;

  const data =
    await storageGet({
      [SCAN_HISTORY_KEY]: []
    });

  const history =
    data[SCAN_HISTORY_KEY] || [];

  if (!history.length) {
    historyList.innerHTML = `
      <p class="text-gray-500 text-sm">
        No analysis history yet.
      </p>
    `;
    return;
  }

  historyList.innerHTML = "";

  history.forEach(item => {
    const row =
      document.createElement("div");

    row.className =
  "activity-card";
row.innerHTML = `
  <div class="activity-top">
    <div>
      <strong class="activity-domain">${item.hostname}</strong>
      <p class="activity-date">${item.scan_date}</p>
    </div>
    <span class="activity-status ${item.status.toLowerCase()}">
      ${item.status}
    </span>
  </div>

  <p class="activity-score">Risk Score: ${item.risk_score}%</p>
  <p class="activity-details">${item.details || "No analysis available."}</p>
`;

    historyList.appendChild(row);
  });
}

async function loadReportCount() {
  if (!reportCount) return;

  const hostname =
    await getActiveHostname();

  if (!hostname) {
    reportCount.textContent =
      "Reported users: 0";
    return;
  }

  const data =
    await storageGet({
      [REPORTS_KEY]: {}
    });

  const reports =
    data[REPORTS_KEY] || {};

  reportCount.textContent =
    `Reported users: ${reports[hostname] || 0}`;
}

async function reportCurrentWebsite() {
  const hostname =
    await getActiveHostname();

  if (!hostname) return;

  const data =
    await storageGet({
      [REPORTS_KEY]: {}
    });

  const reports =
    data[REPORTS_KEY] || {};

  reports[hostname] =
    (reports[hostname] || 0) + 1;

  await storageSet({
    [REPORTS_KEY]: reports
  });

  await loadReportCount();
}

async function getActiveHostname() {
  const [tab] =
    await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

  if (!tab?.url) return "";

  try {
    return new URL(tab.url).hostname;
  } catch (error) {
    return "";
  }
}

function showTab(tabName) {
  if (!overviewTab || !activityTab) return;

  const showActivity =
    tabName === "activity";

  overviewTab.classList.toggle(
    "hidden",
    showActivity
  );

  activityTab.classList.toggle(
    "hidden",
    !showActivity
  );
}

// =====================================================
// RENDER RESULTS
// =====================================================

function renderResult(result) {

  const score =
    result.riskScore ||
    result.score ||
    0;

  updateRisk(score);

  // status

  websiteStatus.textContent =
    result.status || "Unknown";

  if (score >= 50) {

    websiteStatus.className =
      "text-red-600 font-semibold mt-1 text-[30px]";

  } else if (score > 20) {

    websiteStatus.className =
      "text-orange-500 font-semibold mt-1 text-[30px]";

  } else {

    websiteStatus.className =
      "text-green-600 font-semibold mt-1 text-[30px]";
  }

  // AI analysis

  aiText.textContent =

    result.summary ||
    result.explanation ||
    "No AI analysis available.";

  // reasons
const expandLink = document.getElementById("expand-link");

setTimeout(() => {
  if (!expandLink) return;

  if (aiText.scrollHeight > aiText.clientHeight) {
    expandLink.classList.remove("hidden");
    expandLink.style.display = "block";
  } else {
    expandLink.classList.add("hidden");
    expandLink.style.display = "none";
  }
}, 100);
  reasonsList.innerHTML = "";

  const reasons =
    result.reasons || [];

  if (score < 10) {

    reasonsList.innerHTML = `
      <li class='text-gray-500'>
        Website appears safe.
      </li>
    `;

    return;
  }

  if (!reasons.length) {

    reasonsList.innerHTML = `
      <li class='text-gray-500'>
        No suspicious indicators detected.
      </li>
    `;

    return;
  }

  reasons.forEach(reason => {

    const li =
      document.createElement("li");

    li.className =
      "flex items-center gap-2";

    li.innerHTML = `
      <span>⚠️</span>
      <span>${reason}</span>
    `;

    reasonsList.appendChild(li);
  });
}

// =====================================================
// UPDATE RISK BAR
// =====================================================

function updateRisk(score) {

  riskScore.textContent =
    score + "%";

  riskBar.style.width =
    score + "%";

  if (score >= 50) {

    riskBar.style.backgroundColor =
      "#dc2626";

  } else if (score > 20) {

    riskBar.style.backgroundColor =
      "#f97316";

  } else {

    riskBar.style.backgroundColor =
      "#22c55e";
  }
}

// =====================================================
// EXPAND / COLLAPSE AI TEXT
// =====================================================

function setupExpandLogic() {

  const content =
    document.getElementById("content");

  const text =
    document.getElementById("text");

  const expandLink =
    document.getElementById("expand-link");

  if (
    !content ||
    !text ||
    !expandLink
  ) return;

  expandLink.addEventListener(
    "click",
    () => {

      if (
        expandLink.textContent ===
        "See More"
      ) {

        expandLink.textContent =
          "See Less";

        text.classList.remove(
          "text-overflow"
        );

      } else {

        expandLink.textContent =
          "See More";

        text.classList.add(
          "text-overflow"
        );
      }
    }
  );

  if (
    text.scrollHeight >
    content.offsetHeight
  ) {

    expandLink.style.display =
      "block";

  } else {

    expandLink.style.display =
      "none";
  }
}

// =====================================================
// BUTTON COUNT
// =====================================================

function loadButtonCount() {

  const display =
    document.getElementById(
      "button-count"
    );

  if (!display) return;

  display.textContent =
    "Analyzing buttons...";

  chrome.tabs.query({

    active: true,
    currentWindow: true

  }, tabs => {

    if (!tabs?.length) return;

    chrome.tabs.sendMessage(

      tabs[0].id,

      {
        type: "GET_LAST_RESULT"
      },

      response => {

        if (
          chrome.runtime.lastError
        ) {

          display.textContent = "";
          return;
        }

        const count =
          response
            ?.suspiciousIds
            ?.length || 0;

        display.textContent =
          `⚠️ Suspicious buttons: ${count}`;
      }
    );
  });
}
