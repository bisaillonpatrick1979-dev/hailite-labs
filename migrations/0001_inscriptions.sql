-- Table des inscriptions à l'infolettre Hailite Labs
-- (déjà créée dans la base D1 « hailite-labs-db »; gardée ici comme référence)
CREATE TABLE IF NOT EXISTS inscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  courriel TEXT NOT NULL UNIQUE,          -- adresse courriel (en minuscules)
  langue TEXT NOT NULL DEFAULT 'fr',      -- langue choisie sur le site : fr ou en
  source TEXT,                            -- section du site d'où vient l'inscription
  consentement INTEGER NOT NULL DEFAULT 1,-- consentement explicite (LCAP / CASL)
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
