# app-prog — le Programme de l'Espace jeunes de Selles-sur-Cher

Une page publique pensée pour le téléphone, qui présente le programme un jour par écran, et un espace créateur pour construire le calendrier.
Hébergement : **Cloudflare Workers** (fichiers statiques + API), comme les autres applications du compte. Données : base **D1** `app-prog` (privée).

- Page publique : `https://app-prog.<sous-domaine>.workers.dev/`
- Espace créateur : `…/#createur` (connexion par mot de passe)

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
2. **Définir le mot de passe** : Worker `app-prog` → *Settings* → *Variables and Secrets* → *Add* → type **Secret**, nom `ADMIN_PASSWORD`, valeur = un mot de passe long (12 caractères ou plus).

Ensuite, chaque modification poussée sur `main` est redéployée automatiquement.
Les tables sont créées automatiquement à la première visite.

## Sauvegardes

- Espace créateur → **Paramètres** → **Sauvegarde** : télécharge un fichier JSON complet (paramètres, activités types, brouillons, journées en ligne). Il peut être restauré au même endroit.
- Changer `ADMIN_PASSWORD` déconnecte tous les appareils.

## Développement local

```
npm i -D wrangler
echo "ADMIN_PASSWORD=mot-de-passe-local" > .dev.vars
npx wrangler dev --local
```
