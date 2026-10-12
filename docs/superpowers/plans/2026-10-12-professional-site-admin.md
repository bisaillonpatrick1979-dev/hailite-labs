# Hailite Labs — Professional Site and App Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embellir Hailite Labs et permettre au propriétaire d’ajouter, téléverser, prévisualiser et publier ses applications depuis téléphone ou tablette.

**Architecture:** Conserver le Worker et le site HTML/CSS/JS. D1 stocke les brouillons, les versions publiées, les sessions et les métadonnées; R2 conserve les fichiers privés. Un catalogue fusionné alimente l’accueil, les fiches et les téléchargements.

**Tech Stack:** JavaScript ESM, Cloudflare Workers/D1/R2, Web Crypto, Node.js 24 pour les vérifications; aucun framework de frontend supplémentaire.

**Spec:** `docs/superpowers/specs/2026-10-12-professional-site-admin-design.md`

## Global Constraints

- Fond bleu nuit, accents bleu électrique, détails argentés, contraste élevé; marque et logo Hailite Labs conservés.
- Texte courant d’au moins 18 px, zones tactiles d’au moins 48 px; mise en page sans débordement à 360 px et en paysage.
- FR/EN, captures réelles uniquement; conserver Stripe, Hailite Manager, les politiques et l’infolettre.
- Session signée, expirant après huit heures, cookie Secure, HttpOnly et SameSite=Strict; révocation serveur.
- Icônes et captures : PNG, JPEG ou WebP, 5 Mio maximum par fichier; jusqu’à six captures; pas de SVG téléversé.
- APK : 50 Mio maximum pour la première version, extension APK et format ZIP attendu; SHA-256 côté serveur.
- Aucun brouillon ni APK payant public; Hailite Manager reste payant. Une app Web s’ajoute par lien HTTPS.
- Créer et vérifier R2 avant d’ajouter le binding; migrations additives; aucune sauvegarde simulée en localStorage.

## Review Focus

1. Mise à jour du même numéro de version : le fichier ancien doit rester intact tant que le brouillon n’est pas publié (tâche 3).
2. Dépublication d’une fiche provenant du JSON initial : elle ne doit pas réapparaître après un déploiement (tâche 1).
3. Corps téléversé sans Content-Length ou avec taille mensongère : l’application doit arrêter la lecture au plafond réel (tâche 3).
4. Deux onglets ouverts sur une même fiche : la seconde sauvegarde doit signaler un conflit, sans perdre la première (tâches 1 et 4).
5. Session expirée pendant un transfert : aucune publication automatique ni message de sauvegarde réussi; le formulaire reste récupérable (tâche 4).

## Structure des fichiers

| Fichier | Responsabilité |
| --- | --- |
| `src/catalogue.js` | Validation des fiches, fusion statique/D1, révisions et publication |
| `src/admin-auth.js` | Connexion, sessions, CSRF, limitation et déconnexion |
| `src/app-files.js` | Validation/transfert R2, métadonnées et accès aux fichiers |
| `src/admin.js` | Routage des API administratives vers les modules |
| `src/index.js` | Intégration des nouvelles routes aux routes actuelles |
| `migrations/0003_app_administration.sql` | Tables applications, fichiers, sessions, tentatives |
| `public/admin.html`, `public/admin.css`, `public/admin.js` | Interface propriétaire et aperçu |
| `public/catalogue-client.js` | Lecture du catalogue pour l’accueil et les fiches |
| `public/index.html`, `public/styles.css`, `public/app.js` | Accueil, navigation et style commun |
| `public/applications.html`, `public/applications.css`, `public/applications.js` | Catalogue et fiches publiques |
| `scripts/test-support/d1.mjs` | Adaptateur de test D1 fondé sur SQLite, pas sur des requêtes codées en dur |
| `scripts/test-admin-catalogue.mjs`, `scripts/test-admin-auth.mjs`, `scripts/test-app-files.mjs`, `scripts/test-admin-flow.mjs` | Vérification des comportements du serveur |
| `README.md`, `docs/cloudflare-admin-setup.md` | Mise en service et preuves de vérification |

## Contrats communs

`AppRecord` conserve les champs du JSON actuel : slug, name, category, stage, icon, accent, fr, en, featuresFr, featuresEn, screenshots, webUrl, apk, distribution; ajoute `purchaseUrl`. `DraftRecord` contient `{ app, revision, published, updatedAt }`. Pour une nouvelle fiche, le client envoie `expectedRevision: 0`; chaque sauvegarde incrémente la révision. Un slug existant est immuable.

`apk` contient `{ key, version, sha256, fileId }` pour un fichier transféré; les fichiers initiaux gardent leur format actuel. Une clé R2 transférée utilise `uploads/<slug>/<uuid>.<extension>` et est toujours résolue par sa ligne D1. Aucun chemin arbitraire du client n’est accepté. Le nom de téléchargement reste `<slug>-<version>.apk`.

