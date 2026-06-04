# ToDoList

> Un gestionnaire de tâches web collaboratif — saisie ultra-rapide, organisation par sections, sous-missions, deadlines colorées et partage d'équipe sans friction.

## Le Concept

La plupart des outils de productivité sont trop complexes. **ToDoList** supprime la friction : pas de menus infinis ni de pop-ups intrusifs. Vous tapez votre tâche, l'application s'occupe de la trier. C'est l'outil parfait pour ceux qui veulent un espace de travail épuré sans sacrifier les fonctionnalités puissantes.

## Fonctionnalités Principales

* **Saisie Éclair & Autocomplétion (Quick Entry) :** Tapez votre tâche et organisez-la instantanément en ajoutant `#section` et des mentions `@Nom` (avec autocomplétion intelligente par touche `Tab`).
* **Gestion d'Équipe & Tri par Assignation :**
  * **Groupement hiérarchique :** Dans les listes partagées, les missions sont automatiquement sous-groupées par assignés (`@ Membre`, `@ Team Work` pour plusieurs assignés, ou `@ Sans assignation`).
  * **Sélection Multi-membres :** Dropdown de sélection à choix multiples persistant (sauvegarde automatique en cliquant à l'extérieur).
  * **Badge Collaboratif `👥 X` :** Affichage d'un badge épuré à gauche du cercle de validation pour repérer les tâches partagées, avec infobulle listant les membres au survol.
* **Sous-missions d'Équipe :** 
  * Chaque mission peut être découpée en sous-tâches, qui héritent désormais de la possibilité d'être **assignées individuellement** (affichage du badge `@nom` sur le côté droit, à gauche du calendrier).
* **Deadlines colorées :** Assignez une date d'échéance à chaque mission ou sous-mission. L'encadrement change de couleur selon l'urgence (😎 vert > 7j, 🤔 orange < 7j, 🫪 rouge < 3j).
* **Isolation Complète des Préférences :** Les fonds d'écran personnalisés (y compris l'image d'accueil `accueil.png`), les palettes de couleur d'accentuation unie et les modes jour/nuit sont totalement isolés par utilisateur pour une expérience personnalisée et non perturbée.
* **Interface Minimaliste :** Les actions avancées (sous-missions, calendrier, assignation, suppression) n'apparaissent qu'au survol pour garder l'interface visuellement apaisante.
* **Corbeille Sécurisée :** Missions et sous-missions supprimées sont restaurables depuis la corbeille globale.
* **Réinitialisation de mot de passe :** Les utilisateurs peuvent recevoir un lien de réinitialisation par e-mail.

## Prérequis

Avant d'installer le projet, assurez-vous d'avoir :

| Outil | Version recommandée | Lien |
|---|---|---|
| **Node.js** | v18+ | https://nodejs.org/en |
| **MongoDB** | v6+ (Community) | https://www.mongodb.com/try/download/community |
| **npm** | inclus avec Node.js | — |

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

| Package | Rôle |
|---|---|
| `express` | Serveur HTTP |
| `mongoose` | Connexion & modèles MongoDB |
| `bcryptjs` | Hachage des mots de passe |
| `jsonwebtoken` | Authentification JWT |
| `nodemailer` | Envoi d'e-mails (réinitialisation de mot de passe) |
| `dotenv` | Chargement des variables d'environnement |
| `cors` | Autorisations cross-origin |
| `nodemon` | Rechargement automatique en développement |

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

## Architecture

```
ToDoList/
├── public/          # Frontend (HTML, CSS, JS vanilla)
│   ├── index.html
│   ├── index.css
│   └── app.js
├── server/          # Backend Express
│   ├── index.js     # Point d'entrée serveur
│   ├── db.js        # Connexion MongoDB
│   ├── models/      # Schémas Mongoose (User, File, Trash)
│   └── routes/      # Routes API (auth, files, trash)
├── .env             # Variables d'environnement (non committé)
└── package.json
```

## Philosophie de Design

Le design de ToDoList repose sur le **Progressive Disclosure** (divulgation progressive). Les tâches accomplies deviennent grisées, en italique et descendent automatiquement en bas de liste pour libérer votre charge mentale. L'édition de texte se fait en cliquant directement sur la tâche (Inline Editing), sans aucune icône superflue.
