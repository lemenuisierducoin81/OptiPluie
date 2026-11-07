# OptiPluie

Relevé et classification des précipitations — **Le Menuisier du Coin**, Alban (81).

Application à ouvrir dans le navigateur du téléphone, installable sur l'écran
d'accueil, qui fonctionne sans réseau et enregistre les relevés dans un dépôt
GitHub pour que le téléphone, l'atelier et le bureau voient tous la même chose.

---

## Ce que fait l'appli

- **Saisie** : une ligne par jour (date, hauteur en mm, note facultative), plus
  un calendrier du mois en couleurs où chaque jour se corrige d'un appui.
- **Classification automatique** de chaque journée :

  | Classe | Hauteur sur 24 h |
  |---|---|
  | Sec | 0 mm |
  | Traces | 0,1 à 1 mm |
  | Faible | 1 à 5 mm |
  | Modérée | 5 à 15 mm |
  | Forte | 15 à 30 mm |
  | Très forte | plus de 30 mm |

  Ces seuils se changent dans **Réglages** sans toucher au code.

- **Bilans** : 7, 15 et 30 jours, 2 mois, 3 mois, 12 mois glissants, année en
  cours et total — avec pour chacun le cumul, le nombre de jours de pluie et le
  jour le plus arrosé. Plus le détail par mois, un graphique et la comparaison
  des années entre elles.
- **Historique** filtrable par année et par classe.
- **Export** CSV (ouvrable dans Excel) et JSON.

---

## Mise en place, une seule fois

### 1. Deux dépôts

GitHub Pages n'est gratuit que sur un dépôt public. Les relevés, eux, n'ont
aucune raison d'être publics. D'où deux dépôts :

| Dépôt | Visibilité | Contenu |
|---|---|---|
| `optipluie` | **public** | l'application (ce dossier) |
| `optipluie-donnees` | **privé** | le fichier `data/releves.json` |

Si la confidentialité des relevés est sans importance, un seul dépôt public
suffit : garde alors le même nom dans les deux cas.

### 2. Envoyer l'application

