import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const paths = [];
const context = {
  window: {},
  fetch: async (path) => {
    paths.push(path);
    return { ok: true, json: async () => ({ apps: [{ slug: "example" }] }) };
  },
  URL,
};
vm.runInNewContext(
  fs.readFileSync("public/catalogue-client.js", "utf8"),
  context,
);
assert.equal(
  (await context.window.HailiteCatalogue.fetchCatalog()).apps[0].slug,
  "example",
);
assert.equal(paths[0], "/api/apps/catalog");
for (const bad of [
  "javascript:alert(1)",
  "//evil.test",
  "http://evil.test",
  "/x/../y",
  "/x/%2e%2e/y",
  "https://a.test\\@evil.test",
])
  assert.equal(context.window.HailiteCatalogue.safeHref(bad), null);
assert.equal(
  context.window.HailiteCatalogue.safeHref("/hailite-manager"),
  "/hailite-manager",
);
assert.equal(
  context.window.HailiteCatalogue.safeHref("https://example.com/"),
  "https://example.com/",
);
context.fetch = async () => ({ ok: false });
await assert.rejects(context.window.HailiteCatalogue.fetchCatalog());
assert.ok(!paths.includes("/app-data.json"));
console.log(
  "Catalogue client: live API only, no stale fallback, unsafe links rejected PASS.",
);
