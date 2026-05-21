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