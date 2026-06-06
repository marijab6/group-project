console.log("RedFlag fast warning loaded");

function getFastRiskResult() {
  let score = 0;
  const reasons = [];

  const url = window.location.href.toLowerCase();
  const hostname = window.location.hostname.toLowerCase();
  const pageText = document.body.innerText.toLowerCase();

  if (window.location.protocol === "http:") {
    score += 25;
    reasons.push("Website does not use HTTPS");
  }

  if (hostname.includes("-")) {
    score += 10;
    reasons.push("Domain contains dashes");
  }

  if (hostname.length > 35) {
    score += 15;
    reasons.push("Very long domain name");
  }

  if (url.length > 120) {
    score += 15;
    reasons.push("Very long URL");
  }

  const riskyTlds = [".xyz", ".top", ".click", ".info", ".shop"];

  if (riskyTlds.some((tld) => hostname.endsWith(tld))) {
    score += 20;
    reasons.push("Suspicious domain extension");
  }

  const suspiciousWords = [
    "urgent",
    "account suspended",
    "verify your account",
    "confirm your identity",
    "limited time",
    "act now",
    "claim prize",
    "free money",
    "seed phrase",
    "recovery phrase",
    "gift card",
    "crypto giveaway",
  ];

  const foundWords = suspiciousWords.filter((word) =>
    pageText.includes(word)
  );

  if (foundWords.length >= 1) {
    score += 15;
    reasons.push("Suspicious wording detected");
  }

  if (foundWords.length >= 3) {
    score += 20;
    reasons.push("Multiple scam-related phrases detected");
  }

  if (
    document.querySelector('input[type="password"]') &&
    foundWords.length >= 1
  ) {
    score += 20;
    reasons.push("Login form combined with suspicious wording");
  }

  score = Math.min(score, 100);

  let status = "Safe";
  if (score > 20 && score < 50) status = "Suspicious";
  if (score >= 50) status = "Dangerous";

  return {
    score,
    status,
    reasons,
    explanation:
      score >= 50
        ? "This page shows multiple high-risk scam or phishing indicators."
        : "This page shows suspicious indicators. Be careful before entering personal information.",
  };
}

function showRedFlagWarning(result) {
  if (document.getElementById("redflag-warning-popup")) return;

  const isDangerous = result.score >= 50;
  const color = isDangerous ? "#dc2626" : "#f97316";
  const title = isDangerous
    ? "Dangerous website detected"
    : "Suspicious website detected";

  const popup = document.createElement("div");
  popup.id = "redflag-warning-popup";

  popup.innerHTML = `
    <div style="
      position: fixed;
      top: 18px;
      right: 18px;
      width: 300px;
      background: #111827;
      color: white;
      border: 2px solid ${color};
      border-radius: 16px;
      padding: 16px;
      z-index: 2147483647;
      font-family: Arial, sans-serif;
      box-shadow: 0 12px 35px rgba(0,0,0,0.45);
    ">
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
      ">
        <strong style="color:${color}; font-size:16px;">
          🚩 RedFlag
        </strong>

        <button id="redflag-close-warning" style="
          background: transparent;
          color: white;
          border: none;
          font-size: 20px;
          cursor: pointer;
        ">×</button>
      </div>

      <p style="margin: 12px 0 6px; font-size: 15px; font-weight: bold;">
        ${title}
      </p>

      <p style="margin: 0 0 8px; font-size: 14px;">
        Risk score: <strong>${result.score}%</strong>
      </p>

      <p style="margin: 0; font-size: 13px; color: #d1d5db; line-height: 1.4;">
        ${result.explanation}
      </p>

      <ul style="
        margin: 10px 0 0;
        padding-left: 18px;
        font-size: 12px;
        color: #e5e7eb;
      ">
        ${result.reasons
          .slice(0, 3)
          .map((reason) => `<li>${reason}</li>`)
          .join("")}
      </ul>
    </div>
  `;

  document.body.appendChild(popup);

  document
    .getElementById("redflag-close-warning")
    .addEventListener("click", () => {
      popup.remove();
    });
}

setTimeout(() => {
  const result = getFastRiskResult();

  if (result.score > 20) {
    showRedFlagWarning(result);
  }
}, 800);