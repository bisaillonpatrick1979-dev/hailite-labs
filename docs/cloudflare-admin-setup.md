# Activer le studio Hailite Labs dans Cloudflare

Le code utilise le Worker existant `hailite-labs` et la base D1 `hailite-labs-db`. Le site public continue à fonctionner si les ressources d’administration ne sont pas encore prêtes. L’administration affiche un message de configuration; elle ne simule pas de sauvegarde locale.

## Configuration requise

1. Cloudflare → Storage & databases → R2 : créer un bucket **privé** nommé `hailite-labs-apks`. Ne pas activer r2.dev ni un domaine public pour ce bucket.
2. Worker `hailite-labs` → Settings → Bindings : ajouter le binding R2 `APP_APKS` vers ce bucket. Comme le Worker est déployé depuis Git, ajouter aussi ce champ dans `wrangler.jsonc`, seulement après avoir confirmé que le bucket existe :

```json
"r2_buckets": [
  { "binding": "APP_APKS", "bucket_name": "hailite-labs-apks" }
]
```

3. Appliquer `migrations/0003_app_administration.sql` à la base existante. La migration ajoute des tables, sans supprimer les inscriptions ou les commandes. Depuis un poste avec Wrangler authentifié :

```bash
npx wrangler d1 migrations apply hailite-labs-db --remote
```

Depuis la console D1 du tableau de bord, le contenu du fichier SQL peut aussi être exécuté directement. Les `CREATE TABLE IF NOT EXISTS` permettent une reprise sans écraser les données.

4. Worker → Settings → Variables and Secrets : ajouter **comme secrets** `ADMIN_PASSWORD` (mot de passe unique, 16 caractères minimum) et `ADMIN_SESSION_SECRET` (valeur aléatoire, 32 caractères minimum; préférer 64). Ne jamais mettre ces valeurs dans les variables publiques, GitHub, le code ou les captures d’écran.
5. Redéployer le Worker après les changements de bindings/secrets. Vérifier que ses secrets Stripe et son binding D1 existants sont toujours présents.
6. Ouvrir `https://hailitelabs.com/admin`, se connecter et vérifier le message de stockage. Une session dure huit heures; cinq tentatives de connexion par IP en quinze minutes déclenchent une limitation temporaire.

## Premier ajout depuis téléphone/tablette

1. Ajouter une application; remplir FR/EN et choisir explicitement gratuite ou payante.
2. Enregistrer le brouillon une première fois.
3. Ajouter l’icône et les captures via galerie/fichiers : PNG, JPEG ou WebP, 5 Mio maximum chacune, six captures maximum. Ajouter éventuellement l’APK signé et son numéro de version : 50 Mio maximum.
4. Enregistrer le brouillon après le transfert, vérifier l’aperçu, puis toucher Publier.
5. Ouvrir le catalogue public dans un autre onglet; la nouvelle fiche doit être visible. Modifier la description et enregistrer : la description publique reste inchangée jusqu’à la publication suivante.
6. Une application gratuite avec APK publié montre le téléchargement. Une application payante propose son lien d’achat; son APK reste privé. Le système existant de vente Hailite Manager est conservé.

Une application Web se référence par son lien HTTPS. Le studio ne compile pas les projets et ne déploie pas le code d’un ZIP. Les contrôles ZIP/SHA-256 ne vérifient pas la signature Android ni l’innocuité du logiciel : fournir un APK de production signé et testé, jamais un ZIP renommé.

## Vérification avant annonce

- Le fichier d’un brouillon ne s’ouvre pas depuis sa route publique.
- Après publication, les captures s’ouvrent et l’APK gratuit se télécharge avec le bon numéro de version.
- Un APK payant répond 404 sur la route publique, y compris si une ancienne version gratuite a été remplacée par une version payante publiée.
- Dépublication retire la fiche et ses images publiques; le brouillon reste dans le studio.
- Une nouvelle connexion et un redéploiement conservent les données et les fichiers.
- Tester galerie, connexion, langue et installation avec un vrai appareil Android. La mémoire disponible d’un Worker pour un transfert de 50 Mio doit être vérifiée en production avant de présenter cette taille comme garantie.

## État de cette livraison

Le serveur est vérifié par neuf scripts locaux, dont un parcours Worker utilisant SQLite réelle et un bucket R2 de test. Cinq scénarios DOM vérifient aussi le renommage, les opérations en cours, les conflits entre onglets, la dépublication initiale et la conservation du formulaire après expiration de session. Les migrations ont été appliquées dans SQLite pour ces tests. L’environnement de développement ne dispose ni d’identifiants de gestion Cloudflare ni de contrôle navigateur disponible pour la prévisualisation gérée. Les ressources Cloudflare, le rendu visuel dans un navigateur et le téléchargement sur un vrai Android restent à vérifier. Un commit GitHub ou une PR ne prouve pas une publication réussie sur hailitelabs.com.