Les réponses d’erreur utilisent `{ ok:false, erreur:<code> }` : 400 validation, 401 session absente/expirée, 403 origine/CSRF, 404 absent, 409 révision, 413 taille, 415 format, 429 connexion limitée, 503 configuration/stockage. Les interfaces affichent des messages FR/EN adaptés, sans détail interne.

### Task 1: Catalogue durable et publication atomique

**Files:** créer migration, `src/catalogue.js`, adaptateur SQLite et `scripts/test-admin-catalogue.mjs`; intégrer `GET /api/apps/catalog` dans `src/index.js`.

**Interfaces:** `readCatalog(env, request) -> Promise<AppRecord[]>`; `validateApp(input, slug) -> AppRecord`; `listDrafts(env, request) -> Promise<DraftRecord[]>`; `saveDraft(env, app, expectedRevision) -> Promise<DraftRecord>`; `setPublication(env, slug, expectedRevision, published, validateFiles) -> Promise<DraftRecord>`. `validateFiles(app)` est le contrôle de fichiers fourni par la tâche 3. Exposer ces fonctions comme exports nommés.

- [ ] **Step 1:** écrire les assertions de fusion, sauvegarde et dépublication : `assert.equal((await readCatalog(env, req)).filter(a=>a.slug==='liescope').length, 1)`; un brouillon ne change pas la description publique; après dépublication, `assert.equal(catalog.some(a=>a.slug==='liescope'), false)`, y compris après recréation du Worker avec la même base.
- [ ] **Step 2:** exécuter `node scripts/test-admin-catalogue.mjs`; constater l’échec dû au module absent.
- [ ] **Step 3:** créer la migration additive et les fonctions : JSON draft/published séparés, tombstone de dépublication, remplacement par slug; écriture conditionnelle sur révision. Rejeter noms/descriptions vides, catégories/statuts non existants, plus de six captures, slugs invalides, liens de script ou chemins dangereux. Les liens acceptés sont HTTPS ou internes commençant par `/` sans `//`, antislash ni segment de traversée; Hailite Manager ne devient jamais gratuit.
- [ ] **Step 4:** ajouter l’assertion de concurrence : deux sauvegardes avec la même révision donnent une réussite et un conflit 409; vérifier qu’aucune colonne commandes/inscriptions n’est modifiée. Exécuter `node scripts/test-admin-catalogue.mjs` et `node scripts/verify-app-catalog.mjs`; tous passent. Le catalogue reste disponible avec tables absentes; après une migration réussie, les autres erreurs D1 ne doivent pas masquer les publications derrière un catalogue statique périmé.
- [ ] **Step 5:** commit `feat: persist app drafts and published catalogue`.

### Task 2: Authentification du propriétaire

**Files:** créer `src/admin-auth.js`, `src/admin.js`, `scripts/test-admin-auth.mjs`; compléter migration et routage Worker.

**Interfaces:** `login(request, env) -> Promise<Response>`; `requireAdmin(request, env, mutation=false) -> Promise<{sessionId,csrf,expiresAt}>`; `logout(request, env) -> Promise<Response>`; `handleAdmin(request, env) -> Promise<Response>`. Secrets `ADMIN_PASSWORD` et `ADMIN_SESSION_SECRET`. Cookie `__Host-hailite-admin`, Path=/, durée 28800 secondes, sans Domain. Le CSRF se transmet par `X-CSRF-Token`.

- [ ] **Step 1:** écrire les assertions : login valide 200 et cookie Secure/HttpOnly/SameSite=Strict; mot de passe invalide 401; secret absent 503; sans cookie 401; cookie altéré/expiré/révoqué 401; mutation sans origine exacte ou CSRF 403; lecture admin d’un fichier sans session 401.
- [ ] **Step 2:** exécuter `node scripts/test-admin-auth.mjs`; constater l’échec initial.
- [ ] **Step 3:** implémenter session aléatoire signée HMAC-SHA256, ligne D1 de révocation et jeton CSRF aléatoire. Vérifier le mot de passe côté serveur avec une comparaison de condensats à temps constant. Limiter à cinq tentatives par fenêtre de quinze minutes par IP Cloudflare fiable, plus un plafond global de cinquante par fenêtre; compteur D1 atomique. Sans IP fiable, utiliser le compartiment partagé. Refuser les corps de connexion de plus de 4 Kio. Ne jamais journaliser ni stocker le mot de passe dans le navigateur.
- [ ] **Step 4:** ajouter les assertions : sixième tentative 429, expiration du compteur permet une tentative, logout révoque immédiatement, origine externe refuse même avec cookie valide. Exécuter `node scripts/test-admin-auth.mjs`; tout passe.
- [ ] **Step 5:** commit `feat: secure owner administration sessions`.

