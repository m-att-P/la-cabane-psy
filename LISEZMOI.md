# La Cabane Psy — site + espace admin

## Contenu du dossier

```
public/              le site
  index.html         la page publique
  content.json       le contenu de départ, utilisé avant la première modification
  logo.png, icon.png
  admin/index.html   l'espace admin  →  https://ton-site/admin/
netlify/functions/
  api.mjs            le serveur : connexion, admins, enregistrement du contenu
package.json         dépendance @netlify/blobs (le stockage)
netlify.toml         réglages Netlify
```

Le contenu et les comptes admin sont enregistrés dans **Netlify Blobs**, le stockage intégré de Netlify (gratuit). Les mots de passe sont chiffrés : personne, même pas toi, ne peut les relire.

---

## Mise en ligne (une seule fois, environ 15 minutes)

### 1. Mettre le dossier sur GitHub
1. Crée un compte sur **github.com**, puis clique sur **New repository** et nomme-le `la-cabane-psy`.
2. Clique sur **uploading an existing file**.
3. Glisse **tout le contenu** du dossier : `public`, `netlify`, `package.json`, `netlify.toml`.
   ⚠️ Garde bien les dossiers. Il faut glisser les dossiers eux-mêmes, pas seulement les fichiers qu'ils contiennent.
4. Clique sur **Commit changes**.

### 2. Brancher Netlify
1. Sur **app.netlify.com**, clique sur **Add new site → Import an existing project → GitHub**, puis choisis `la-cabane-psy`.
2. Ne touche à rien dans les réglages de build et clique sur **Deploy**.

### 3. Ajouter les deux codes secrets
Dans Netlify, va dans **Site configuration → Environment variables → Add a variable** et ajoute :

| Nom | Valeur |
|---|---|
| `SESSION_SECRET` | une longue suite de caractères au hasard (au moins 30), par ex. `kP9x-Lm2q-Vt7r-Ze4w-Hb8n-Qs3y-Fd6j`. Tu n'auras jamais à la retaper. |
| `SETUP_CODE` | un code que tu choisis, par ex. `cabane-2026-xyz`. Il sert une seule fois, pour créer le premier compte. |

Ensuite, va dans **Deploys → Trigger deploy → Deploy site** pour que les codes soient pris en compte.

### 4. Créer ton compte admin
1. Va sur `https://ton-site.netlify.app/admin/`.
2. L'écran « Bienvenue » s'affiche : entre le `SETUP_CODE`, ton nom d'utilisateur et ton mot de passe.
3. C'est fait. Cet écran ne réapparaîtra plus jamais.

---

## Au quotidien

- **Modifier le site :** va sur `/admin/`, onglet **Contenu du site**, change ce que tu veux puis clique sur **Enregistrer et publier**. C'est en ligne immédiatement.
- **Mot en couleur dans un titre :** écris-le *entre étoiles*, par ex. `Nos *actions*`.
- **Ajouter un admin :** onglet **Administrateurs**, choisis un nom d'utilisateur, clique sur **Générer** pour le mot de passe, puis **Créer**. Les identifiants s'affichent : transmets-les à la personne.
- **Changer son mot de passe :** onglet **Mon compte**.
- **Mot de passe oublié :** un autre admin supprime le compte et le recrée.
  ⚠️ **Garde toujours au moins 2 admins**, sinon personne ne pourra plus se connecter.
- **Changer le logo ou les couleurs :** ça se fait sur GitHub, en modifiant les fichiers dans `public/`. Netlify republie tout seul.

## Nom de domaine
Dans Netlify, va dans **Domain management → Add a domain**, puis recopie les réglages DNS indiqués chez ton registrar (OVH…). Le HTTPS s'active automatiquement, ce qui est indispensable pour que les mots de passe circulent de façon chiffrée.
