import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import worker from "../src/index.js";
import { database, migrate, assets, app, bucket } from "./test-support/d1.mjs";
import { saveDraft } from "../src/catalogue.js";
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.HAILITE_JSDOM_MODULE || "jsdom");
const tick = () => new Promise((r) => setTimeout(r, 0));
async function waitFor(fn) {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await tick();
  }
  throw Error("UI condition timed out");
}
async function harness() {
  const DB = database();
  migrate(DB);
  const a = { ...app, icon: "/assets/logo.svg" },
    b = { ...app, slug: "second-app", name: "Second app" };
  const env = {
    DB,
    ASSETS: assets([a, b]),
    APP_APKS: bucket(),
    ADMIN_PASSWORD: "test-password-long-enough",
    ADMIN_SESSION_SECRET: "test-secret-at-least-thirty-two-characters",
  };
  const dom = new JSDOM(fs.readFileSync("public/admin.html", "utf8"), {
    url: "https://hailitelabs.com/admin",
    runScripts: "outside-only",
  });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.confirm = () => true;
  let cookie = "",
    pause = null;
  const calls = [];
  w.fetch = async (path, options = {}) => {
    const method = options.method || "GET",
      headers = {
        ...options.headers,
        ...(cookie ? { cookie } : {}),
        ...(method === "GET" ? {} : { origin: "https://hailitelabs.com" }),
      };
    calls.push({
      path,
      method,
      body: options.body ? JSON.parse(options.body) : null,
    });
    if (pause && pause.path === path) await pause.promise;
    const r = await worker.fetch(
      new Request(new URL(path, w.location.href), {
        method,
        headers,
        body: options.body,
      }),
      env,
    );
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return r;
  };
  w.eval(fs.readFileSync("public/app.js", "utf8"));
  w.eval(fs.readFileSync("public/admin.js", "utf8"));
  const el = (id) => w.document.getElementById(id);
  await tick();
  el("password").value = env.ADMIN_PASSWORD;
  el("loginForm").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await waitFor(() => !el("studio").hidden);
  const select = (index = 0) =>
    w.document.querySelectorAll(".admin-app-button")[index].click();
  const edit = (id, value) => {
    el(id).value = value;
    el(id).dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  const submit = async () => {
    el("editorForm").dispatchEvent(
      new w.Event("submit", { bubbles: true, cancelable: true }),
    );
    await waitFor(() => !el("saveApp").disabled);
  };
  const delay = (path) => {
    let release;
    pause = { path, promise: new Promise((r) => (release = r)) };
    return () => {
      release();
      pause = null;
    };
  };
  return {
    w,
    env,
    el,
    calls,
    select,
    edit,
    submit,
    delay,
    close: () => dom.window.close(),
  };
}
test("Renaming a static app preserves its slug", async () => {
  const h = await harness();
  h.select();
  h.edit("name", "Liescope Plus");
  assert.equal(
    h.el("slug").value,
    "liescope",
    "Renaming a static app preserves its original slug",
  );
  assert.equal(h.el("slug").readOnly, true);
  await h.submit();
  assert.equal(
    (await h.env.DB.prepare("SELECT COUNT(*) AS n FROM app_records").first()).n,
    1,
  );
  h.close();
});
test("Pending publication locks navigation and media", async () => {
  const h = await harness();
  h.select();
  await h.submit();
  const release = h.delay("/api/admin/apps/liescope/publish");
  h.el("publishApp").click();
  await waitFor(() => h.el("saveApp").disabled);
  assert.ok(
    [...h.w.document.querySelectorAll(".admin-app-button")].every(
      (b) => b.disabled,
    ),
    "Busy operation locks all sidebar buttons",
  );
  assert.ok(
    [...h.w.document.querySelectorAll(".media-item button")].every(
      (b) => b.disabled,
    ),
    "Busy operation locks media removal",
  );
  h.select(1);
  assert.equal(h.el("name").value, "Liescope");
  release();
  await waitFor(() => !h.el("saveApp").disabled);
  assert.equal(h.el("name").value, "Liescope");
  h.close();
});
test("Revision conflict reloads fresh server data", async () => {
  const h = await harness();
  h.select();
  await h.submit();
  await saveDraft(h.env, { ...app, name: "Server update" }, 1);
  h.edit("name", "Unsaved local change");
  await h.submit();
  assert.ok(h.el("adminStatus").textContent.includes("onglet"));
  assert.ok(
    h.el("reloadApp") && !h.el("reloadApp").hidden,
    "Conflict offers a server-backed reload",
  );
  h.w.confirm = () => false;
  h.el("reloadApp").click();
  await tick();
  assert.equal(h.el("name").value, "Unsaved local change");
  h.w.confirm = () => true;
  h.el("reloadApp").click();
  await waitFor(() => h.el("name").value === "Server update");
  h.edit("fr", "Updated after reload");
  await h.submit();
  assert.equal(
    h.calls.filter((x) => x.method === "PUT").at(-1).body.expectedRevision,
    2,
  );
  assert.equal(
    (
      await h.env.DB.prepare("SELECT revision FROM app_records WHERE slug=?")
        .bind(app.slug)
        .first()
    ).revision,
    3,
  );
  h.close();
});
test("Untouched static app can be unpublished", async () => {
  const h = await harness();
  h.select();
  h.el("unpublishApp").click();
  await waitFor(() => !h.el("saveApp").disabled);
  assert.ok(
    h.el("adminStatus").textContent.includes("retirée"),
    "Initial unpublish succeeds",
  );
  const catalog = await worker.fetch(
    new Request("https://hailitelabs.com/api/apps/catalog"),
    h.env,
  );
  assert.equal(
    (await catalog.json()).apps.some((a) => a.slug === app.slug),
    false,
  );
  h.close();
});
test("Expired session keeps the editable form", async () => {
  const h = await harness();
  h.select();
  await h.submit();
  h.edit("fr", "Keep this unsaved description");
  h.env.DB.sqlite.exec("UPDATE admin_sessions SET expires_at=0");
  await h.submit();
  assert.equal(h.el("studio").hidden, true);
  assert.equal(h.el("fr").value, "Keep this unsaved description");
  h.el("password").value = h.env.ADMIN_PASSWORD;
  h.el("loginForm").dispatchEvent(
    new h.w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await waitFor(() => !h.el("studio").hidden);
  assert.equal(h.el("fr").value, "Keep this unsaved description");
  h.close();
});
