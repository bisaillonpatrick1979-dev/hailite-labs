# Hailite Labs

Site vitrine bilingue FR/EN de Hailite Labs — hébergé sur **Cloudflare Workers**, déployé automatiquement à chaque `git push` sur `main`.

## Structure

```
public/                 ← le site (tout ce qui est ici est publié)
  index.html            ← page d'accueil
  confidentialite.html  ← politique de confidentialité (LCAP / LPRPDE)
  merci.html            ← page après inscription (si JavaScript désactivé)
  404.html              ← page d'erreur
  styles.css, app.js
  robots.txt, sitemap.xml
  assets/               ← logo, image d'aperçu pour les partages
src/index.js            ← Worker : API d'inscription à l'infolettre
migrations/             ← structure de la base D1
wrangler.jsonc          ← configuration Cloudflare (le nom doit rester « hailite-labs »)
```

## Infolettre

- Le formulaire envoie à `POST /api/inscription`, qui enregistre dans la base **D1 `hailite-labs-db`** (table `inscriptions`).
- Consentement explicite obligatoire (case à cocher), piège anti-robots, pas de doublons.
- Voir la liste : Cloudflare → Storage & databases → D1 → `hailite-labs-db` → Console :
  `SELECT courriel, langue, cree_le FROM inscriptions ORDER BY cree_le DESC;`

## Courriel contact@hailitelabs.com (Cloudflare Email Routing — gratuit)

1. Cloudflare → **hailitelabs.com** → **Email** → **Email Routing** → **Get started**
2. Adresse personnalisée : `contact` → destination : ta boîte Gmail → confirmer le courriel de vérification
3. Accepter l'ajout automatique des enregistrements DNS (MX + SPF)
4. Optionnel : ajouter d'autres adresses (`support@`, `ventes@`, `patrick@`…) de la même façon

## Liste de vérification — jour du lancement

- [ ] Email Routing actif et testé (envoyer un courriel à contact@hailitelabs.com)
- [ ] Retirer `<meta name="robots" content="noindex, nofollow">` dans `public/index.html` et `public/confidentialite.html`
- [ ] Remplacer le contenu de `public/robots.txt` (instructions dans le fichier)
- [ ] Worker → Paramètres → Domaines et routes → ajouter `hailitelabs.com` et `www.hailitelabs.com`
- [ ] Désactiver l'adresse `workers.dev` une fois le domaine actif
- [ ] Tester le formulaire en ligne et vérifier la ligne dans D1

## Prochaines étapes

- Photos et captures réelles de Hailite Manager
- Page produit Hailite Manager + lien d'achat (Payhip / boutique)
- Outil d'envoi de l'infolettre (avec lien de désabonnement)

© 2026 Hailite Labs

## Catalogue Android / APK (octobre 2026)

- Catalogue bilingue : `/applications` (`public/applications.html`, `public/applications.js`, `public/applications.css`).
- Données éditoriales : `public/app-data.json` (statut, icône, URL Web, captures réelles, APK).
- Captures Hailite Manager : `public/app-assets/` (copies des captures de boutique du dépôt original).
- Vérification de téléchargement : `GET /api/apps/releases` (liste les APK effectivement présents dans R2).
- Téléchargement direct : `GET /api/download/:slug` (flux binaire avec en-tête Android et nom de fichier).
- **Aucun APK publié actuellement.** Ne pas ajouter de lien qui pointe vers un fichier inexistant.
- Pour activer les APK : créer un bucket R2 `hailite-labs-apks` dans Cloudflare, ajouter au `wrangler.jsonc` le binding `r2_buckets: [{ "binding":"APP_APKS", "bucket_name":"hailite-labs-apks" }]`, puis déployer.
- Construire et signer l'APK de production (même clé et `applicationId` pour toutes les mises à jour d'une même application), vérifier l'APK et calculer son SHA-256.
- Déposer le fichier dans R2 à la clé `releases/<slug>/<slug>-<version>.apk`, puis renseigner `apk: {"key":"releases/<slug>/<slug>-<version>.apk","version":"1.0.0","sha256":"<64 caractères hexadécimaux>"}` dans la fiche du produit.
- Après déploiement, `/api/apps/releases` n'affichera un APK que si la configuration, le manifeste et le fichier R2 correspondent. Tester le téléchargement depuis un vrai téléphone Samsung/Android avant toute annonce publique.
- Ajouter uniquement de **vraies captures d'écran**. Quand il n'y en a pas, l'interface indique clairement qu'elles sont à venir.
- Faire approuver les politiques applicables aux distributions hors boutique; ne pas tenter d'installation Android silencieuse.

## Studio propriétaire et catalogue persistant

La refonte ajoute `/admin` pour créer des fiches FR/EN, conserver des brouillons, téléverser icônes/captures/APK et publier explicitement. Les données sont stockées dans D1; les fichiers restent dans R2 privé. Les fichiers d’un brouillon et tous les APK payants sont exclus de l’accès public. L’accueil et `/applications` utilisent désormais `/api/apps/catalog`.

L’activation de D1/R2 et des deux secrets propriétaire est détaillée dans [docs/cloudflare-admin-setup.md](docs/cloudflare-admin-setup.md). Le binding R2 n’est pas ajouté automatiquement : un bucket absent a déjà bloqué les déploiements de ce projet.

Vérification serveur (Node.js 24, SQLite intégrée; aucun paquet npm à installer) :

```bash
node scripts/test-all.mjs
```

Les APK sont limités à 50 Mio et les images à 5 Mio. La galerie de fichiers est accessible sur appareil mobile, sans forcer la caméra. Les contrôles binaires et SHA-256 ne remplacent pas les tests/signatures d’un APK de production.

Pour inclure les cinq scénarios d’interface DOM (les dépendances servent uniquement aux tests) :

```bash
npm ci --ignore-scripts
npm test
```

Le workflow GitHub exécute également cette suite avec Node.js 24. Les scénarios DOM vérifient les interactions et les requêtes réelles du Worker; ils ne remplacent pas une vérification visuelle dans un navigateur ni un test Android.
