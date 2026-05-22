console.log("RedFlag content script loaded");

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
