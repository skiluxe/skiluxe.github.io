// Language persistence + small UI helpers shared across pages.
const CFG = window.SKILUXE_CONFIG || { lang: "en" };

function persistLang() {
  try { localStorage.setItem("skiluxe.lang", CFG.lang); } catch (e) {}
}
persistLang();

// Lang switcher dropdown
document.querySelectorAll(".lang-switcher").forEach((wrap) => {
  const btn = wrap.querySelector(".lang-switcher__btn");
  const menu = wrap.querySelector(".lang-switcher__menu");
  if (!btn || !menu) return;
  const close = () => {
    btn.setAttribute("aria-expanded", "false");
    menu.hidden = true;
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!open));
    menu.hidden = open;
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
});

// Mobile nav toggle
const navToggle = document.querySelector(".nav-toggle");
const header = document.querySelector(".site-header");
if (navToggle && header) {
  navToggle.addEventListener("click", () => {
    const open = header.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
}
