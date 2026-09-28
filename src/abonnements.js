// Abonnements Hailite Manager (Stripe) — côté hailitelabs.com
//
// Parcours :
//   1. POST /api/abonnement      → crée une session Stripe Checkout (14 jours d'essai)
//   2. Stripe redirige vers /bienvenue?session_id=…
//   3. GET  /api/bienvenue       → vérifie le paiement chez Stripe, crée l'entreprise
//                                   dans Hailite Manager, affiche code + NIP
//   4. POST /api/stripe/webhook  → changements d'abonnement relayés à Hailite Manager
//
// Secrets (Cloudflare → Worker → Paramètres → Variables et secrets, type « Secret ») :
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, BILLING_API_SECRET
// Variables (wrangler.jsonc) :
//   MANAGER_API_URL, MANAGER_APP_URL, STRIPE_PRICE_SOLO, STRIPE_PRICE_EQUIPE,
//   STRIPE_PRICE_ENTREPRISE, STRIPE_PORTAL_URL

const PALIERS = ["solo", "equipe", "entreprise"];
const JOURS_ESSAI = 14;
// Le NIP initial reste consultable 24 h sur la page de bienvenue, puis est effacé.
const DUREE_NIP_MS = 24 * 60 * 60 * 1000;

function json(donnees, statut = 200) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Les abonnements sont-ils configurés ? (sinon le site affiche « bientôt ») */
export function abonnementsActifs(env) {
  return Boolean(
    env.STRIPE_SECRET_KEY && env.BILLING_API_SECRET && env.MANAGER_API_URL &&
    env.STRIPE_PRICE_SOLO && env.STRIPE_PRICE_EQUIPE && env.STRIPE_PRICE_ENTREPRISE
  );
}

function prixDuPalier(env, palier) {
  return { solo: env.STRIPE_PRICE_SOLO, equipe: env.STRIPE_PRICE_EQUIPE, entreprise: env.STRIPE_PRICE_ENTREPRISE }[palier] || null;
}

/** Palier à partir du prix Stripe (fiable même après un changement de forfait). */
function palierDuPrix(env, prixId) {
  if (!prixId) return null;
  if (prixId === env.STRIPE_PRICE_SOLO) return "solo";
  if (prixId === env.STRIPE_PRICE_EQUIPE) return "equipe";
  if (prixId === env.STRIPE_PRICE_ENTREPRISE) return "entreprise";
  return null;
}

// Date SQLite « AAAA-MM-JJ HH:MM:SS » (UTC) → millisecondes
function dateSql(valeur) {
  return Date.parse(String(valeur || "").replace(" ", "T") + "Z");
}

// ---------- Appels à l'API Stripe (sans SDK) ----------
function encoder(params, prefixe = "", sortie = new URLSearchParams()) {
  for (const [cle, valeur] of Object.entries(params)) {
    if (valeur === undefined || valeur === null) continue;
    const nom = prefixe ? `${prefixe}[${cle}]` : cle;
    if (typeof valeur === "object") encoder(valeur, nom, sortie);
    else sortie.append(nom, String(valeur));
  }
  return sortie;
}

async function stripe(env, methode, chemin, params) {
  const init = {
    method: methode,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  };
  let url = `https://api.stripe.com/v1/${chemin}`;
  if (params && methode === "GET") url += `?${encoder(params)}`;
  else if (params) {
    init.headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = encoder(params);
  }
  const reponse = await fetch(url, init);
  const donnees = await reponse.json();
  if (!reponse.ok) {
    throw new Error(`Stripe ${reponse.status} : ${donnees?.error?.message || "erreur"}`);
  }
  return donnees;
}

// Fin de période : champ de l'abonnement (anciennes versions de l'API) ou de son premier article.
function finDePeriode(abonnement) {
  return abonnement?.current_period_end ?? abonnement?.items?.data?.[0]?.current_period_end ?? null;
}

// ---------- Appels à Hailite Manager ----------
async function manager(env, chemin, corps) {
  const reponse = await fetch(`${env.MANAGER_API_URL.replace(/\/+$/, "")}${chemin}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.BILLING_API_SECRET}` },
    body: JSON.stringify(corps),
  });
  const donnees = await reponse.json().catch(() => ({}));
  return { statut: reponse.status, donnees };
}

