# app-prog — le Programme de l'Espace jeunes de Selles-sur-Cher

Une page publique pensée pour le téléphone, qui présente le programme un jour par écran, et un espace créateur pour construire le calendrier.
Hébergement : **Cloudflare Workers** (fichiers statiques + API), comme les autres applications du compte. Données : base **D1** `app-prog` (privée).

- Page publique : `https://app-prog.<sous-domaine>.workers.dev/`
- Espace créateur : `…/#createur` (jeton `APP_TOKEN`, comme App Budget)

## Structure

```
public/index.html   l'application (page publique + espace créateur)
src/worker.js       point d'entrée : /api/* → API, le reste → public/
src/api.js          l'API : lecture publique, connexion, enregistrement, images, sauvegarde
src/seed.js         données de départ (périodes 2026-2027 zone B, 45 activités types), insérées si la base est vide
wrangler.jsonc      configuration (base D1 « app-prog » déjà liée sous le nom DB)
```

## Mise en place sur Cloudflare (une seule fois)

La base D1 `app-prog` existe déjà et elle est déclarée dans `wrangler.jsonc`.

1. **Relier le dépôt** : tableau de bord → *Workers & Pages* → *Create* → **Import a repository** → `applicationfreestudio/app-prog` → nom du projet `app-prog` → *Deploy* (commande de déploiement par défaut : `npx wrangler deploy`).
2. **Définir le jeton** : Worker `app-prog` → *Settings* → *Variables and Secrets* → *Add* → type **Secret**, nom `APP_TOKEN`, valeur = une longue chaîne aléatoire (32 caractères ou plus). C'est ce jeton qu'on colle dans l'espace créateur.
3. **Vérifier** : `https://app-prog.<sous-domaine>.workers.dev/api/health` doit répondre `"db": true, "token": true`.

Ensuite, chaque modification poussée sur `main` est redéployée automatiquement.
Les tables sont créées automatiquement à la première visite.

## Accès des utilisateurs externes

Même principe qu'App Budget, avec une liste propre à app-prog :

1. La personne ouvre `…/#acces` et envoie une demande (prénom, nom, adresse mail). Son appareil garde une clé personnelle ; le serveur n'en garde que l'empreinte.
2. L'administrateur accepte, refuse, révoque ou supprime depuis **Paramètres → Accès des utilisateurs**, et coche les droits.
3. Droits disponibles :
   - `brouillons` : consulter le calendrier non publié (lecture seule).

Le catalogue des droits est dans `src/acces.js` (`DROITS`).

## Sauvegardes

- Espace créateur → **Paramètres** → **Sauvegarde** : télécharge un fichier JSON complet (paramètres, activités types, brouillons, journées en ligne). Il peut être restauré au même endroit.
- Changer `APP_TOKEN` déconnecte tous les appareils.

## Développement local

```
npm i -D wrangler
echo "APP_TOKEN=jeton-local" > .dev.vars
npx wrangler dev --local
```
