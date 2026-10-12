import { spawnSync } from "node:child_process";
const files = [
  "verify-app-catalog.mjs",
  "test-paid-downloads.mjs",
  "test-perpetual-sales.mjs",
  "test-perpetual-integration.mjs",
  "test-admin-catalogue.mjs",
  "test-admin-auth.mjs",
  "test-app-files.mjs",
  "test-admin-flow.mjs",
  "test-catalogue-client.mjs",
];
for (const file of files) {
  const result = spawnSync(process.execPath, ["scripts/" + file], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`${files.length}/${files.length} verification scripts PASS.`);
