(() => {
  function safeHref(value) {
    if (typeof value !== "string" || /[\s\\\u0000-\u001f]/.test(value))
      return null;
    let decoded;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      return null;
    }
    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      decoded.split(/[/?#]/).some((x) => x === ".." || x === ".")
    )
      return null;
    if (value.startsWith("/") && !value.startsWith("//")) return value;
    try {
      const u = new URL(value);
      if (u.protocol === "https:" && !u.username && !u.password) return u.href;
    } catch {}
    return null;
  }
  async function fetchCatalog() {
    const r = await fetch("/api/apps/catalog", { cache: "no-store" });
    if (!r.ok) throw Error("catalogue");
    const data = await r.json();
    if (!Array.isArray(data.apps)) throw Error("catalogue");
    return data;
  }
  window.HailiteCatalogue = { fetchCatalog, safeHref };
})();
