// Hailite Labs — interactions du site (langue, menu mobile, infolettre)

// Lecture/écriture sécuritaire du stockage local (peut être bloqué en navigation privée)
const memoire = {
  lire(cle) { try { return localStorage.getItem(cle); } catch { return null; } },
  ecrire(cle, valeur) { try { localStorage.setItem(cle, valeur); } catch { /* ignoré */ } },
};

const state = {
  lang: memoire.lire("hailite-lang") === "en" ? "en" : "fr",
};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// ---------- Langue FR / EN ----------
function setLanguage(lang) {
  state.lang = lang;
  memoire.ecrire("hailite-lang", lang);
  const html = document.documentElement;
  html.classList.toggle("en", lang === "en");
  html.lang = lang === "en" ? "en" : "fr";

  const toggle = $("#langToggle");
  if (toggle) {
    toggle.innerHTML = lang === "fr" ? "FR <span>/</span> EN" : "EN <span>/</span> FR";
    toggle.setAttribute("aria-label", lang === "fr" ? "Switch to English" : "Passer en français");
  }
  const menuBtn = $("#menuBtn");
  if (menuBtn) menuBtn.setAttribute("aria-label", lang === "fr" ? "Menu" : "Menu");

  // Le formulaire transmet la langue choisie
  const champLangue = $("#newsletterForm input[name='langue']");
  if (champLangue) champLangue.value = lang;

  document.title = lang === "fr"
    ? "Hailite Labs — Des idées utiles. Une touche de futur."
    : "Hailite Labs — Useful ideas. A touch of future.";
}

$("#langToggle")?.addEventListener("click", () => {
  setLanguage(state.lang === "fr" ? "en" : "fr");
});

// ---------- Menu mobile ----------
const menuBtn = $("#menuBtn");
const nav = $("#mainNav");

function fermerMenu() {
  nav?.classList.remove("open");
  menuBtn?.setAttribute("aria-expanded", "false");
}

menuBtn?.addEventListener("click", () => {
  const ouvert = nav.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(ouvert));
});

// Ferme le menu quand on choisit une section ou qu'on appuie sur Échap
$$("#mainNav a").forEach(a => a.addEventListener("click", fermerMenu));
document.addEventListener("keydown", e => { if (e.key === "Escape") fermerMenu(); });

// ---------- Petit message flottant ----------
let toastTimer;
function showToast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

// ---------- Infolettre ----------
const MESSAGES = {
  fr: {
    invalide: "Entrez une adresse courriel valide.",
    consentement: "Cochez la case de consentement pour vous inscrire.",
    envoi: "Inscription en cours…",
    succes: "Merci! On vous préviendra des prochains lancements.",
    erreur: "Oups, l'inscription n'a pas fonctionné. Réessayez ou écrivez à contact@hailitelabs.com.",
  },
  en: {
    invalide: "Please enter a valid email address.",
    consentement: "Please check the consent box to subscribe.",
    envoi: "Subscribing…",
    succes: "Thanks! We'll keep you posted on upcoming launches.",
    erreur: "Oops, that didn't work. Try again or write to contact@hailitelabs.com.",
  },
};

const form = $("#newsletterForm");
const statut = $("#formStatus");

function afficherStatut(texte, type) {
  if (!statut) return;
  statut.textContent = texte;
  statut.dataset.type = type || "";
}

form?.addEventListener("submit", async e => {
  e.preventDefault();
  const t = MESSAGES[state.lang];
  const champCourriel = form.elements.courriel;
  const champConsent = form.elements.consentement;

  if (!champCourriel.value.trim() || !champCourriel.checkValidity()) {
    afficherStatut(t.invalide, "erreur");
    champCourriel.focus();
    return;
  }
  if (!champConsent.checked) {
    afficherStatut(t.consentement, "erreur");
    champConsent.focus();
    return;
  }

  const bouton = form.querySelector("button[type='submit']");
  bouton.disabled = true;
  afficherStatut(t.envoi, "");

  try {
    const reponse = await fetch("/api/inscription", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        courriel: champCourriel.value.trim(),
        consentement: true,
        langue: state.lang,
        source: form.elements.source.value,
        site_web: form.elements.site_web.value,
      }),
    });
    const donnees = await reponse.json().catch(() => ({}));
    if (!reponse.ok || !donnees.ok) {
      afficherStatut(donnees.erreur === "courriel_invalide" ? t.invalide : t.erreur, "erreur");
      return;
    }
    form.reset();
    form.elements.langue.value = state.lang;
    afficherStatut(t.succes, "succes");
    showToast(t.succes);
  } catch {
    afficherStatut(t.erreur, "erreur");
  } finally {
    bouton.disabled = false;
  }
});

// Année courante dans le pied de page
const annee = $("#annee");
if (annee) annee.textContent = String(new Date().getFullYear());

setLanguage(state.lang);
