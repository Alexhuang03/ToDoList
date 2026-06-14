# ToDoList

> Un gestionnaire de tâches web collaboratif — saisie ultra-rapide, organisation par sections, sous-missions, deadlines colorées et partage d'équipe sans friction.

---

## Le Concept

La plupart des outils de productivité sont trop complexes. **ToDoList** supprime la friction : pas de menus infinis ni de pop-ups intrusifs. Vous tapez votre tâche, l'application s'occupe de la trier. C'est l'outil parfait pour ceux qui veulent un espace de travail épuré sans sacrifier les fonctionnalités puissantes.

---

## Philosophie de Design

Le design de ToDoList repose sur le **Progressive Disclosure** (divulgation progressive) :

- Les tâches accomplies deviennent grisées, en italique et descendent automatiquement en bas de liste pour libérer la charge mentale.
- L'édition de texte se fait en cliquant directement sur la tâche (**Inline Editing**), sans aucune icône superflue.
- Les actions avancées (sous-missions, calendrier, assignation, suppression) n'apparaissent qu'au survol.
- L'interface s'adapte au thème sombre ou clair, avec des micro-animations fluides sur tous les éléments interactifs.

---

## Fonctionnalités Principales

### 📝 Saisie Éclair & Autocomplétion (Quick Entry)

Tapez votre tâche dans la barre de saisie rapide et organisez-la instantanément :

| Syntaxe                              | Effet                                                               |
| ------------------------------------ | ------------------------------------------------------------------- |
| `Rédiger le rapport #Travail`     | Crée la mission dans la section**Travail**                   |
| `Préparer le meeting @Alice`      | Assigne la tâche à**Alice**                                 |
| `Corriger le bug #Dev @Bob @Alice` | Section**Dev**, assignée à **Bob** et **Alice** |

- **Autocomplétion par `Tab` :** Les noms de sections et de membres sont complétés automatiquement via la touche `Tab`.
- Si la section n'existe pas encore, elle est créée à la volée.

---

### 📂 Organisation par Sections (Catégories)

Les missions sont regroupées dans des **sections** (catégories), triées automatiquement dans l'**ordre alphabétique** :

- **Créer une section :** Ajoutez `#NomDeSection` dans votre saisie.
- **Renommer une section :** Cliquez sur le nom de la section (le tag `#`) pour l'éditer en ligne.
- **Suppression automatique :** Les sections vides (sans mission) sont supprimées automatiquement.

#### Index de Navigation Rapide

Un **index alphabétique** flottant apparaît sur le côté droit de l'écran, affichant la première lettre de chaque catégorie. Au survol, le nom complet de la catégorie est visible en infobulle. Cliquez sur une lettre pour naviguer directement vers la section correspondante avec un défilement fluide.

> L'index est légèrement transparent et s'opacifie au survol. Il se masque automatiquement sur les écrans mobiles.

---

### ✅ Missions & Sous-missions

- **Cocher/Décocher :** Cliquez sur le cercle à gauche de la mission pour la marquer comme terminée.
- **Édition en ligne :** Cliquez directement sur le texte d'une mission pour l'éditer. Validez avec `Entrée`, annulez avec `Échap`.
- **Sous-missions :** Chaque mission peut être découpée en sous-tâches. Survolez une mission pour voir apparaître le bouton `+` de sous-tâche.
  - **Logique de complétion intelligente :** Ajouter une nouvelle sous-tâche à une mission terminée décoche automatiquement la mission principale.
- **Tri automatique :** Les missions terminées sont grisées, passent en italique et descendent en bas de liste pour libérer votre charge mentale.
- **Badge de complétion :** Les missions terminées affichent un badge « Fait le [date] » localisé dans la langue de l'utilisateur.

---

### 📅 Deadlines Interactives

Assignez une date d'échéance à chaque mission ou sous-mission. L'indicateur change de couleur selon l'urgence :