// ---------- 1. Création de la session de paiement ----------
export async function creerSessionPaiement(request, env) {
  if (!abonnementsActifs(env)) return json({ ok: false, erreur: "abonnements_inactifs" }, 503);
  let corps = {};
  try { corps = await request.json(); } catch { /* corps vide */ }
  const palier = PALIERS.includes(corps.palier) ? corps.palier : null;
  const langue = corps.langue === "en" ? "en" : "fr";
  if (!palier) return json({ ok: false, erreur: "palier_invalide" }, 400);

  const origine = new URL(request.url).origin;
  const libelles = langue === "en"
    ? { entreprise: "Company name", admin: "Your name (administrator)" }
    : { entreprise: "Nom de l'entreprise", admin: "Votre nom (administrateur)" };

  try {
    const session = await stripe(env, "POST", "checkout/sessions", {
      mode: "subscription",
      locale: langue === "en" ? "en" : "fr-CA",
      line_items: { 0: { price: prixDuPalier(env, palier), quantity: 1 } },
      subscription_data: { trial_period_days: JOURS_ESSAI, metadata: { palier } },
      metadata: { palier },
      billing_address_collection: "required",
      allow_promotion_codes: "true",
      custom_fields: {
        0: { key: "entreprise", label: { type: "custom", custom: libelles.entreprise }, type: "text", text: { maximum_length: 100 } },
        1: { key: "administrateur", label: { type: "custom", custom: libelles.admin }, type: "text", text: { maximum_length: 80 } },
      },
      success_url: `${origine}/bienvenue?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origine}/hailite-manager#forfaits`,
    });
    return json({ ok: true, url: session.url });
  } catch (err) {
    console.error("Création Checkout :", err.message);
    return json({ ok: false, erreur: "stripe" }, 502);
  }
}

// ---------- 2. Page de bienvenue : création de l'entreprise ----------
function champ(session, cle) {
  const trouve = (session.custom_fields || []).find(f => f.key === cle);
  return (trouve?.text?.value || "").trim();
}

async function lireCommande(env, sessionId) {
  const ligne = await env.DB.prepare("SELECT * FROM commandes WHERE session_id = ?").bind(sessionId).first();
  if (!ligne) return null;
  // NIP effacé après 24 h
  if (ligne.nip_admin && Date.now() - dateSql(ligne.cree_le) > DUREE_NIP_MS) {
    await env.DB.prepare("UPDATE commandes SET nip_admin = NULL WHERE session_id = ?").bind(sessionId).run();
    ligne.nip_admin = null;
  }
  return ligne;
}

/** Crée l'entreprise pour une session Checkout payée. Idempotent (page + webhook). */
async function provisionner(env, sessionId) {
  const existante = await lireCommande(env, sessionId);
  if (existante?.code_entreprise && existante.nip_admin) return existante;

  const session = await stripe(env, "GET", `checkout/sessions/${sessionId}`, { expand: { 0: "subscription" } });
  if (session.status !== "complete" || session.mode !== "subscription") {
    return { erreur: "paiement_incomplet" };
  }
  const abonnement = session.subscription;
  const prixId = abonnement?.items?.data?.[0]?.price?.id;
  const palier = palierDuPrix(env, prixId) || session.metadata?.palier;
  const adresse = session.customer_details?.address || {};

  const { statut, donnees } = await manager(env, "/api/billing/provision", {
    companyName: champ(session, "entreprise") || session.customer_details?.name || "Mon entreprise",
    adminName: champ(session, "administrateur") || session.customer_details?.name || "Administrateur",
    billingEmail: session.customer_details?.email || "",
    plan: palier,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
    stripeSubscriptionId: abonnement?.id,
    subscriptionStatus: abonnement?.status,
    currentPeriodEnd: finDePeriode(abonnement),
    country: adresse.country === "US" ? "United States" : "Canada",
    region: adresse.state || "",
  });
  if (statut !== 200 && statut !== 201) {
    console.error("Provisionnement Manager :", statut, JSON.stringify(donnees));
    return { erreur: "provisionnement" };
  }

  if (donnees.created && donnees.adminPin) {
    // Seul l'appel qui a créé l'entreprise connaît le NIP : on le garde 24 h.
    await env.DB.prepare(
      `INSERT INTO commandes (session_id, abonnement_id, code_entreprise, nom_admin, nip_admin, palier, courriel)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET code_entreprise = excluded.code_entreprise,
         nom_admin = excluded.nom_admin, nip_admin = excluded.nip_admin`
    ).bind(sessionId, abonnement.id, donnees.accessCode, donnees.adminName, donnees.adminPin, palier,
      session.customer_details?.email || "").run();
  } else {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO commandes (session_id, abonnement_id, code_entreprise, nom_admin, palier, courriel)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(sessionId, abonnement.id, donnees.accessCode, donnees.adminName, palier,
      session.customer_details?.email || "").run();
  }
  return await lireCommande(env, sessionId);
}

