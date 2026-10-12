import { resolveApk, serveMedia } from "./app-files.js";
import { handleAdmin } from "./admin.js";
import { readCatalog } from "./catalogue.js";
// Worker Hailite Labs
// - Sert le site statique (dossier public/) via le binding ASSETS
// - Gère l'API d'inscription à l'infolettre : POST /api/inscription → base D1

import { bienvenue, creerSessionCredits, creerSessionPaiement, creerSessionPerpetuelle, abonnementsActifs, perpetualActif, webhookStripe } from "./abonnements.js";

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


// Android APK / Cloudflare R2 — do not expose downloads unless object exists.
const lireCatalogue = readCatalog;
async function releases(request, env) {
  if (!env.APP_APKS) return json({ releases: [] });
  try {
    const apps = await lireCatalogue(env, request);
    const available = await Promise.all(apps.map(async app => {
      try {
        const apk = await resolveApk(env, app);
        if (!apk) return null;
        const object = await env.APP_APKS.head(apk.key);
        if (!object) return null;
        return { slug: app.slug, available: true, version: app.apk.version,
          fileName: app.slug + "-" + app.apk.version + ".apk", sha256: app.apk.sha256, bytes: object.size };
      } catch { return null; }
    }));
    return json({ releases: available.filter(Boolean) });
  } catch {
    return json({ releases: [] }, 503);
  }
}
async function telechargerApk(request, env, slug) {
  if (!env.APP_APKS || !/^[a-z0-9-]{1,60}$/.test(slug)) {
    return new Response("APK indisponible", { status: 404, headers: { "cache-control":"no-store" } });
  }
  try {
    const apps = await lireCatalogue(env, request);
    const app = apps.find(item => item.slug === slug);
    const apk = await resolveApk(env, app);
    if (!apk) return new Response("APK indisponible", { status: 404, headers: {"cache-control":"no-store"} });
    const object = await env.APP_APKS.get(apk.key);
    if (!object || !object.body) return new Response("APK indisponible", { status: 404 });
    const fileName = app.slug + "-" + app.apk.version + ".apk";
    const headers = new Headers({
      "content-type":"application/vnd.android.package-archive",
      "content-disposition": 'attachment; filename="' + fileName + '"',
      "x-content-type-options":"nosniff",
      "cache-control":"private, no-store",
      "content-length":String(object.size)
    });
    return new Response(object.body, { status: 200, headers });
  } catch {
    return new Response("Téléchargement temporairement indisponible", { status:503 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/app-media/") && request.method === "GET") return serveMedia(request,env,url.pathname.slice("/api/app-media/".length));

    if (url.pathname.startsWith("/api/admin/")) return handleAdmin(request, env);

    if (url.pathname === "/api/apps/catalog" && request.method === "GET") {
      try { return json({ apps: await readCatalog(env, request) }); } catch { return json({ ok:false, erreur:"catalogue_indisponible" },503); }
    }

    if (url.pathname === "/api/commerce/status" && request.method === "GET") {
      return json({ abonnement: abonnementsActifs(env), permanente: perpetualActif(env) });
    }
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
    if (url.pathname === "/api/licence-permanente" && request.method === "POST") {
      const origine = request.headers.get("origin");
      if (origine && new URL(origine).host !== url.host) {
        return json({ ok: false, erreur: "origine_refusee" }, 403);
      }
      return creerSessionPerpetuelle(request, env);
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

    if (url.pathname === "/api/apps/releases" && request.method === "GET") {
      return releases(request, env);
    }
    if (url.pathname.startsWith("/api/download/") && request.method === "GET") {
      return telechargerApk(request, env, url.pathname.slice("/api/download/".length));
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, erreur: "introuvable" }, 404);
    }

    // Tout le reste : fichiers du site
    return env.ASSETS.fetch(request);
  },
};
