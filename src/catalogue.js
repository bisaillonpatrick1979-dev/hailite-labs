import { fail } from "./admin-http.js";
const slugPattern = /^[a-z0-9-]{1,60}$/;
export function safeUrl(value) {
  if (value == null || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\s\\\u0000-\u001f]/.test(value)
  )
    fail(400, "lien_invalide");
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    fail(400, "lien_invalide");
  }
  if (
    decoded.includes("\\") ||
    decoded.split(/[/?#]/).some((x) => x === ".." || x === ".") ||
    decoded.startsWith("//")
  )
    fail(400, "lien_invalide");
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const u = new URL(value);
    if (u.protocol === "https:" && !u.username && !u.password) return u.href;
  } catch {}
  fail(400, "lien_invalide");
}
function text(value, max, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail(400, "fiche_invalide");
  return value.trim();
}
export function validateApp(input, slug) {
  if (!input || !slugPattern.test(slug) || input.slug !== slug)
    fail(400, "slug_invalide");
  if (
    !["games", "business", "lifestyle"].includes(input.category) ||
    !["web", "development", "concept"].includes(input.stage) ||
    !["free", "paid"].includes(input.distribution)
  )
    fail(400, "fiche_invalide");
  if (slug === "hailite-manager" && input.distribution !== "paid")
    fail(400, "application_payante");
  const features = (key) => {
    const arr = input[key] || [];
    if (!Array.isArray(arr) || arr.length > 12) fail(400, "fiche_invalide");
    return arr.map((x) => text(x, 200, true));
  };
  if (!Array.isArray(input.screenshots) || input.screenshots.length > 6)
    fail(400, "fiche_invalide");
  if (input.accent && !/^#[0-9a-f]{6}$/i.test(input.accent))
    fail(400, "fiche_invalide");
  const apk = input.apk || null;
  if (
    apk &&
    (!/^[0-9][a-zA-Z0-9.+-]{0,39}$/.test(apk.version) ||
      !/^[0-9a-f]{64}$/i.test(apk.sha256) ||
      typeof apk.key !== "string" ||
      apk.key.length > 250 ||
      apk.key.includes("..") ||
      apk.key.includes("\\") ||
      (apk.fileId && !/^[a-f0-9-]{36}$/.test(apk.fileId)))
  )
    fail(400, "apk_invalide");
  return {
    slug,
    name: text(input.name, 100, true),
    category: input.category,
    stage: input.stage,
    icon: safeUrl(input.icon),
    accent: input.accent || "#3fc6ff",
    fr: text(input.fr, 2000, true),
    en: text(input.en, 2000, true),
    featuresFr: features("featuresFr"),
    featuresEn: features("featuresEn"),
    screenshots: input.screenshots.map(safeUrl),
    webUrl: safeUrl(input.webUrl),
    purchaseUrl: safeUrl(input.purchaseUrl),
    distribution: input.distribution,
    apk: apk
      ? {
          key: apk.key,
          version: apk.version,
          sha256: apk.sha256,
          ...(apk.fileId ? { fileId: apk.fileId } : {}),
        }
      : null,
  };
}
export async function readStaticCatalog(env, request) {
  const r = await env.ASSETS.fetch(
    new Request(new URL("/app-data.json", request.url)),
  );
  if (!r.ok) throw Error("catalogue_indisponible");
  return (await r.json()).apps || [];
}
export async function readCatalog(env, request) {
  const items = new Map(
    (await readStaticCatalog(env, request)).map((a) => [a.slug, a]),
  );
  if (!env.DB) return [...items.values()];
  let rows;
  try {
    rows = (
      await env.DB.prepare("SELECT slug,published_json FROM app_records").all()
    ).results;
  } catch (e) {
    if (/no such table[^\n]*app_records/i.test(e.message))
      return [...items.values()];
    throw e;
  }
  for (const row of rows) {
    if (row.published_json) items.set(row.slug, JSON.parse(row.published_json));
    else items.delete(row.slug);
  }
  return [...items.values()];
}
function draftRecord(row) {
  return {
    app: JSON.parse(row.draft_json),
    revision: row.revision,
    published: !!row.published_json,
    updatedAt: row.updated_at,
  };
}
export async function listDrafts(env, request) {
  const items = new Map(
    (await readStaticCatalog(env, request)).map((app) => [
      app.slug,
      { app, revision: 0, published: true, updatedAt: null },
    ]),
  );
  for (const r of (
    await env.DB.prepare(
      "SELECT * FROM app_records ORDER BY updated_at DESC",
    ).all()
  ).results)
    items.set(r.slug, draftRecord(r));
  return [...items.values()];
}
export async function saveDraft(env, app, expectedRevision) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    fail(400, "revision_invalide");
  let row;
  if (expectedRevision === 0) {
    const initial = (
      await readStaticCatalog(
        env,
        new Request("https://hailitelabs.com/app-data.json"),
      )
    ).find((x) => x.slug === app.slug);
    row = await env.DB.prepare(
      "INSERT INTO app_records (slug,draft_json,published_json,revision,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(slug) DO NOTHING RETURNING *",
    )
      .bind(
        app.slug,
        JSON.stringify(app),
        initial ? JSON.stringify(initial) : null,
        new Date().toISOString(),
      )
      .first();
  } else {
    row = await env.DB.prepare(
      "UPDATE app_records SET draft_json=?,revision=revision+1,updated_at=? WHERE slug=? AND revision=? RETURNING *",
    )
      .bind(
        JSON.stringify(app),
        new Date().toISOString(),
        app.slug,
        expectedRevision,
      )
      .first();
  }
  if (!row) fail(409, "conflit_revision");
  return draftRecord(row);
}
export async function setPublication(
  env,
  slug,
  expectedRevision,
  published,
  validateFiles,
) {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    !slugPattern.test(slug)
  )
    fail(400, "revision_invalide");
  const row = await env.DB.prepare("SELECT * FROM app_records WHERE slug=?")
    .bind(slug)
    .first();
  if (!row) {
    if (expectedRevision !== 0 || published)
      fail(404, "application_introuvable");
    const initial = (
      await readStaticCatalog(
        env,
        new Request("https://hailitelabs.com/app-data.json"),
      )
    ).find((x) => x.slug === slug);
    if (!initial) fail(404, "application_introuvable");
    const tombstone = await env.DB.prepare(
      "INSERT INTO app_records (slug,draft_json,published_json,revision,updated_at) VALUES (?,?,NULL,1,?) ON CONFLICT(slug) DO NOTHING RETURNING *",
    )
      .bind(slug, JSON.stringify(initial), new Date().toISOString())
      .first();
    if (!tombstone) fail(409, "conflit_revision");
    return draftRecord(tombstone);
  }
  if (row.revision !== expectedRevision) fail(409, "conflit_revision");
  const app = published
    ? validateApp(JSON.parse(row.draft_json), slug)
    : JSON.parse(row.draft_json);
  if (published) await validateFiles(app);
  const result = await env.DB.prepare(
    "UPDATE app_records SET published_json=?,revision=revision+1,updated_at=? WHERE slug=? AND revision=? RETURNING *",
  )
    .bind(
      published ? JSON.stringify(app) : null,
      new Date().toISOString(),
      slug,
      expectedRevision,
    )
    .first();
  if (!result) fail(409, "conflit_revision");
  return draftRecord(result);
}
