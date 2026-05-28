
console.log("🔥 RedFlag background running");

// =====================================================
// MAIN MESSAGE HANDLER
// =====================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // =========================================
  // WEBSITE ANALYSIS
  // =========================================

  if (request.type === "ANALYZE_WEBSITE") {

    fetch("http://localhost:3000/analyze", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        url: request.url,
        pageText: request.pageText || "",
        pageSignals: request.pageSignals || {}
      })
    })

    .then(async (response) => {

      if (!response.ok) {
        throw new Error("Backend request failed");
      }

      return response.json();
    })

    .then((data) => {

      console.log("✅ Backend analysis:", data);

      sendResponse(data);
    })

    .catch((error) => {

      console.error("❌ Backend error:", error);

      sendResponse({
        score: 0,
        status: "Safe",
        reasons: [],
        explanation: "Backend server unavailable",
        source: "fallback"
      });
    });

    return true;
  }

});