### Task 3: Téléversement et distribution des fichiers

**Files:** créer `src/app-files.js`, `scripts/test-app-files.mjs`; compléter `src/admin.js`, `src/index.js` et les tests existants de téléchargement.

**Interfaces:** `uploadFile(request, env, slug) -> Promise<Response>`; `validatePublishedFiles(env, app) -> Promise<void>`; `serveMedia(request, env, id, privatePreview=false) -> Promise<Response>`; `resolveApk(env, app) -> Promise<{key,version,sha256}|null>`. Requête de transfert : octets bruts, `X-File-Name`, query `kind=icon|screenshot|apk` et `version` pour APK; authentification/CSRF avant lecture.

- [ ] **Step 1:** écrire les assertions : PNG/JPEG/WebP valides acceptés; SVG, fausse signature et extension incohérente 415; image de 5 Mio + 1 et APK de 50 Mio + 1 donnent 413; APK ZIP accepté et SHA-256 correspond au fichier reçu; clé UUID unique pour deux transferts de la même version.
- [ ] **Step 2:** exécuter `node scripts/test-app-files.mjs`; constater l’échec initial.
- [ ] **Step 3:** implémenter lecture bornée réelle, contrôle binaire et taille, SHA-256 Web Crypto, R2 privé et ligne D1 après stockage réussi. Une erreur D1 après R2 provoque la suppression de ce nouveau fichier. Garder les anciennes versions; refuser la publication si un objet manque ou appartient à un autre slug. Lire les octets dans un seul buffer final; vérifier la limite mémoire avant de conserver la taille maximale de 50 Mio.
- [ ] **Step 4:** intégrer catalogue dynamique aux releases/downloads. Les anciennes clés strictement versionnées restent compatibles; les nouvelles clés ne sont utilisées que via métadonnées D1 contrôlées. Les images publiques exigent une référence dans le snapshot publié; les brouillons exigent la session. APK payant refusé avant lecture R2; download gratuit utilise MIME Android, nom versionné et nosniff.
- [ ] **Step 5:** ajouter les tests de corps sans longueur/mensongère, fichier orphelin privé, image de brouillon privée, absence R2 503 et transfert interrompu laissant la fiche publique intacte. Exécuter `node scripts/test-app-files.mjs` et `node scripts/test-paid-downloads.mjs`; tout passe. Vérifier transfert au plafond avec le runtime Worker si disponible; documenter une limite mémoire non vérifiée au lieu d’affirmer une capacité validée.
- [ ] **Step 6:** commit `feat: upload private app assets and verified free APKs`.

### Task 4: Administration accessible depuis téléphone et tablette

**Files:** créer `public/admin.html`, `public/admin.css`, `public/admin.js`, `scripts/test-admin-flow.mjs`; compléter `src/admin.js`.

**Interfaces:** UI utilise exactement les routes du cahier, `DraftRecord` et codes d’erreur communs. `GET /api/admin/session` fournit CSRF et indicateurs de configuration; toutes les réponses privées sont no-store. `/admin` sert la page sans exposer les données avant connexion.

- [ ] **Step 1:** écrire le scénario serveur avec SQLite/R2 de test : connexion, création, transfert, sauvegarde, lecture du brouillon, catalogue inchangé, publication, téléchargement, nouvelle connexion et reprise. Affirmer chaque statut et contenu, pas seulement la présence de fonctions.
- [ ] **Step 2:** exécuter `node scripts/test-admin-flow.mjs`; constater l’échec initial du routage incomplet.
- [ ] **Step 3:** construire écran de connexion puis liste/recherche et formulaire. Ajouter les champs bilingues, liens achat/Web, galerie jusqu’à six images, APK/version, boutons sauvegarder/aperçu/publier/dépublier et déconnexion. Afficher l’aperçu avec textContent et URLs validées; ne pas injecter du HTML fourni par la fiche. Sélecteurs sans attribut capture, labels visibles et boutons 48 px.
- [ ] **Step 4:** utiliser XMLHttpRequest pour progression du transfert; désactiver publication pendant transfert ou modifications non sauvegardées. Sur 401 garder les valeurs du formulaire en mémoire, proposer reconnexion puis sauvegarde explicite; sur 409 expliquer et proposer rechargement sans écraser. Ne pas annoncer un transfert ou une sauvegarde réussi avant réponse serveur.
- [ ] **Step 5:** étendre le scénario à session expirée, conflit, fichier rejeté et R2 absent. Exécuter `node scripts/test-admin-flow.mjs`; tout passe. Vérifier visuellement connexion/formulaire/aperçu et sélection galerie sur les surfaces disponibles; indiquer si l’appareil Android réel n’est pas disponible.
- [ ] **Step 6:** commit `feat: add mobile owner dashboard and app publishing workflow`.