| Délai restant | Couleur   | Symbole |
| -------------- | --------- | ------- |
| > 7 jours      | 🟢 Vert   | 😎      |
| < 7 jours      | 🟠 Orange | 🤔      |
| < 3 jours      | 🔴 Rouge  | 🫪      |

- **Calendrier interactif :** Cliquez sur la deadline ou sur l'icône de calendrier pour ouvrir un sélecteur de date personnalisé avec navigation mois par mois.
- **Supprimer une deadline :** Utilisez le bouton « Effacer » dans le calendrier.
- **Localisation :** Les abréviations des jours, noms des mois et le titre du calendrier s'adaptent à la langue choisie (ex : `2026年 6月` en chinois).

---

### 👥 Gestion d'Équipe & Collaboration

#### Partager une liste

1. Ouvrez votre liste.
2. Cliquez sur le bouton de partage (icône utilisateur) dans la barre d'en-tête.
3. Saisissez l'adresse e-mail du collaborateur pour l'inviter.
4. Les utilisateurs partagés ont accès en lecture/écriture à la liste.

#### Assignation des missions

- **Assigner :** Utilisez la syntaxe `@Nom` dans la saisie rapide, ou sélectionnez les membres via le dropdown multi-sélection.
- **Groupement hiérarchique :** Dans les listes partagées, les missions sont automatiquement sous-groupées par assigné :
  - `@ Membre` — Tâches individuelles
  - `@ Team Work` — Tâches assignées à plusieurs personnes
  - `@ Sans assignation` — Tâches non assignées
- **Badge collaboratif `👥 X` :** Un badge apparaît à gauche du cercle de validation pour repérer les tâches avec assignation multiple. Survolez-le pour voir la liste des membres.

---

### 🗑️ Corbeille Sécurisée

Les éléments supprimés ne sont pas perdus définitivement :

- **Éléments récupérables :** Missions, sous-missions **et fichiers (listes)** supprimés sont envoyés dans la corbeille globale.
- **Restaurer :** Ouvrez la corbeille depuis l'écran d'accueil (icône corbeille), puis cliquez sur « Restaurer » à côté de l'élément souhaité.
- **Suppression définitive :** Utilisez « Vider la corbeille » pour supprimer définitivement tous les éléments.

---

### 🎨 Personnalisation Visuelle

Toutes les préférences sont **isolées par utilisateur** et synchronisées avec le serveur.

#### Thème Sombre / Clair

Basculez entre le mode sombre et le mode clair via le bouton lune/soleil dans la barre d'en-tête.

#### Fond d'écran

Trois options disponibles dans les paramètres (engrenage ⚙️) :

| Option                         | Description                                                                 |
| ------------------------------ | --------------------------------------------------------------------------- |
| **Original**             | Fond d'écran par défaut de l'application (illustration de chat)           |
| **Couleur unie**         | Sélectionnez une couleur via le color picker intégré (saisie HEX ou RGB) |
| **Image personnalisée** | Importez votre propre image (max 2 Mo)                                      |

- **Ajustement de l'image :** Cochez « Ajuster l'image au lieu de remplir » pour afficher toute l'image sans recadrage (`contain` au lieu de `cover`), idéal pour les illustrations portrait.
- **Opacité du filtre de lisibilité :** Un curseur ajustable permet de régler la transparence du filtre de lisibilité superposé au fond d'écran. La modification est visible en temps réel et sauvegardée automatiquement.

#### Couleur d'Accentuation

Personnalisez la couleur principale de l'interface (boutons, badges, sélections) :

- **Préréglages rapides :** Violet (par défaut), Rose, Vert, Bleu, Orange, Jaune.
- **Couleur personnalisée :** Utilisez le color picker avancé pour choisir n'importe quelle couleur via le spectre, la saisie HEX ou les champs RGB.
- **Réinitialiser :** Bouton pour revenir au violet par défaut.

---

### 🌐 Support Multilingue (4 langues)

