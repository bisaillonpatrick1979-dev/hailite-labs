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
