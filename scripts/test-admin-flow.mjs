import assert from "node:assert/strict";
import worker from "../src/index.js";
import { database, migrate, assets, app, bucket } from "./test-support/d1.mjs";
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
let cookie = "",
  csrf = "";
async function send(path, method = "GET", body, extras = {}) {
  const headers = {
    ...(cookie ? { cookie } : {}),
    ...(method !== "GET" ? { origin, "x-csrf-token": csrf } : {}),
    ...extras,
  };
  if (body && typeof body !== "string" && !(body instanceof Uint8Array)) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(body);
  }
  return worker.fetch(
    new Request(origin + path, { method, headers, body }),
    env,
  );
}
async function connect() {
  const r = await send("/api/admin/login", "POST", {
    password: env.ADMIN_PASSWORD,
  });
  assert.equal(r.status, 200);
  cookie = r.headers.get("set-cookie").split(";")[0];
  const status = await send("/api/admin/session");
  assert.equal(status.status, 200);
  csrf = (await status.json()).csrf;
}
assert.equal((await send("/api/admin/apps")).status, 401);
await connect();
assert.equal((await send("/api/admin/apps")).status, 200);
const draftApp = { ...app, slug: "new-app", name: "New app" };
let r = await send("/api/admin/apps/new-app", "PUT", {
  app: draftApp,
  expectedRevision: 0,
});
assert.equal(r.status, 200);
let draft = (await r.json()).draft;
assert.equal(
  (await (await send("/api/apps/catalog")).json()).apps.some(
    (a) => a.slug === "new-app",
  ),
  false,
);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
r = await send("/api/admin/apps/new-app/uploads?kind=icon", "POST", png, {
  "x-file-name": "icon.png",
});
assert.equal(r.status, 200);
const file = (await r.json()).file;
const zip = new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4]);
r = await send(
  "/api/admin/apps/new-app/uploads?kind=apk&version=1.0.0",
  "POST",
  zip,
  { "x-file-name": "new-app.apk" },
);
assert.equal(r.status, 200);
const apk = (await r.json()).file;
r = await send("/api/admin/apps/new-app", "PUT", {
  app: {
    ...draftApp,
    icon: file.url,
    apk: {
      key: apk.key,
      fileId: apk.id,
      version: apk.version,
      sha256: apk.sha256,
    },
  },
  expectedRevision: draft.revision,
});
assert.equal(r.status, 200);
draft = (await r.json()).draft;
assert.equal((await send(file.url)).status, 404);
assert.equal((await send("/api/admin/media/" + file.id)).status, 200);
assert.equal((await send("/api/download/new-app")).status, 404);
r = await send("/api/admin/apps/new-app/publish", "POST", {
  expectedRevision: draft.revision,
});
assert.equal(r.status, 200);
draft = (await r.json()).draft;
assert.equal((await send(file.url)).status, 200);
r = await send("/api/download/new-app");
assert.equal(r.status, 200);
assert.deepEqual(new Uint8Array(await r.arrayBuffer()), zip);
assert.ok(r.headers.get("content-disposition").includes("new-app-1.0.0.apk"));
assert.equal(
  (
    await send("/api/admin/apps/new-app", "PUT", {
      app: draftApp,
      expectedRevision: 1,
    })
  ).status,
  409,
);
r = await send("/api/admin/apps/new-app", "PUT", {
  app: {
    ...draft.app,
    distribution: "paid",
    purchaseUrl: "https://shop.test/buy",
  },
  expectedRevision: draft.revision,
});
draft = (await r.json()).draft;
assert.equal(
  (await send("/api/download/new-app")).status,
  200,
  "Published free snapshot remains until explicit publication",
);
r = await send("/api/admin/apps/new-app/publish", "POST", {
  expectedRevision: draft.revision,
});
assert.equal(r.status, 200);
draft = (await r.json()).draft;
assert.equal((await send("/api/download/new-app")).status, 404);
r = await send("/api/admin/apps/new-app/unpublish", "POST", {
  expectedRevision: draft.revision,
});
assert.equal(r.status, 200);
assert.equal((await send(file.url)).status, 404);
await connect();
assert.equal(
  (await (await send("/api/admin/apps")).json()).drafts.find(
    (d) => d.app.slug === "new-app",
  ).app.name,
  "New app",
);
assert.equal(
  (
    await send(
      "/api/admin/apps/new-app",
      "PUT",
      { app: draftApp, expectedRevision: 999 },
      { "x-csrf-token": "" },
    )
  ).status,
  403,
);
DB.sqlite.exec("UPDATE admin_sessions SET expires_at=0");
assert.equal(
  (
    await send("/api/admin/apps/new-app/uploads?kind=icon", "POST", png, {
      "x-file-name": "icon.png",
    })
  ).status,
  401,
);
console.log(
  "Admin integration: login→draft→upload→preview→publish→download→paid protection→unpublish→reconnect and conflict/expired-session PASS.",
);
