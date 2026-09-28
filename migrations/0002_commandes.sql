-- Commandes d'abonnement Hailite Manager (une ligne par session Stripe Checkout)
-- Le NIP administrateur initial n'est gardé que 24 h (effacé à la lecture suivante).
CREATE TABLE IF NOT EXISTS commandes (
  session_id TEXT PRIMARY KEY,         -- session Stripe Checkout (cs_…)
  abonnement_id TEXT,                  -- abonnement Stripe (sub_…)
  code_entreprise TEXT,                -- code d'entreprise dans Hailite Manager
  nom_admin TEXT,
  nip_admin TEXT,                      -- NIP initial, effacé après 24 h
  palier TEXT,                         -- solo, equipe, entreprise
  courriel TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