L'application est traduite dans **4 langues** via des fichiers XML externes :

| Langue                     | Fichier    | Code   |
| -------------------------- | ---------- | ------ |
| 🇬🇧 English (par défaut) | `en.xml` | `en` |
| 🇫🇷 Français             | `fr.xml` | `fr` |
| 🇷🇺 Русский        | `ru.xml` | `ru` |
| 🇨🇳 中文                  | `zh.xml` | `zh` |

- **Changement instantané :** La langue se modifie dans Paramètres → Langue, sans rechargement de la page.
- **Éléments traduits :** Tous les textes de l'interface, les tooltips, les messages d'erreur du serveur, les noms de couleurs, le calendrier, les badges de complétion et les placeholders sont traduits dynamiquement.
- **Écran de connexion :** Toujours affiché en anglais pour garantir un accès universel.

---

### 🎬 Transitions & Animations

L'application utilise des transitions spatiales inspirées d'Apple pour chaque navigation :

| Navigation           | Animation                                            |
| -------------------- | ---------------------------------------------------- |
| Connexion → Accueil | Glissement vers le haut (ouverture de rideau)        |
| Accueil → Liste     | Glissement vers la gauche (creusement de profondeur) |
| Liste → Accueil     | Glissement vers la droite                            |
| Accueil → Corbeille | Zoom fluide                                          |

- **Actions au survol :** Les boutons d'actions avancées (sous-missions, calendrier, assignation, suppression) n'apparaissent qu'au survol pour garder l'interface épurée.

---

### 🔐 Authentification & Sécurité

- **Inscription / Connexion :** Formulaire sécurisé avec hachage bcrypt des mots de passe.
- **Session JWT :** Jeton d'authentification stocké localement et vérifié à chaque requête API.
- **Réinitialisation de mot de passe :** Lien de réinitialisation envoyé par e-mail via Nodemailer (SMTP Gmail).
- **Changement de mot de passe :** Disponible dans les paramètres.
- **Suppression de compte :** Suppression irréversible avec confirmation par mot de passe.

---

## Prérequis

Avant d'installer le projet, assurez-vous d'avoir :

| Outil             | Version recommandée | Lien                                           |
| ----------------- | -------------------- | ---------------------------------------------- |
| **Node.js** | v18+                 | https://nodejs.org/en                          |
| **MongoDB** | v6+ (Community)      | https://www.mongodb.com/try/download/community |
| **npm**     | inclus avec Node.js  | —                                             |

> MongoDB doit être démarré localement avant de lancer le serveur.

## Installation & Configuration

### 1. Cloner le dépôt

```bash
git clone https://github.com/Alexhuang03/ToDoList.git
cd ToDoList
```

### 2. Installer les dépendances

```bash
npm install
```

Les packages principaux installés sont :

| Package          | Rôle                                               |
| ---------------- | --------------------------------------------------- |
| `express`      | Serveur HTTP                                        |
| `mongoose`     | Connexion & modèles MongoDB                        |
| `bcryptjs`     | Hachage des mots de passe                           |
| `jsonwebtoken` | Authentification JWT                                |
| `nodemailer`   | Envoi d'e-mails (réinitialisation de mot de passe) |
| `dotenv`       | Chargement des variables d'environnement            |
| `cors`         | Autorisations cross-origin                          |
| `nodemon`      | Rechargement automatique en développement          |

### 3. Créer le fichier `.env`

Créez un fichier `.env` à la racine du projet avec le contenu suivant :

```env
MONGO_URI=mongodb://localhost:27017/todolist
JWT_SECRET=ta_cle_secrete_ici
PORT=3000

# Email (pour la réinitialisation de mot de passe)
SMTP_USER=ton_adresse@gmail.com
SMTP_PASS=mot_de_passe_application_gmail
APP_URL=http://localhost:3000
```

> **Note SMTP :** `SMTP_PASS` doit être un **mot de passe d'application** Google (et non votre mot de passe Gmail habituel).
> Pour le créer : Google Account → Sécurité → Validation en 2 étapes → Mots de passe des applications.

