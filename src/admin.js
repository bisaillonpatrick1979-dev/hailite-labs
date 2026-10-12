import {
  listDrafts,
  saveDraft,
  validateApp,
  setPublication,
} from "./catalogue.js";
import { validatePublishedFiles } from "./app-files.js";
import { uploadFile, serveMedia } from "./app-files.js";
import { login, logout, requireAdmin } from "./admin-auth.js";
import { json, errorResponse, readJson } from "./admin-http.js";
export async function handleAdmin(request, env) {
  const path = new URL(request.url).pathname;
  if (path === "/api/admin/login" && request.method === "POST")
    return login(request, env);
  if (path === "/api/admin/logout" && request.method === "POST")
    return logout(request, env);
  try {
    const session = await requireAdmin(request, env, request.method !== "GET");
    if (path === "/api/admin/session" && request.method === "GET") {
      await env.DB.prepare("SELECT slug FROM app_records LIMIT 1").all();
      return json({
        ok: true,
        csrf: session.csrf,
        expiresAt: session.expiresAt,
        storage: !!env.APP_APKS,
      });
    }
    if (path === "/api/admin/apps" && request.method === "GET")
      return json({ drafts: await listDrafts(env, request) });
    const appRoute =
      /^\/api\/admin\/apps\/([a-z0-9-]{1,60})(?:\/(publish|unpublish))?$/.exec(
        path,
      );
    if (appRoute) {
      const [, slug, action] = appRoute;
      if (!action && request.method === "PUT") {
        const body = await readJson(request);
        return json({
          ok: true,
          draft: await saveDraft(
            env,
            validateApp(body.app, slug),
            body.expectedRevision,
          ),
        });
      }
      if (action && request.method === "POST") {
        const body = await readJson(request);
        return json({
          ok: true,
          draft: await setPublication(
            env,
            slug,
            body.expectedRevision,
            action === "publish",
            (a) => validatePublishedFiles(env, a),
          ),
        });
      }
    }
    const upload = /^\/api\/admin\/apps\/([a-z0-9-]{1,60})\/uploads$/.exec(
      path,
    );
    if (upload && request.method === "POST")
      return uploadFile(request, env, upload[1]);
    const media = /^\/api\/admin\/media\/([a-f0-9-]{36})$/.exec(path);
    if (media && request.method === "GET")
      return serveMedia(request, env, media[1], true);
    return json({ ok: false, erreur: "introuvable" }, 404);
  } catch (e) {
    return errorResponse(e);
  }
}
