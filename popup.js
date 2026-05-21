console.log("RedFlag popup loaded");

const currentWebsite = document.getElementById("currentWebsite");
const websiteStatus = document.getElementById("websiteStatus");
const riskBar = document.getElementById("riskBar");
const riskScore = document.getElementById("riskScore");
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
});

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

function updateRisk(score) {
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