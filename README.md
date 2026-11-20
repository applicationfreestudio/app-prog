# app-prog — le Programme de l'Espace jeunes de Selles-sur-Cher

Une page publique pensée pour le téléphone, qui présente le programme un jour par écran, et un espace créateur pour construire le calendrier.
Hébergement : **Cloudflare Pages**. API : **Pages Functions**. Données : base **D1** privée.

- Page publique : `https://<projet>.pages.dev/`
- Espace créateur : `https://<projet>.pages.dev/#createur` (connexion par mot de passe)

## Structure

```
public/index.html          l'application (page publique + espace créateur)
functions/api/[[path]].js   l'API : lecture publique, connexion, enregistrement, images, sauvegarde
functions/_seed.js          données de départ (périodes 2026-2027 zone B, 45 activités types), insérées si la base est vide
```

## Mise en place sur Cloudflare (une seule fois)

1. **Créer la base D1** : tableau de bord Cloudflare → *Storage & Databases* → **D1** → *Create* → nom `app-prog`.
2. **Créer le projet Pages** : *Workers & Pages* → *Create* → onglet **Pages** → *Connect to Git* → choisir le dépôt `app-prog`.
   - Framework preset : *None*
   - Build command : *(vide)*
   - Build output directory : `public`
3. **Lier la base** : projet → *Settings* → *Bindings* → *Add* → **D1 database** → nom de variable `DB` → base `app-prog`.
4. **Définir le mot de passe** : projet → *Settings* → *Variables and Secrets* → *Add* → type **Secret**, nom `ADMIN_PASSWORD`, valeur = un mot de passe long (12 caractères ou plus).
5. **Redéployer** : *Deployments* → dernier déploiement → *Retry deployment*. Les liaisons ne s'appliquent qu'aux nouveaux déploiements.

Les tables sont créées automatiquement à la première visite.

## Sauvegardes

- Espace créateur → **Paramètres** → **Sauvegarde** : télécharge un fichier JSON complet (paramètres, activités types, brouillons, journées en ligne). Il peut être restauré au même endroit.
- Changer `ADMIN_PASSWORD` déconnecte tous les appareils.

## Développement local

```
npm i -D wrangler
echo "ADMIN_PASSWORD=mot-de-passe-local" > .dev.vars
npx wrangler pages dev public --d1 DB=local-db
```
