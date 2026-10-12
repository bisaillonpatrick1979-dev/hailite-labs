export function fail(status, erreur) {
  const e = new Error(erreur);
  e.status = status;
  throw e;
}
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}
export function errorResponse(e) {
  return json(
    { ok: false, erreur: e.status ? e.message : "serveur_indisponible" },
    e.status || 503,
  );
}
export async function readBounded(request, limit) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit))
    fail(413, "fichier_trop_grand");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  let size = 0;
  // Allocate once for honest known lengths; unknown streams use the hard limit.
  // No chunk array plus a second full-size concatenation buffer.
  let buffer = new Uint8Array(
    declared && Number(declared) > 0 ? Number(declared) : limit,
  );
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const next = size + value.byteLength;
      if (next > limit) {
        await reader.cancel();
        fail(413, "fichier_trop_grand");
      }
      if (next > buffer.byteLength) {
        const expanded = new Uint8Array(limit);
        expanded.set(buffer.subarray(0, size));
        buffer = expanded;
      }
      buffer.set(value, size);
      size = next;
    }
  } catch (e) {
    try {
      await reader.cancel();
    } catch {}
    throw e;
  }
  return buffer.subarray(0, size);
}
export async function readJson(request, limit = 65536) {
  try {
    const value = JSON.parse(
      new TextDecoder().decode(await readBounded(request, limit)),
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail(400, "requete_invalide");
    return value;
  } catch (e) {
    if (e.status) throw e;
    fail(400, "requete_invalide");
  }
}