### 4. Lancer le serveur

```bash
npm start        # serveur de production sur http://localhost:3000
# ou
npm run dev      # avec rechargement automatique via nodemon (recommandé en développement)
```

L'application est accessible sur **http://localhost:3000**.

---

## Architecture

```
ToDoList/
├── public/                 # Frontend (HTML, CSS, JS vanilla)
│   ├── index.html          # Structure SPA (auth, home, file, trash, settings)
│   ├── index.css           # Styles complets (dark/light, animations, responsive)
│   ├── app.js              # Logique applicative (90 Ko+)
│   ├── locales/            # Fichiers de traduction XML
│   │   ├── en.xml
│   │   ├── fr.xml
│   │   ├── zh.xml
│   │   └── ru.xml
│   ├── todolist.png        # Favicon / Logo
│   └── cat-todolist.jpeg   # Fond d'écran par défaut
├── Images/                 # Assets statiques
│   └── accueil.png         # Illustration de l'écran de connexion
├── server/                 # Backend Express
│   ├── index.js            # Point d'entrée serveur
│   ├── db.js               # Connexion MongoDB
│   ├── models/             # Schémas Mongoose
│   │   ├── User.js         # Utilisateur (nom, email, préférences, wallpaper, accent, langue)
│   │   ├── File.js         # Fichier/Liste (sections → missions → sous-tâches)
│   │   └── Trash.js        # Corbeille globale par utilisateur
│   └── routes/             # Routes API REST
│       ├── auth.js         # Inscription, connexion, profil, reset password
│       ├── files.js        # CRUD fichiers, partage, sections
│       └── trash.js        # Opérations corbeille (restauration, vidage)
├── .env                    # Variables d'environnement (non committé)
└── package.json
```

---

## API REST

L'application expose les endpoints suivants :

### Authentification (`/api/auth`)

| Méthode   | Route                | Description                                                    |
| ---------- | -------------------- | -------------------------------------------------------------- |
| `POST`   | `/register`        | Inscription (name, email, password)                            |
| `POST`   | `/login`           | Connexion (email, password) → JWT                             |
| `GET`    | `/me`              | Profil de l'utilisateur connecté                              |
| `PATCH`  | `/me`              | Mise à jour du profil (nom, wallpaper, accent, theme, langue) |
| `POST`   | `/forgot-password` | Envoi d'un e-mail de réinitialisation                         |
| `POST`   | `/reset-password`  | Réinitialisation du mot de passe via token                    |
| `POST`   | `/change-password` | Changement de mot de passe (ancien + nouveau)                  |
| `DELETE` | `/me`              | Suppression du compte (avec confirmation de mot de passe)      |

### Fichiers (`/api/files`)

| Méthode   | Route            | Description                                   |
| ---------- | ---------------- | --------------------------------------------- |
| `GET`    | `/`            | Liste des fichiers de l'utilisateur           |
| `POST`   | `/`            | Création d'un nouveau fichier                |
| `GET`    | `/:id`         | Détail d'un fichier                          |
| `PUT`    | `/:id`         | Mise à jour complète (sections, missions)   |
| `DELETE` | `/:id`         | Suppression d'un fichier (envoi en corbeille) |
| `PATCH`  | `/:id/rename`  | Renommer un fichier                           |
| `POST`   | `/:id/share`   | Partager un fichier avec un utilisateur       |
| `POST`   | `/:id/unshare` | Retirer l'accès à un utilisateur            |

### Corbeille (`/api/trash`)

| Méthode   | Route               | Description                              |
| ---------- | ------------------- | ---------------------------------------- |
| `GET`    | `/`               | Contenu de la corbeille de l'utilisateur |
| `POST`   | `/restore/:index` | Restaurer un élément de la corbeille   |
| `DELETE` | `/`               | Vider la corbeille définitivement       |

---
