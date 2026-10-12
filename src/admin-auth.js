import { fail, json, errorResponse, readJson } from "./admin-http.js";
const COOKIE = "__Host-hailite-admin";
const encoder = new TextEncoder();
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
function configured(env) {
  if (
    !env.DB ||
    typeof env.ADMIN_PASSWORD !== "string" ||
    env.ADMIN_PASSWORD.length < 16 ||
    typeof env.ADMIN_SESSION_SECRET !== "string" ||
    env.ADMIN_SESSION_SECRET.length < 32
  )
    fail(503, "administration_non_configuree");
}
function origin(request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    fail(403, "origine_refusee");
}
async function hmac(env, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.ADMIN_SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function passwordEqual(a, b) {
  const [one, two] = await Promise.all(
    [a, b].map((s) => crypto.subtle.digest("SHA-256", encoder.encode(s))),
  );
  return equal(hex(one), hex(two));
}
async function countAttempt(env, request) {
  const now = Date.now(),
    windowStart = Math.floor(now / 900000) * 900000;
  const ip = request.headers.get("cf-connecting-ip") || "shared";
  const identity = await hmac(env, ip);
  const keys = ["global", "ip:" + identity];
  await env.DB.batch(
    keys.map((bucket) =>
      env.DB.prepare(
        "INSERT INTO admin_login_attempts (bucket,window_start,attempts) VALUES (?,?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,window_start=excluded.window_start",
      ).bind(bucket, windowStart),
    ),
  );
  for (let i = 0; i < keys.length; i++) {
    const row = await env.DB.prepare(
      "SELECT attempts FROM admin_login_attempts WHERE bucket=?",
    )
      .bind(keys[i])
      .first();
    if (row.attempts > (i === 0 ? 50 : 5)) fail(429, "trop_de_tentatives");
  }
  await env.DB.prepare(
    "DELETE FROM admin_login_attempts WHERE window_start < ?",
  )
    .bind(windowStart - 900000)
    .run();
}
export async function login(request, env) {
  try {
    configured(env);
    origin(request);
    await countAttempt(env, request);
    const body = await readJson(request, 4096);
    if (
      typeof body.password !== "string" ||
      !(await passwordEqual(body.password, env.ADMIN_PASSWORD))
    )
      fail(401, "identifiants_invalides");
    const id = crypto.randomUUID(),
      csrf = crypto.randomUUID(),
      expiresAt = Date.now() + 28800000;
    await env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?")
      .bind(Date.now())
      .run();
    await env.DB.prepare(
      "INSERT INTO admin_sessions (id,csrf,expires_at) VALUES (?,?,?)",
    )
      .bind(id, csrf, expiresAt)
      .run();
    return json({ ok: true }, 200, {
      "set-cookie": `${COOKIE}=${id}.${await hmac(env, id)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function requireAdmin(request, env, mutation = false) {
  configured(env);
  const match = (request.headers.get("cookie") || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(COOKIE + "="));
  const token = match?.slice(COOKIE.length + 1) || "";
  const [id, signature, ...extra] = token.split(".");
  if (
    !/^[a-f0-9-]{36}$/.test(id || "") ||
    !/^[a-f0-9]{64}$/.test(signature || "") ||
    extra.length ||
    !equal(signature, await hmac(env, id))
  )
    fail(401, "session_expiree");
  const row = await env.DB.prepare("SELECT * FROM admin_sessions WHERE id=?")
    .bind(id)
    .first();
  if (!row || row.expires_at <= Date.now()) fail(401, "session_expiree");
  if (mutation) {
    origin(request);
    if (!equal(request.headers.get("x-csrf-token") || "", row.csrf))
      fail(403, "csrf_invalide");
  }
  return { sessionId: id, csrf: row.csrf, expiresAt: row.expires_at };
}
export async function logout(request, env) {
  try {
    const session = await requireAdmin(request, env, true);
    await env.DB.prepare("DELETE FROM admin_sessions WHERE id=?")
      .bind(session.sessionId)
      .run();
    return json({ ok: true }, 200, {
      "set-cookie": `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