export async function bienvenue(request, env) {
  if (!abonnementsActifs(env)) return json({ ok: false, erreur: "abonnements_inactifs" }, 503);
  const sessionId = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) {
    return json({ ok: false, erreur: "session_invalide" }, 400);
  }
  try {
    let commande = await provisionner(env, sessionId);
    if (commande?.erreur) return json({ ok: false, erreur: commande.erreur }, commande.erreur === "paiement_incomplet" ? 409 : 502);
    // Course avec le webhook : l'autre appel détient peut-être le NIP. On relit un peu.
    for (let essai = 0; essai < 3 && commande && !commande.nip_admin && Date.now() - dateSql(commande.cree_le) < 60_000; essai += 1) {
      await new Promise(r => setTimeout(r, 1500));
      commande = await lireCommande(env, sessionId);
    }
    return json({
      ok: true,
      codeEntreprise: commande.code_entreprise,
      nomAdmin: commande.nom_admin,
      nip: commande.nip_admin || null,
      palier: commande.palier,
      lienApp: env.MANAGER_APP_URL ? `${env.MANAGER_APP_URL.replace(/\/+$/, "")}/?entreprise=${encodeURIComponent(commande.code_entreprise)}` : null,
      portail: env.STRIPE_PORTAL_URL || null,
    });
  } catch (err) {
    console.error("Bienvenue :", err.message);
    return json({ ok: false, erreur: "serveur" }, 502);
  }
}

// ---------- 3. Webhook Stripe ----------
async function hmacHex(secret, message) {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map(o => o.toString(16).padStart(2, "0")).join("");
}

function egalConstant(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Vérifie l'en-tête Stripe-Signature (t=…,v1=…), tolérance de 5 minutes. Exportée pour les tests. */
export async function signatureStripeValide(corps, entete, secret, maintenant = Date.now()) {
  if (!entete || !secret) return false;
  const parties = Object.fromEntries(entete.split(",").map(p => p.split("=")).filter(p => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const horodatage = Number(parties.t);
  if (!Number.isFinite(horodatage) || Math.abs(maintenant / 1000 - horodatage) > 300) return false;
  const signatures = entete.split(",").map(p => p.trim()).filter(p => p.startsWith("v1=")).map(p => p.slice(3));
  const attendue = await hmacHex(secret, `${horodatage}.${corps}`);
  return signatures.some(s => egalConstant(s, attendue));
}

export async function webhookStripe(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET || !abonnementsActifs(env)) return json({ ok: false }, 503);
  const corps = await request.text();
  if (!(await signatureStripeValide(corps, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET))) {
    return json({ ok: false, erreur: "signature" }, 400);
  }
  const evenement = JSON.parse(corps);
  const objet = evenement.data?.object || {};

  try {
    if (evenement.type === "checkout.session.completed" && objet.mode === "subscription") {
      // Filet de sécurité : l'entreprise est créée même si le client ferme la page.
      const resultat = await provisionner(env, objet.id);
      if (resultat?.erreur) return json({ ok: false }, 500); // Stripe réessaiera
    }
    if (["customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"].includes(evenement.type)) {
      const { statut } = await manager(env, "/api/billing/status", {
        stripeSubscriptionId: objet.id,
        subscriptionStatus: objet.status,
        plan: palierDuPrix(env, objet.items?.data?.[0]?.price?.id),
        currentPeriodEnd: finDePeriode(objet),
      });
      // 404 : abonnement pas encore provisionné → Stripe réessaiera plus tard.
      if (statut !== 200) return json({ ok: false }, statut === 404 ? 409 : 500);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("Webhook :", err.message);
    return json({ ok: false }, 500);
  }
}
