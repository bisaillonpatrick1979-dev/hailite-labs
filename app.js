const state = {
  lang: localStorage.getItem("hailite-lang") || "fr"
};

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

function setLanguage(lang){
  state.lang = lang;
  localStorage.setItem("hailite-lang", lang);
  document.body.classList.toggle("en", lang === "en");
  document.documentElement.lang = lang;
  const toggle = $("#langToggle");
  if(toggle){
    toggle.innerHTML = lang === "fr" ? 'FR <span>/</span> EN' : 'EN <span>/</span> FR';
  }
}

let toastTimer;
function showToast(message){
  const el = $("#toast");
  if(!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

$("#langToggle")?.addEventListener("click", () => {
  setLanguage(state.lang === "fr" ? "en" : "fr");
});

$$(".notify-btn").forEach(btn => btn.addEventListener("click", () => {
  document.querySelector("#contact")?.scrollIntoView({behavior:"smooth"});
  setTimeout(() => $("#newsletterForm input")?.focus(), 500);
}));

$("#newsletterForm")?.addEventListener("submit", e => {
  e.preventDefault();
  e.currentTarget.reset();
  showToast(state.lang === "fr"
    ? "Merci! On vous préviendra des prochains lancements."
    : "Thanks! We'll keep you posted on upcoming launches.");
});

setLanguage(state.lang);
