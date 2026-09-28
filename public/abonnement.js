// Hailite Labs — boutons d'abonnement (page Hailite Manager) et page de bienvenue

(() => {
  const langue = () => (document.documentElement.classList.contains("en") ? "en" : "fr");
  const texte = (fr, en) => (langue() === "en" ? en : fr);

  // ---------- Page des forfaits : bouton → Stripe Checkout ----------
  const statut = document.getElementById("achatStatut");
  document.querySelectorAll(".pm-buy").forEach(bouton => {
    bouton.addEventListener("click", async () => {
      const boutons = document.querySelectorAll(".pm-buy");
      boutons.forEach(b => { b.disabled = true; });
      if (statut) { statut.dataset.type = ""; statut.textContent = texte("Redirection vers le paiement sécurisé…", "Redirecting to secure checkout…"); }
      try {
        const reponse = await fetch("/api/abonnement", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ palier: bouton.dataset.palier, langue: langue() }),
        });
        const donnees = await reponse.json().catch(() => ({}));
        if (reponse.ok && donnees.url) {
          window.location.href = donnees.url;
          return;
        }
        if (statut) {
          statut.dataset.type = "erreur";
          statut.innerHTML = donnees.erreur === "abonnements_inactifs"
            ? texte("Les abonnements ouvrent bientôt. <a href=\"/#contact\">Inscrivez-vous</a> pour être prévenu du lancement.",
                    "Subscriptions open soon. <a href=\"/#contact\">Sign up</a> to hear about the launch.")
            : texte("Le paiement n'a pas pu démarrer. Réessayez ou écrivez à contact@hailitelabs.com.",
                    "Checkout could not start. Try again or write to contact@hailitelabs.com.");
        }
      } catch {
        if (statut) { statut.dataset.type = "erreur"; statut.textContent = texte("Connexion impossible. Réessayez.", "Connection failed. Try again."); }
      }
      boutons.forEach(b => { b.disabled = false; });
    });
  });

  // ---------- Page de bienvenue ----------
  const zone = document.getElementById("bienvenue");
  if (!zone) return;
  const sessionId = new URLSearchParams(window.location.search).get("session_id");
  const afficher = id => {
    document.querySelectorAll("[data-etat]").forEach(el => { el.hidden = el.dataset.etat !== id; });
  };

  async function charger(essai = 0) {
    if (!sessionId) { afficher("erreur"); return; }
    try {
      const reponse = await fetch(`/api/bienvenue?session_id=${encodeURIComponent(sessionId)}`);
      const donnees = await reponse.json().catch(() => ({}));
      // Paiement pas encore confirmé par Stripe : on réessaie quelques fois.
      if (reponse.status === 409 && essai < 5) { setTimeout(() => charger(essai + 1), 2000); return; }
      if (!reponse.ok || !donnees.ok) { afficher("erreur"); return; }

      document.getElementById("codeEntreprise").textContent = donnees.codeEntreprise;
      document.getElementById("nomAdmin").textContent = donnees.nomAdmin || "";
      const nip = document.getElementById("nipAdmin");
      if (donnees.nip) {
        nip.textContent = donnees.nip;
        document.getElementById("nipBloc").hidden = false;
        document.getElementById("nipAbsent").hidden = true;
      } else {
        document.getElementById("nipBloc").hidden = true;
        document.getElementById("nipAbsent").hidden = false;
      }
      const lien = document.getElementById("lienApp");
      if (donnees.lienApp) { lien.href = donnees.lienApp; lien.hidden = false; }
      const portail = document.getElementById("lienPortail");
      if (donnees.portail && portail) { portail.href = donnees.portail; portail.hidden = false; }
      afficher("pret");
    } catch {
      afficher("erreur");
    }
  }

  // Bouton « copier »
  document.querySelectorAll("[data-copier]").forEach(bouton => {
    bouton.addEventListener("click", async () => {
      const cible = document.getElementById(bouton.dataset.copier);
      try {
        await navigator.clipboard.writeText(cible.textContent.trim());
        bouton.textContent = texte("Copié ✓", "Copied ✓");
      } catch { /* presse-papiers indisponible */ }
    });
  });

  charger();
})();
