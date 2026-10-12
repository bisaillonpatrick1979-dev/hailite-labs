import assert from "node:assert/strict";
import { database, migrate, assets, app } from "./test-support/d1.mjs";
import {
  readCatalog,
  validateApp,
  listDrafts,
  saveDraft,
  setPublication,
} from "../src/catalogue.js";
const freshDB = database();
migrate(freshDB);
const fresh = { DB: freshDB, ASSETS: assets() };
await setPublication(fresh, app.slug, 0, false, async () => {});
assert.equal(
  (
    await readCatalog(
      fresh,
      new Request("https://hailitelabs.com/api/apps/catalog"),
    )
  ).some((a) => a.slug === app.slug),
  false,
);
await assert.rejects(
  setPublication(fresh, app.slug, 0, false, async () => {}),
  (e) => e.status === 409,
);
const DB = database();
migrate(DB);
const env = { DB, ASSETS: assets() },
  req = new Request("https://hailitelabs.com/api/apps/catalog");
assert.equal((await readCatalog(env, req)).length, 1);
let draft = await saveDraft(
  env,
  validateApp({ ...app, fr: "Brouillon privé" }, app.slug),
  0,
);
assert.equal(draft.revision, 1);
assert.equal((await readCatalog(env, req))[0].fr, app.fr);
assert.equal((await listDrafts(env, req))[0].app.fr, "Brouillon privé");
await assert.rejects(saveDraft(env, app, 0), (e) => e.status === 409);
await setPublication(env, app.slug, 1, true, async () => {});
assert.equal(
  (await readCatalog(env, req)).filter((a) => a.slug === app.slug).length,
  1,
);
assert.equal((await readCatalog(env, req))[0].fr, "Brouillon privé");
await setPublication(env, app.slug, 2, false, async () => {});
assert.equal(
  (await readCatalog({ ...env }, req)).some((a) => a.slug === app.slug),
  false,
);
const saved = await saveDraft(env, app, 3);
assert.equal(saved.revision, 4);
await assert.rejects(
  saveDraft(env, { ...app, name: "Concurrent" }, 3),
  (e) => e.status === 409,
);
assert.equal((await listDrafts(env, req))[0].app.name, "Liescope");
for (const patch of [
  { slug: "../x" },
  { webUrl: "javascript:alert(1)" },
  { webUrl: "//evil.test" },
  { webUrl: "/a/%2e%2e/b" },
  { screenshots: Array(7).fill("/a.png") },
  { category: "bad" },
  { name: "" },
  { fr: "" },
  { distribution: undefined },
])
  assert.throws(
    () => validateApp({ ...app, ...patch }, patch.slug || app.slug),
    (e) => e.status === 400,
  );
assert.throws(() =>
  validateApp(
    { ...app, slug: "hailite-manager", distribution: "free" },
    "hailite-manager",
  ),
);
const noTables = { DB: database(), ASSETS: assets() };
assert.equal((await readCatalog(noTables, req)).length, 1);
await assert.rejects(
  readCatalog(
    {
      ASSETS: assets(),
      DB: {
        prepare() {
          throw Error("database unavailable");
        },
      },
    },
    req,
  ),
);
console.log(
  "Catalogue: drafts private, atomic revisions, tombstones, validation and migration fallback PASS.",
);