### Task 5: Refonte de l’accueil et du catalogue

**Files:** créer `public/catalogue-client.js`; modifier index, styles communs, app.js et les trois fichiers applications.

**Interfaces:** `fetchCatalog() -> Promise<{apps:AppRecord[]}>` consomme `/api/apps/catalog`; pas de fallback navigateur sur un ancien catalogue statique après erreur réseau. Accueil et catalogue utilisent les mêmes fiches publiées; garder tous les liens produits et ancres utilisées par les visiteurs.

- [ ] **Step 1:** remplacer les éléments décoratifs dominants par une composition centrée sur Hailite Manager et les vrais visuels disponibles. Ajouter cartes dynamiques, catégories et CTA clairs; lien discret vers `/admin` dans le pied de page. Uniformiser typographie, espacement, menus et contrastes sans toucher la logique Stripe.
- [ ] **Step 2:** intégrer catalogue dynamique, état de chargement/erreur/vide, liens Web et liens d’achat validés. Une app payante montre l’achat; une app gratuite ne montre téléchargement que lorsqu’une release réelle est annoncée. Préserver FR/EN, recherche, filtres et dialogues avec fermeture/focus accessibles.
- [ ] **Step 3:** vérifier à 360 px, 768 px et en paysage : aucun débordement, textes courants 18 px, boutons 48 px, clavier utilisable et préférence reduced-motion respectée. Réaliser QA navigateur si le contrôle disponible le permet; consigner les vérifications indisponibles. Aucun test supplémentaire n’est nécessaire pour les seules couleurs/espacements.
- [ ] **Step 4:** exécuter `node scripts/verify-app-catalog.mjs` et les scénarios serveur; vérifier l’absence de liens fictifs, captures inventées et chiffres non documentés. Commit `feat: refresh Hailite Labs presentation and live app catalogue`.

### Task 6: Mise en service et vérification finale

**Files:** mettre à jour `README.md`, créer `docs/cloudflare-admin-setup.md`; modifier `wrangler.jsonc` seulement après vérification du bucket réel.

**Interfaces:** préserver le nom Worker `hailite-labs`, base D1 et secrets Stripe existants. Utiliser GitHub pour une branche/PR reviewable; le site existant est Cloudflare, ne pas créer un nouveau Site ChatGPT ni remplacer le domaine.

- [ ] **Step 1:** rechercher les capacités Cloudflare disponibles et les accès déjà autorisés. Si disponibles, créer/vérifier le bucket privé `hailite-labs-apks`, appliquer `0003_app_administration.sql`, configurer ADMIN_PASSWORD/ADMIN_SESSION_SECRET sans exposition et ajouter binding APP_APKS. Si absents, fournir les commandes et réglages exacts dans le guide; ne pas activer un bucket inexistant.
- [ ] **Step 2:** exécuter `node scripts/verify-app-catalog.mjs`, `node scripts/test-paid-downloads.mjs`, `node scripts/test-perpetual-sales.mjs`, `node scripts/test-perpetual-integration.mjs`, et les quatre nouveaux tests. Tous doivent passer; `git diff --check` doit rester silencieux. Vérifier syntaxe des modules et migration sur SQLite réelle.
- [ ] **Step 3:** relire la branche complète, en particulier authentification, isolement brouillon/public, cohérence révisions et paiement. Corriger les défauts observés et relancer uniquement les vérifications affectées, puis commit.
- [ ] **Step 4:** pousser la branche et créer une PR décrivant résultat, tests et éventuelles étapes Cloudflare restantes. Si publication sur main autorisée et possible, vérifier d’abord le dernier état distant et le déploiement associé; ne pas affirmer que le domaine a changé sur la seule base d’un push.
- [ ] **Step 5:** après activation, vérifier sur hailitelabs.com : session propriétaire, transfert d’image et d’APK de test signé autorisé, brouillon invisible, publication gratuite téléchargeable et APK payant refusé. Un test sur vrai Android est requis avant de déclarer le téléchargement opérationnel sur l’appareil de Patrick; sinon nommer cette limite.
- [ ] **Step 6:** fournir les liens site/admin/PR et un état exact : livré, publié ou encore bloqué par configuration. Aucun secret dans le compte rendu.

## Exécution proposée

Exécution native dans cette session : tâches réalisées dans l’ordre par l’agent principal, avec tests aux frontières et revue finale de la branche. Cette approche convient aux interfaces D1/R2 partagées et évite des modifications concurrentes du Worker. Patrick doit valider ce plan et sélectionner l’exécution avant le démarrage du code produit.
