import assert from "node:assert/strict";
import { database, migrate, assets, app, bucket } from "./test-support/d1.mjs";
import {
  uploadFile,
  serveMedia,
  validatePublishedFiles,
  resolveApk,
} from "../src/app-files.js";
import { login, requireAdmin } from "../src/admin-auth.js";
import { saveDraft, setPublication } from "../src/catalogue.js";
const DB = database();
migrate(DB);
const env = {
  DB,
  ASSETS: assets(),
  APP_APKS: bucket(),
  ADMIN_PASSWORD: "test-password-long-enough",
  ADMIN_SESSION_SECRET: "test-secret-at-least-thirty-two-characters",
};
const origin = "https://hailitelabs.com";
const r = await login(
  new Request(origin + "/api/admin/login", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
  }),
  env,
);
const cookie = r.headers.get("set-cookie").split(";")[0];
const session = await requireAdmin(
  new Request(origin, { headers: { cookie } }),
  env,
);
const headers = { origin, cookie, "x-csrf-token": session.csrf };
await saveDraft(env, app, 0);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]),
  zip = new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4]);
const send = (
  bytes,
  name = "icon.png",
  kind = "icon",
  extra = {},
  target = env,
) =>
  uploadFile(
    new Request(
      origin +
        "/api/admin/apps/liescope/uploads?kind=" +
        kind +
        "&version=1.0.0",
      {
        method: "POST",
        headers: { ...headers, "x-file-name": name, ...extra },
        body: bytes,
        duplex: "half",
      },
    ),
    target,
    "liescope",
  );
const icon = await send(png);
assert.equal(icon.status, 200);
const file = (await icon.json()).file;
assert.match(file.url, /^\/api\/app-media\//);
assert.equal((await serveMedia(new Request(origin), env, file.id)).status, 404);
assert.equal(
  (
    await serveMedia(
      new Request(origin, { headers: { cookie } }),
      env,
      file.id,
      true,
    )
  ).status,
  200,
);
assert.equal(
  (await serveMedia(new Request(origin), env, file.id, true)).status,
  401,
);
for (const [data, name, kind] of [
  [png, "icon.svg", "icon"],
  [zip, "icon.png", "icon"],
  [png, "test.apk", "apk"],
])
  assert.equal((await send(data, name, kind)).status, 415);
assert.equal((await send(new Uint8Array(5 * 1024 * 1024 + 1))).status, 413);
assert.equal(
  (await send(new Uint8Array(50 * 1024 * 1024 + 1), "test.apk", "apk")).status,
  413,
);
assert.equal(
  (await send(png, "icon.png", "icon", {}, { ...env, APP_APKS: null })).status,
  503,
);
const apkOne = await send(zip, "test.apk", "apk");
assert.equal(apkOne.status, 200);
const apk = (await apkOne.json()).file;
const apkTwo = (await (await send(zip, "test.apk", "apk")).json()).file;
assert.notEqual(apk.key, apkTwo.key);
const hash = Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", zip)),
  (b) => b.toString(16).padStart(2, "0"),
).join("");
assert.equal(apk.sha256, hash);
const valid = {
  ...app,
  icon: file.url,
  apk: { fileId: apk.id, key: apk.key, version: "1.0.0", sha256: hash },
};
await validatePublishedFiles(env, valid);
await saveDraft(env, valid, 1);
await setPublication(env, app.slug, 2, true, (a) =>
  validatePublishedFiles(env, a),
);
assert.equal((await serveMedia(new Request(origin), env, file.id)).status, 200);
assert.equal((await resolveApk(env, valid)).key, apk.key);
assert.equal(await resolveApk(env, { ...valid, distribution: "paid" }), null);
await assert.rejects(
  validatePublishedFiles(env, { ...valid, slug: "other" }),
  (e) => e.status === 400,
);
env.APP_APKS.files.delete(apk.key);
await assert.rejects(
  validatePublishedFiles(env, valid),
  (e) => e.status === 400,
);
const before = env.APP_APKS.files.size;
const badDB = {
  ...env,
  DB: {
    prepare(sql) {
      if (sql.startsWith("INSERT INTO app_files"))
        return {
          bind() {
            return this;
          },
          async run() {
            throw Error("D1 unavailable");
          },
        };
      return DB.prepare(sql);
    },
  },
};
assert.equal((await send(png, "icon.png", "icon", {}, badDB)).status, 503);
assert.equal(env.APP_APKS.files.size, before);
const stream = new ReadableStream({
  start(c) {
    c.enqueue(new Uint8Array(5 * 1024 * 1024));
    c.enqueue(new Uint8Array(1));
    c.close();
  },
});
assert.equal(
  (await send(stream, "icon.png", "icon", { "content-length": "1" })).status,
  413,
);
const beforeExpiry = env.APP_APKS.files.size;
const expiryStream = new ReadableStream(
  {
    pull(c) {
      DB.sqlite.exec("UPDATE admin_sessions SET expires_at=0");
      c.enqueue(png);
      c.close();
    },
  },
  { highWaterMark: 0 },
);
assert.equal(
  (await send(expiryStream)).status,
  401,
  "Session expiring during body read must reject upload before storage",
);
assert.equal(env.APP_APKS.files.size, beforeExpiry);
console.log(
  "Files: bounded upload, type/hash/ownership checks, immutable keys, private previews and R2/D1 failure cleanup PASS.",
);
