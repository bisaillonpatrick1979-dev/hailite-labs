import { fail, json, errorResponse, readBounded } from "./admin-http.js";
import { requireAdmin } from "./admin-auth.js";
const ID = /^[a-f0-9-]{36}$/;
const MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  apk: "application/vnd.android.package-archive",
};
function format(bytes, ext) {
  if (ext === "png")
    return (
      bytes.length >= 12 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => bytes[i] === x)
    );
  if (ext === "jpg" || ext === "jpeg")
    return (
      bytes.length >= 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  if (ext === "webp")
    return (
      bytes.length >= 12 &&
      new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
    );
  return (
    bytes.length >= 4 &&
    bytes[0] === 80 &&
    bytes[1] === 75 &&
    bytes[2] === 3 &&
    bytes[3] === 4
  );
}
export async function uploadFile(request, env, slug) {
  try {
    await requireAdmin(request, env, true);
    if (!env.APP_APKS) fail(503, "stockage_non_configure");
    if (!/^[a-z0-9-]{1,60}$/.test(slug)) fail(400, "slug_invalide");
    if (
      !(await env.DB.prepare("SELECT slug FROM app_records WHERE slug=?")
        .bind(slug)
        .first())
    )
      fail(404, "enregistrer_avant_transfert");
    const params = new URL(request.url).searchParams,
      kind = params.get("kind"),
      version = params.get("version");
    if (!["icon", "screenshot", "apk"].includes(kind))
      fail(400, "type_invalide");
    const name = request.headers.get("x-file-name") || "",
      ext = name.split(".").pop().toLowerCase();
    if (!MIME[ext] || (kind === "apk") !== (ext === "apk"))
      fail(415, "format_invalide");
    if (kind === "apk" && !/^[0-9][a-zA-Z0-9.+-]{0,39}$/.test(version || ""))
      fail(400, "version_invalide");
    const bytes = await readBounded(
      request,
      (kind === "apk" ? 50 : 5) * 1024 * 1024,
    );
    await requireAdmin(request, env, true);
    if (!format(bytes, ext)) fail(415, "format_invalide");
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const id = crypto.randomUUID(),
      key = `uploads/${slug}/${id}.${ext}`;
    await env.APP_APKS.put(key, bytes, {
      httpMetadata: { contentType: MIME[ext] },
    });
    try {
      await env.DB.prepare(
        "INSERT INTO app_files (id,slug,kind,object_key,mime,bytes,version,sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          slug,
          kind,
          key,
          MIME[ext],
          bytes.length,
          kind === "apk" ? version : null,
          sha256,
          new Date().toISOString(),
        )
        .run();
    } catch (e) {
      await env.APP_APKS.delete(key);
      throw e;
    }
    return json({
      ok: true,
      file: {
        id,
        key,
        kind,
        url: kind === "apk" ? null : "/api/app-media/" + id,
        version: kind === "apk" ? version : null,
        sha256,
        bytes: bytes.length,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
async function fileRow(env, id) {
  if (!ID.test(id || "")) fail(404, "fichier_introuvable");
  return env.DB.prepare("SELECT * FROM app_files WHERE id=?").bind(id).first();
}
async function ownedFile(env, app, id, kind) {
  const row = await fileRow(env, id);
  if (!row || row.slug !== app.slug || row.kind !== kind)
    fail(400, "fichier_invalide");
  if (!env.APP_APKS || !(await env.APP_APKS.head(row.object_key)))
    fail(400, "fichier_manquant");
  return row;
}
function mediaId(url) {
  const m = /^\/api\/app-media\/([a-f0-9-]{36})$/.exec(url || "");
  return m?.[1];
}
export async function validatePublishedFiles(env, app) {
  for (const [url, kind] of [
    [app.icon, "icon"],
    ...(app.screenshots || []).map((x) => [x, "screenshot"]),
  ]) {
    if (!url) continue;
    const id = mediaId(url);
    if (id) {
      await ownedFile(env, app, id, kind);
      continue;
    }
    if (
      !/^\/(?:assets|app-assets)\/[a-zA-Z0-9._/-]+$/.test(url) ||
      url.includes("..")
    )
      fail(400, "image_invalide");
    const r = await env.ASSETS.fetch(
      new Request(new URL(url, "https://hailitelabs.com"), { method: "HEAD" }),
    );
    if (!r.ok) fail(400, "fichier_manquant");
  }
  if (app.apk) {
    if (app.apk.fileId) {
      const row = await ownedFile(env, app, app.apk.fileId, "apk");
      if (
        row.object_key !== app.apk.key ||
        row.version !== app.apk.version ||
        row.sha256 !== app.apk.sha256
      )
        fail(400, "apk_invalide");
    } else if (
      app.apk.key !==
        `releases/${app.slug}/${app.slug}-${app.apk.version}.apk` ||
      !env.APP_APKS ||
      !(await env.APP_APKS.head(app.apk.key))
    )
      fail(400, "apk_invalide");
  }
}
export async function resolveApk(env, app) {
  if (
    app?.distribution !== "free" ||
    app.slug === "hailite-manager" ||
    !/^[a-z0-9-]{1,60}$/.test(app.slug)
  )
    return null;
  const apk = app.apk;
  if (
    !apk ||
    !/^[0-9][a-zA-Z0-9.+-]{0,39}$/.test(apk.version) ||
    !/^[0-9a-f]{64}$/i.test(apk.sha256)
  )
    return null;
  if (apk.fileId) {
    const row = await fileRow(env, apk.fileId);
    if (
      !row ||
      row.slug !== app.slug ||
      row.kind !== "apk" ||
      row.object_key !== apk.key ||
      row.sha256 !== apk.sha256 ||
      row.version !== apk.version
    )
      return null;
  } else if (apk.key !== `releases/${app.slug}/${app.slug}-${apk.version}.apk`)
    return null;
  return { key: apk.key, version: apk.version, sha256: apk.sha256 };
}
export async function serveMedia(request, env, id, privatePreview = false) {
  try {
    if (privatePreview) await requireAdmin(request, env);
    if (!env.APP_APKS) fail(404, "fichier_introuvable");
    const row = await fileRow(env, id);
    if (!row || row.kind === "apk") fail(404, "fichier_introuvable");
    if (!privatePreview) {
      const record = await env.DB.prepare(
        "SELECT published_json FROM app_records WHERE slug=?",
      )
        .bind(row.slug)
        .first();
      const app = record?.published_json
        ? JSON.parse(record.published_json)
        : null;
      if (
        !app ||
        ![app.icon, ...(app.screenshots || [])].includes("/api/app-media/" + id)
      )
        fail(404, "fichier_introuvable");
    }
    const object = await env.APP_APKS.get(row.object_key);
    if (!object) fail(404, "fichier_introuvable");
    return new Response(object.body, {
      headers: {
        "content-type": row.mime,
        "content-length": String(object.size),
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
