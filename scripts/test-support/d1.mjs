import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
export function database() {
  const sqlite = new DatabaseSync(":memory:");
  const DB = {
    sqlite,
    prepare(sql) {
      return {
        values: [],
        bind(...v) {
          this.values = v;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...this.values) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...this.values) };
        },
        async run() {
          const r = sqlite.prepare(sql).run(...this.values);
          return { meta: { changes: Number(r.changes) } };
        },
      };
    },
    async batch(stmts) {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const s of stmts) result.push(await s.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return DB;
}
export function migrate(DB) {
  DB.sqlite.exec(
    fs.readFileSync(
      new URL("../../migrations/0003_app_administration.sql", import.meta.url),
      "utf8",
    ),
  );
}
export const app = {
  slug: "liescope",
  name: "Liescope",
  category: "games",
  stage: "web",
  icon: null,
  accent: "#3fc6ff",
  fr: "Application de test",
  en: "Test application",
  featuresFr: [],
  featuresEn: [],
  screenshots: [],
  webUrl: "https://liescope.vercel.app/",
  purchaseUrl: null,
  apk: null,
  distribution: "free",
};
export function assets(apps = [app]) {
  return {
    async fetch() {
      return Response.json({ apps });
    },
  };
}
export function bucket() {
  const files = new Map();
  return {
    files,
    async put(key, bytes, options) {
      files.set(key, { bytes: new Uint8Array(bytes), options });
    },
    async head(key) {
      const f = files.get(key);
      return f ? { size: f.bytes.byteLength } : null;
    },
    async get(key) {
      const f = files.get(key);
      return f ? { size: f.bytes.byteLength, body: f.bytes } : null;
    },
    async delete(key) {
      files.delete(key);
    },
  };
}
