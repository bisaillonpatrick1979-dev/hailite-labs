// Worker Hailite Labs
// - Sert le site statique (dossier public/) via le binding ASSETS
// - Gère l'API d'inscription à l'infolettre : POST /api/inscription → base D1

import { bienvenue, creerSessionCredits, creerSessionPaiement, webhookStripe } from "./abonnements.js";

// Validation simple d'une adresse courriel
const COURRIEL_VALIDE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

// Réponse JSON uniforme
function json(donnees, statut = 200) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

// Lit le corps de la requête, qu'il soit en JSON ou en formulaire classique
async function lireCorps(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    return await request.json();
  }
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

async function inscrire(request, env) {
  // Envoi classique (sans JavaScript) : on redirige vers une page au lieu de répondre en JSON
  const envoiClassique = !(request.headers.get("content-type") || "").includes("application/json");
  const repondre = (donnees, statut = 200) => {
    if (envoiClassique) {
      const cible = donnees.ok ? "/merci" : "/#contact";
      return Response.redirect(new URL(cible, request.url).toString(), 303);
    }
    return json(donnees, statut);
  };

  let corps;
  try {
    corps = await lireCorps(request);
  } catch {
    return repondre({ ok: false, erreur: "requete_invalide" }, 400);
  }

  // Piège anti-robots : ce champ est caché, un humain le laisse vide
  if (corps.site_web) {
    return repondre({ ok: true });
  }

  const courriel = String(corps.courriel || "").trim().toLowerCase();
  const langue = corps.langue === "en" ? "en" : "fr";
  const source = String(corps.source || "site").slice(0, 40);
  const consentement = corps.consentement === true || corps.consentement === "on" || corps.consentement === "1";

  if (!COURRIEL_VALIDE.test(courriel) || courriel.length > 254) {
    return repondre({ ok: false, erreur: "courriel_invalide" }, 400);
  }
  if (!consentement) {
    return repondre({ ok: false, erreur: "consentement_requis" }, 400);
  }

  try {
    // INSERT OR IGNORE : une adresse déjà inscrite ne crée pas de doublon
    await env.DB.prepare(
      "INSERT OR IGNORE INTO inscriptions (courriel, langue, source, consentement) VALUES (?, ?, ?, 1)"
    )
      .bind(courriel, langue, source)
      .run();
    return repondre({ ok: true });
  } catch (err) {
    console.error("Erreur D1 :", err);
    return repondre({ ok: false, erreur: "serveur" }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/inscription") {
      if (request.method !== "POST") {
        return json({ ok: false, erreur: "methode_non_permise" }, 405);
      }
      // Refuse les envois venant d'un autre site
      const origine = request.headers.get("origin");
      if (origine && new URL(origine).host !== url.host) {
        return json({ ok: false, erreur: "origine_refusee" }, 403);
      }
      return inscrire(request, env);
    }

    // Abonnements Hailite Manager (voir src/abonnements.js)
    if (url.pathname === "/api/abonnement" && request.method === "POST") {
      const origine = request.headers.get("origin");
      if (origine && new URL(origine).host !== url.host) {
        return json({ ok: false, erreur: "origine_refusee" }, 403);
      }
      return creerSessionPaiement(request, env);
    }
    if (url.pathname === "/api/credits" && request.method === "POST") {
      const origine = request.headers.get("origin");
      if (origine && new URL(origine).host !== url.host) {
        return json({ ok: false, erreur: "origine_refusee" }, 403);
      }
      return creerSessionCredits(request, env);
    }
    if (url.pathname === "/api/bienvenue" && request.method === "GET") {
      return bienvenue(request, env);
    }
    if (url.pathname === "/api/stripe/webhook" && request.method === "POST") {
      return webhookStripe(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, erreur: "introuvable" }, 404);
    }

    // Tout le reste : fichiers du site
    return env.ASSETS.fetch(request);
  },
};
