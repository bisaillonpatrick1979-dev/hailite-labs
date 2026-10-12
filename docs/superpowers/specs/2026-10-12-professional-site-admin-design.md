# Hailite Labs — refonte et ajout d’applications

Date : 12 octobre 2026. Direction générale approuvée par Patrick.
État : cahier de conception validé par Patrick le 12 octobre 2026; plan de réalisation en préparation.

## Résultat attendu

Un site professionnel sur hailitelabs.com, bilingue français/anglais, agréable sur téléphone et tablette. Patrick peut ajouter et mettre à jour ses applications depuis son appareil : fiche, icône, captures réelles, lien Web, lien d’achat et fichier Android APK. Il peut vérifier un aperçu, enregistrer un brouillon et publier lorsqu’il est prêt.

## Direction visuelle

- Conserver Hailite Labs et son logo. Fond bleu nuit, accents bleu électrique, détails argentés, contraste élevé.
- Accueil centré sur les applications : titre clair, bouton vers le catalogue, produit mis en avant et cartes issues du catalogue publié.
- Réduire les éléments décoratifs qui prennent la place du contenu; utiliser les vraies icônes et captures disponibles.
- Catalogue avec recherche, catégories et fiches cohérentes. Afficher clairement la disponibilité réelle : Web, APK ou développement.
- Texte courant d’au moins 18 px, zones tactiles d’au moins 48 px; mise en page sans débordement à 360 px et en paysage.
- Menu mobile, clavier, focus visible, dialogues accessibles et réduction des animations selon les préférences de l’appareil.
- Conserver les pages Hailite Manager, les parcours Stripe, les politiques et l’infolettre. Ne pas inventer d’avis, de chiffres de ventes ou de captures.

## Parcours administrateur

1. Ouvrir `/admin` et se connecter avec le mot de passe du propriétaire.
2. Voir les applications, leur statut de publication et leurs fichiers; choisir « Ajouter une application » ou « Modifier ».
3. Remplir nom, catégorie, descriptions et fonctionnalités FR/EN, statut du produit, distribution gratuite/payante, liens Web et achat.
4. Choisir l’icône, jusqu’à six captures et, facultativement, un APK. Le sélecteur accepte galerie et fichiers; il ne force pas la caméra.
5. Voir l’état du téléversement et les erreurs, puis enregistrer le brouillon. Un échec de transfert ne remplace jamais le fichier publié.
6. Ouvrir l’aperçu de la fiche et publier explicitement. Dépublier reste possible; la suppression définitive n’est pas nécessaire à cette première version.

Le brouillon est enregistré sur le serveur. Une nouvelle connexion ou un redéploiement du site conserve les applications et les fichiers. Les modifications d’une application déjà publiée restent privées jusqu’à une nouvelle publication. La liste d’administration permet de reprendre un brouillon.

## Architecture retenue

Réutiliser le Worker Cloudflare, la base D1 `hailite-labs-db` et les fichiers HTML/CSS/JS existants. Ajouter un module d’administration séparé dans `src/`, une migration D1 et une page `/admin`. Les fichiers sont stockés dans un bucket R2 privé, via le binding `APP_APKS` déjà prévu par le projet.

Le catalogue existant `public/app-data.json` fournit les fiches de départ. Une API publique retourne ces fiches, fusionnées avec les versions publiées en D1 : une fiche D1 remplace la fiche statique ayant le même slug. Une fiche dépubliée masque aussi son ancienne version statique. Cette règle évite les doublons et le retour involontaire d’une fiche dépubliée après un déploiement.

Les tables supplémentaires contiennent les brouillons et leurs versions publiées, les métadonnées des fichiers, les sessions et les compteurs de tentatives de connexion. Les migrations sont additives et n’altèrent pas les commandes Stripe ni les inscriptions.

Une publication utilise une écriture D1 atomique avec contrôle de révision. Si deux onglets modifient la même fiche, le second reçoit un message l’invitant à recharger au lieu d’écraser les nouvelles données.

## Accès et fichiers