Sur [github.com](https://github.com), bouton **New repository**, nom
`optipluie`, coché **Public**, puis **Create repository**.

Ensuite, soit en glissant le contenu de ce dossier sur la page
(**uploading an existing file**), soit en ligne de commande :

```bash
cd OptiPluie
git init
git add .
git commit -m "OptiPluie — première version"
git branch -M main
git remote add origin https://github.com/TON-COMPTE/optipluie.git
git push -u origin main
```

> Envoie bien le **contenu** du dossier (`index.html` à la racine du dépôt),
> pas le dossier `OptiPluie` lui-même : sinon l'adresse aura un niveau en trop.

### 3. Activer GitHub Pages

Dans le dépôt : **Settings** → **Pages** → *Source* : **Deploy from a branch**,
branche `main`, dossier `/ (root)` → **Save**.

Au bout d'une minute, l'appli est en ligne à l'adresse :

```
https://TON-COMPTE.github.io/optipluie/
```

### 4. Créer le dépôt des données

**New repository**, nom `optipluie-donnees`, coché **Private**, et coche
**Add a README file** (un dépôt complètement vide n'a pas encore de branche).

Rien d'autre à faire : l'appli créera `data/releves.json` toute seule au premier
enregistrement.

### 5. Créer le jeton d'accès

C'est ce qui autorise l'appli à écrire dans le dépôt des données.

1. [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens)
   → **Generate new token** → *Fine-grained token*.
2. **Token name** : `OptiPluie`.
3. **Expiration** : au choix. Au-delà de la date, l'appli affichera « Jeton
   refusé » et il faudra en refaire un.
4. **Repository access** : *Only select repositories* → **optipluie-donnees**.
5. **Permissions** → *Repository permissions* → **Contents** : passer sur
   **Read and write**. Ne rien cocher d'autre.
6. **Generate token**, puis copier la clé affichée (`github_pat_…`).
   Elle ne sera plus jamais affichée ensuite.

### 6. Renseigner l'appli

Ouvrir `https://TON-COMPTE.github.io/optipluie/` → onglet **Réglages** :

| Champ | Valeur |
|---|---|
| Compte GitHub | ton identifiant GitHub |
| Dépôt des données | `optipluie-donnees` |
| Branche | `main` |
| Fichier | `data/releves.json` |
| Jeton d'accès | la clé copiée à l'étape 5 |

**Enregistrer**, puis **Tester** : le message doit confirmer la connexion.

### 7. Installer sur le téléphone

- **Android (Chrome)** : menu ⋮ → *Ajouter à l'écran d'accueil*.
- **iPhone (Safari)** : bouton Partager → *Sur l'écran d'accueil*.

L'appli s'ouvre alors en plein écran, sans barre de navigateur, et démarre même
sans réseau.

---

## Comment fonctionne la sauvegarde

Chaque relevé est écrit **deux fois** : dans le téléphone d'abord, dans le dépôt
GitHub ensuite. L'envoi part une seconde et demie après la saisie, puis à chaque
ouverture de l'appli et au retour du réseau.

La pastille en haut à droite dit où ça en est :

| Pastille | Signification |
|---|---|
| gris, « Local » | aucune synchronisation configurée |
| vert, « À jour » | téléphone et dépôt sont identiques |
| doré clignotant | envoi en cours ou en attente |
| gris, « Hors réseau » | pas de connexion, l'envoi se fera plus tard |
| rouge, « Erreur » | appuyer dessus pour lire le motif dans Réglages |

**Si deux appareils ont modifié la même date**, c'est la saisie la plus récente
qui est gardée — chaque ligne porte son heure de modification. Une suppression
est mémorisée comme telle, sinon la ligne effacée sur le téléphone
reviendrait depuis le dépôt à la synchronisation suivante.

Le dépôt gardant l'historique de ses versions, une fausse manipulation se
rattrape dans l'onglet **History** du fichier `data/releves.json` sur GitHub.

---

## Sécurité

- Le jeton est enregistré **dans le navigateur de l'appareil uniquement**. Il
  n'est écrit ni dans le dépôt, ni dans un fichier de ce dossier.
- Ne jamais coller le jeton dans un fichier du dépôt public, dans un message ou
  dans une conversation. En cas de doute, le révoquer sur
  [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens)
  et en générer un nouveau : les relevés ne sont pas affectés.
- Un téléphone perdu : révoquer le jeton, cela suffit à couper l'accès.
- Le jeton ne donne accès qu'au dépôt des données, à rien d'autre du compte.

---

## Contenu du dossier

```
OptiPluie/
├─ index.html              l'écran unique et ses quatre onglets
├─ css/style.css           mise en page, conçue pour un écran de téléphone
├─ js/app.js               saisie, calendrier, bilans, export
├─ js/github.js            lecture, écriture et fusion côté dépôt
├─ sw.js                   fonctionnement hors réseau
├─ manifest.webmanifest    installation sur l'écran d'accueil
├─ icons/                  icônes de l'application
├─ data/releves.json       fichier de relevés (vide au départ)
├─ .gitignore
└─ README.md
```

Aucune bibliothèque extérieure, aucun compte à créer en dehors de GitHub,
aucun suivi : les seuls appels réseau de l'appli vont vers `api.github.com`.

---

## Mise à jour de l'appli

Modifier le fichier voulu, le renvoyer sur le dépôt `optipluie`, et attendre une
minute. Si le téléphone affiche encore l'ancienne version, fermer puis rouvrir
l'appli : la nouvelle version est reprise au démarrage suivant. Les relevés ne
sont jamais touchés par une mise à jour.

---

## Petits soucis courants

| Symptôme | Cause la plus fréquente |
|---|---|
| « Jeton refusé » | jeton expiré, mal collé, ou droit *Contents* resté en lecture seule |
| « Dépôt, branche ou chemin introuvable » | nom du dépôt mal orthographié, ou branche `master` au lieu de `main` |
| « Accès refusé » | le dépôt des données n'est pas dans la liste du jeton |
| Page blanche après ouverture | Pages pas encore publié, ou `index.html` pas à la racine du dépôt |
| La virgule ne s'affiche pas à la saisie | signaler : le champ accepte virgule et point |
