import assert from "node:assert/strict";
import { database, migrate } from "./test-support/d1.mjs";
import { login, requireAdmin, logout } from "../src/admin-auth.js";
const DB = database();
migrate(DB);
const env = {
  DB,
  ADMIN_PASSWORD: "test-password-long-enough",
  ADMIN_SESSION_SECRET: "test-secret-at-least-thirty-two-characters",
};
const request = (body, password = env.ADMIN_PASSWORD, ip = "1.2.3.4") =>
  new Request("https://hailitelabs.com/api/admin/login", {
    method: "POST",
    headers: {
      origin: "https://hailitelabs.com",
      "content-type": "application/json",
      "cf-connecting-ip": ip,
    },
    body: body || JSON.stringify({ password }),
  });
const response = await login(request(), env);
assert.equal(response.status, 200);
const cookie = response.headers.get("set-cookie").split(";")[0];
for (const x of [
  "Secure",
  "HttpOnly",
  "SameSite=Strict",
  "Path=/",
  "Max-Age=28800",
])
  assert.ok(response.headers.get("set-cookie").includes(x));
const sessionReq = new Request("https://hailitelabs.com/api/admin/session", {
  headers: { cookie },
});
const session = await requireAdmin(sessionReq, env);
assert.ok(session.csrf);
const mutate = (origin, csrf, c = cookie) =>
  new Request("https://hailitelabs.com/api/admin/logout", {
    method: "POST",
    headers: {
      cookie: c,
      ...(origin ? { origin } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
  });
await assert.rejects(
  requireAdmin(new Request(sessionReq.url), env),
  (e) => e.status === 401,
);
await assert.rejects(
  requireAdmin(
    new Request(sessionReq.url, { headers: { cookie: cookie + "0" } }),
    env,
  ),
  (e) => e.status === 401,
);
for (const req of [
  mutate(null, session.csrf),
  mutate("https://evil.test", session.csrf),
  mutate("https://hailitelabs.com", null),
])
  await assert.rejects(requireAdmin(req, env, true), (e) => e.status === 403);
assert.equal((await login(request(null, "bad"), env)).status, 401);
assert.equal((await login(request(), { DB })).status, 503);
assert.equal((await login(request("x".repeat(4097)), env)).status, 413);
assert.equal(
  (await logout(mutate("https://hailitelabs.com", session.csrf), env)).status,
  200,
);
await assert.rejects(requireAdmin(sessionReq, env), (e) => e.status === 401);
for (let i = 0; i < 5; i++)
  assert.equal((await login(request(null, "bad", "2.2.2.2"), env)).status, 401);
assert.equal((await login(request(null, "bad", "2.2.2.2"), env)).status, 429);
DB.sqlite.exec("UPDATE admin_login_attempts SET window_start=0");
const again = await login(request(null, undefined, "2.2.2.2"), env);
assert.equal(again.status, 200);
DB.sqlite.exec("UPDATE admin_sessions SET expires_at=0");
await assert.rejects(
  requireAdmin(
    new Request(sessionReq.url, {
      headers: { cookie: again.headers.get("set-cookie").split(";")[0] },
    }),
    env,
  ),
  (e) => e.status === 401,
);
const foreign = new Request(request().url, {
  method: "POST",
  headers: { origin: "https://evil.test" },
  body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
});
assert.equal((await login(foreign, env)).status, 403);
assert.equal(
  (await login(request("null", undefined, "3.3.3.3"), env)).status,
  400,
  "JSON null is a malformed login, not a server failure",
);
console.log(
  "Admin auth: signed/revoked/expired cookies, origin, CSRF, real SQLite rate limits and missing secrets PASS.",
);