- Mot de passe propriétaire et secret de signature configurés comme secrets Cloudflare, jamais dans Git, le HTML ou localStorage.
- Connexion limitée côté serveur; session signée, expirant après huit heures, cookie Secure, HttpOnly et SameSite=Strict; déconnexion avec révocation serveur.
- Vérifier l’authentification sur toutes les API d’administration, y compris le téléversement et l’aperçu. Vérifier l’origine et un jeton CSRF sur les mutations.
- Le stockage public ne contient aucun APK : les téléchargements passent par le Worker et ses contrôles de distribution.
- Icônes et captures : PNG, JPEG ou WebP, 5 Mio maximum par fichier; valider taille, extension et signature binaire. Les SVG téléversés ne sont pas acceptés.
- APK : 50 Mio maximum pour la première version, extension APK et format ZIP attendu. Calculer SHA-256 côté serveur; numéro de version obligatoire. Ces contrôles ne certifient ni la signature Android ni l’innocuité du logiciel : le propriétaire doit fournir une version de production signée et testée.
- Clés R2 construites côté serveur, uniques par transfert; aucune clé arbitraire fournie par le navigateur. Conserver la précédente version lors d’une mise à jour pour ne pas interrompre les visiteurs.
- La publication vérifie que les objets référencés existent et appartiennent à la fiche. Les images d’un brouillon restent privées; les images publiées sont accessibles via une route dédiée.
- Une application doit être explicitement classée gratuite pour qu’un APK soit servi publiquement. Hailite Manager reste payant. Pour les apps payantes, afficher le lien d’achat; le fichier reste privé. La livraison payante n’est pas étendue à de nouvelles applications dans cette refonte.
- Accepter uniquement les URLs HTTPS et les chemins internes sûrs; échapper les textes affichés. Refuser les URLs de script et les chemins traversant des répertoires.

## API et interfaces

| Route | Fonction |
| --- | --- |
| `GET /api/apps/catalog` | Catalogue publié, compatible avec les champs existants |
| `GET /api/apps/releases` | APK gratuits réellement disponibles |
| `GET /api/download/:slug` | Téléchargement de la version gratuite publiée |
| `GET /api/app-media/:id` | Image référencée par une fiche publiée |
| `POST /api/admin/login` | Connexion du propriétaire |
| `POST /api/admin/logout` | Révocation de la session |
| `GET /api/admin/session` | Session, jeton CSRF et disponibilité du stockage |
| `GET /api/admin/apps` | Fiches et brouillons administrables |
| `PUT /api/admin/apps/:slug` | Enregistrement d’un brouillon validé |
| `POST /api/admin/apps/:slug/uploads` | Téléversement d’un fichier lié à la fiche |
| `GET /api/admin/media/:id` | Prévisualisation privée d’un fichier |
| `POST /api/admin/apps/:slug/publish` | Publication explicite après validation |
| `POST /api/admin/apps/:slug/unpublish` | Retrait du catalogue public |

En cas d’absence de R2 ou des nouvelles tables, le catalogue initial reste consultable. Les API d’administration renvoient un état indisponible explicite; elles ne prétendent pas sauvegarder dans le navigateur. Une absence de secret désactive la connexion, sans mot de passe de secours.

## Mise en service

Avant d’ajouter le binding R2 à la configuration de production, créer et vérifier le bucket : l’historique du projet montre qu’un bucket absent bloque le déploiement. Appliquer la migration D1 et configurer les secrets propriétaire/session. Ne jamais recopier un secret dans le compte rendu.

La connexion GitHub et le dépôt sont accessibles. L’accès de gestion Cloudflare n’a pas été établi dans cette session; sa configuration constitue une dépendance de la mise en service, à résoudre avant de déclarer le téléversement opérationnel. À défaut, livrer le code testé et les étapes exactes encore nécessaires, sans annoncer une publication réussie sur le domaine.

## Vérification attendue

- Maintenir les tests existants du catalogue, des téléchargements payants et des ventes à vie Stripe.
- Tester les refus d’accès, expiration/révocation, limitation de connexion et mutations sans origine ou CSRF valides.
- Tester création, transfert, sauvegarde, reprise après reconnexion, aperçu privé, publication, mise à jour et dépublication.
- Tester fichiers trop volumineux, faux types, mauvais slug/URL, objet absent et conflits de révision.
- Confirmer qu’aucun brouillon ni APK payant n’est exposé par le catalogue, les médias ou la route de téléchargement.
- Vérifier FR/EN, menu, recherche, formulaires et aperçu sur formats téléphone/tablette; signaler toute vérification navigateur indisponible.
- Vérifier la mise en service sur le domaine et un vrai téléchargement Android avant d’affirmer que tout est opérationnel.

## Périmètre

Cette première livraison comprend la refonte, l’administration propriétaire, les fiches persistantes et le téléversement APK/images. Elle n’ajoute pas de compilation automatique d’APK, d’hébergement de code ZIP, de comptes vendeurs multiples, de nouvelle boutique Shopify ni de système supplémentaire de licences. Une application Web déjà déployée s’ajoute par son lien HTTPS.
