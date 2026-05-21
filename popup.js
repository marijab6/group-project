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
  
    // ---------------- DARK MODE ----------------
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
  
    // ---------------- AI BUTTON COUNT ----------------
    const display = document.getElementById("button-count");

    display.textContent = "Analyzing page...";
  
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: "GET_LAST_RESULT" },
        (response) => {
          if (chrome.runtime.lastError) {
            display.textContent = "Open a normal website and refresh";
            return;
          }
  
          const count = response?.suspiciousIndexes?.length ?? 0;
  
          display.textContent = `⚠️ Suspicious buttons: ${count}`;
        }
      );
    });
  });