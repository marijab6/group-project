console.log("RedFlag content script loaded");

const content = document.getElementById("content");
const text = document.getElementById("text");
const expandLink = document.getElementById("expand-link");

expandLink.addEventListener("click", (event) => {
  if (expandLink.textContent === "See More") {
    expandLink.textContent = "See Less";
    text.classList.remove("text-overflow");
  } else {
    expandLink.textContent = "See More";
    text.classList.add("text-overflow");
  }
});

// How to detect if text is overflowing / ellipsis are active?

if (text.scrollHeight > content?.offsetHeight) {
   expandLink.style.display = "block";
} else {
   expandLink.style.display = "none";
}

// Dark mode toggle
document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById("themeToggle");
  const toggleCircle = document.getElementById("toggleCircle");

  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");

    const isDark = document.body.classList.contains("dark-mode");

    if (toggleCircle) {
      toggleCircle.style.transform = isDark
        ? "translateX(24px)"
        : "translateX(0)";
    }
  });
});