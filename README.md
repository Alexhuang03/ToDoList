# ToDoList

> Un gestionnaire de tâches web collaboratif moderne — synchronisation en temps réel, saisie ultra-rapide, organisation par sections, sous-missions, notes détaillées, deadlines colorées et partage d'équipe sans friction.

---

## Le Concept

La plupart des outils de productivité sont trop complexes. **ToDoList** supprime la friction : pas de menus infinis ni de pop-ups intrusifs. Vous tapez votre tâche, l'application s'occupe de la trier. C'est l'outil parfait pour ceux qui veulent un espace de travail épuré sans sacrifier les fonctionnalités puissantes.

---

## Philosophie de Design

Le design de ToDoList repose sur le **Progressive Disclosure** (divulgation progressive) et le **Glassmorphism** moderne :

- Les tâches accomplies deviennent grisées, en italique et descendent automatiquement en bas de liste pour libérer la charge mentale (ou peuvent être masquées en un clic via le bouton Œil).
- L'édition de texte se fait en cliquant directement sur la tâche (**Inline Editing**), sans aucune icône superflue.
- Les actions avancées (sous-missions, calendrier, assignation, suppression) n'apparaissent qu'au survol.
- Volets latéraux harmonisés pour la **description du dossier** (à gauche) et les **notes de la mission** (à droite).
- L'interface s'adapte au thème sombre ou clair avec un contraste optimal (icônes et textes blancs en sombre, noirs en clair), sublimée par des micro-animations fluides.

---

## Fonctionnalités Principales

### ⚡ Synchronisation Collaborative en Temps Réel (WebSockets)

Collaborez en direct avec votre équipe sur les listes partagées avec une latence quasi nulle (< 50ms) :

- **Diffusion instantanée :** Ajout, modification, déplacement, suppression ou coche de tâches répercutés en direct sur tous les écrans des collaborateurs.
- **Indicateur de présence en direct (Pulse Vert) :** Un badge animé dans l'en-tête affiche en temps réel les coéquipiers actuellement connectés sur le fichier.
- **Indicateur de frappe en direct :** Visualisez quand un collaborateur est en train d'écrire (`✍️ [Nom] est en train d'écrire...`).
- **Mises à jour non destructives :** Si un membre est en train de modifier du texte, les mises à jour distantes ne coupent pas sa frappe en cours.
- **Notification Toast :** Notification discrète informant qui vient de mettre à jour le document (`⚡ Mis à jour en direct par [Nom]`).
- **Résilience réseau :** Reconnexion automatique avec fallback transparent en polling si la connexion WebSocket est perturbée.

---

### 👁️ Bouton Œil (Afficher / Masquer les Tâches Terminées)

Situé dans l'en-tête, directement à côté de la barre d'avancement du projet :

- **Masquage en un clic :** Cliquez sur l'icône Œil pour masquer instantanément toutes les tâches et sous-tâches déjà effectuées et ne garder visibles que les tâches restantes.
- **État "Toutes les tâches terminées" (🎉) :** Si toutes les tâches sont achevées, un panneau convivial s'affiche avec un bouton pour réafficher les tâches terminées.
- **Persistance automatique :** Votre préférence d'affichage est automatiquement mémorisée dans votre navigateur (`localStorage`).

---

### 📝 Saisie Éclair, Hashtags & Autocomplétion (Quick Entry)

Tapez votre tâche dans la barre de saisie rapide et organisez-la instantanément :

| Syntaxe                              | Effet                                                               |
| ------------------------------------ | ------------------------------------------------------------------- |
| `Rédiger le rapport #Travail`     | Crée la mission dans la section **Travail**                         |
| `Préparer le meeting @Alice`      | Assigne la tâche à **Alice**                                        |
| `Corriger le bug #Dev @Bob @Alice` | Section **Dev**, assignée à **Bob** et **Alice**                   |

- **Suggestions instantanées `#` :** Dès que vous tapez `#`, une bulle de suggestions dynamique s'affiche pour choisir immédiatement une section existante.
- **Autocomplétion par `Tab` :** Les noms de sections et de membres sont complétés automatiquement via la touche `Tab`.
- Si la section n'existe pas encore, elle est créée à la volée.

---

### 📂 Organisation par Sections & Sommaire Latéral

Les missions sont regroupées dans des **sections** (catégories), triées automatiquement dans l'**ordre alphabétique** :

- **Créer une section :** Ajoutez `#NomDeSection` dans votre saisie.
- **Renommer une section :** Cliquez sur le nom de la section (le tag `#`) pour l'éditer en ligne.
- **Suppression automatique :** Les sections vides (sans mission) sont nettoyées automatiquement.

#### Sommaire Alphabétique Latéral Intelligent

Un **sommaire alphabétique** flottant apparaît sur le bord droit de l'espace de travail :
- Affiche la première lettre de chaque catégorie.
- **Infobulle complète au survol :** Survolez une lettre pour voir le nom complet de la catégorie (idéal quand plusieurs sections partagent la même initiale).
- **Navigation fluide :** Cliquez sur une lettre pour faire défiler instantanément l'écran jusqu'à la section correspondante.
- **Adaptation au filtre :** Les lettres des catégories dont toutes les tâches sont terminées se masquent automatiquement quand le bouton Œil est activé.

---

### 📋 Volets Latéraux Équilibrés (Description & Notes)

Deux volets latéraux glassmorphiques de taille et de style parfaitement équilibrés encadrent vos tâches :

1. **À propos du dossier (Volet Gauche) :**
   - Renseignez les objectifs, le contexte ou la description du dossier.
   - Cliquez directement sur le texte pour l'éditer, avec retour à la ligne libre (`Entrée`).
   - Bouton de sauvegarde explicite apparaissant lors des modifications.
   - Compteur de progression global du dossier (`X / Y tâches`).

2. **Notes de la mission (Volet Droit) :**
   - Sélectionnez n'importe quelle mission ou sous-mission pour lui associer des notes riches (liens, consignes, détails).
   - Bouton de sauvegarde dédié avec notification de confirmation.
   - Les missions disposant de notes affichent une icône crayon violette mise en valeur pour les repérer au premier coup d'œil.

---

### ✅ Missions & Sous-missions Hiérarchiques

- **Cocher/Décocher :** Cliquez sur le cercle à gauche de la mission pour la marquer comme terminée.
- **Édition en ligne :** Cliquez directement sur le texte d'une mission pour l'éditer. Validez avec le bouton de sauvegarde ou `Entrée`, annulez avec `Échap`.
- **Sous-missions :** Chaque mission peut être découpée en sous-tâches (arborescence dépliable avec indentation visuelle).
- **Logique de complétion intelligente :** Ajouter une nouvelle sous-tâche à une mission terminée décoche automatiquement la mission principale.
- **Badge de complétion :** Les missions terminées affichent un badge « Fait le [date] » localisé dans la langue choisie.

---

### 📅 Deadlines Interactives & Calendrier Visuel

Assignez une date d'échéance à chaque mission ou sous-mission. L'indicateur change de couleur selon l'urgence :

| Délai restant | Couleur   | Symbole |
| -------------- | --------- | ------- |
| > 7 jours      | 🟢 Vert   | 😎      |
| < 7 jours      | 🟠 Orange | 🤔      |
| < 3 jours      | 🔴 Rouge  | 🫪      |

- **Calendrier interactif :** Cliquez sur la deadline pour ouvrir le sélecteur de date personnalisé avec navigation mois par mois.
- **Supprimer une deadline :** Bouton « Effacer » disponible directement dans le sélecteur.
- **Localisation complète :** Jours et mois s'adaptent automatiquement à la langue sélectionnée.

---

### 👥 Gestion d'Équipe & Collaboration

#### Partager une liste
1. Ouvrez votre liste.
2. Cliquez sur le bouton de partage (icône utilisateur) dans la barre d'en-tête.
3. Invitez vos collaborateurs par leur adresse e-mail.
4. Les coéquipiers bénéficient d'un accès synchronisé en temps réel.

#### Assignation des missions
- **Assigner :** Utilisez la syntaxe `@Nom` dans la saisie rapide, ou le dropdown multi-sélection sur la mission.
- **Groupement automatique :** Dans les listes partagées, les missions sont regroupées par assigné :
  - `@ Membre` — Tâches individuelles
  - `@ Team Work` — Tâches assignées à plusieurs personnes
  - `@ Sans assignation` — Tâches libres
- **Badge collaboratif `👥 X` :** Repérez en un clin d'œil les tâches collectives.

---

### 🗑️ Corbeille Sécurisée

- **Éléments récupérables :** Missions, sous-missions et fichiers supprimés sont placés dans la corbeille globale.
- **Restaurer :** Restaurez n'importe quel élément en un clic depuis l'écran de corbeille.
- **Vidage :** Possibilité de purger définitivement la corbeille.

---

### 🎨 Personnalisation Visuelle & Lisibilité Maximale

Toutes les préférences sont sauvegardées par utilisateur sur le serveur et synchronisées.

#### Thème Sombre & Thème Clair Optimisés
- **Mode Sombre :** Textes des missions, sous-missions et icônes d'action en **blanc pur (`#ffffff`)** pour un contraste net sur les fonds sombres.
- **Mode Clair :** Textes des missions, sous-missions et icônes d'action en **noir pur (`#000000`)**.
- Cases à cocher rondes à bordure accentuée et contrastée.

#### Fond d'écran & Filtre de Lisibilité
- **Fond d'écran original :** Illustration par défaut.
- **Couleur unie :** Choix libre via le color picker intégré.
- **Image personnalisée :** Importez votre image préférée (ajustement `contain` ou `cover`).
- **Opacité du filtre :** Curseur pour régler précisément la transparence du fond glassmorphique pour une lisibilité parfaite.

#### Couleur d'Accentuation
- Préréglages rapides (Violet, Rose, Vert, Bleu, Orange, Jaune) ou sélecteur HEX/RGB libre pour teinter vos boutons et barres de progression.

---

### 🌐 Support Multilingue (4 langues)

Interface entièrement traduite via des fichiers XML dynamiques :

| Langue                     | Fichier    | Code   |
| -------------------------- | ---------- | ------ |
| 🇬🇧 English (par défaut) | `en.xml` | `en` |
| 🇫🇷 Français             | `fr.xml` | `fr` |
| 🇷🇺 Русский        | `ru.xml` | `ru` |
| 🇨🇳 中文                  | `zh.xml` | `zh` |

- Changement immédiat sans rechargement de page via Paramètres → Langue.

---

### 🔐 Authentification & Sécurité

- **Vérification par e-mail :** Code de confirmation à 6 caractères envoyé par e-mail lors de l'inscription (validité 15 min) avec option de renvoi.
- **Protection Honeypot :** Champ invisible anti-spam et anti-robots.
- **Sécurité des sessions :** JWT sécurisé, cookies HTTP-only et protection des headers via Helmet (avec CSP pour WebSockets).
- **Rate Limiting :** Protection contre les attaques par force brute.
- **Gestion de compte :** Réinitialisation de mot de passe par mail sécurisé, modification du mot de passe et suppression de compte.

---

## Architecture Technique

```
ToDoList/
├── public/                 # Frontend SPA (Vanilla JS, HTML5, CSS3)
│   ├── index.html          # Structure SPA (Auth, Dashboard, File View, Trash, Settings)
│   ├── index.css           # Feuille de style complète (Glassmorphism, Dark/Light, Responsive)
│   ├── app.js              # Moteur client (WebSocket, REST, UI, i18n, gestion d'état)
│   ├── locales/            # Fichiers de traductions XML
│   │   ├── en.xml          # Anglais
│   │   ├── fr.xml          # Français
│   │   ├── zh.xml          # Chinois
│   │   └── ru.xml          # Russe
│   ├── todolist.png        # Logo / Favicon
│   └── cat-todolist.jpeg   # Fond d'écran par défaut
├── server/                 # Backend Node.js & Express
│   ├── index.js            # Serveur HTTP + port fallback automatique (3000 -> 3001)
│   ├── websocket.js        # Serveur WebSocket (/ws) avec rooms et heartbeat
│   ├── db.js               # Connexion MongoDB
│   ├── models/             # Modèles Mongoose
│   │   ├── User.js         # Utilisateurs (profil, vérification, préférences, thèmes)
│   │   ├── File.js         # Listes / Dossiers (sections, missions, sous-tâches, notes)
│   │   └── Trash.js        # Corbeille globale
│   └── routes/             # Endpoints API REST
│       ├── auth.js         # Inscription, code e-mail, login, mot de passe
│       ├── files.js        # CRUD fichiers, diffusion WebSocket, partage
│       └── trash.js        # Restauration et vidage corbeille
├── .env                    # Configuration d'environnement
├── package.json            # Dépendances & scripts npm
└── README.md               # Documentation du projet
```

---

## Installation & Démarrage

### 1. Prérequis

- **Node.js** (v18+)
- **MongoDB** (v6+ local ou MongoDB Atlas)
- **npm** (inclus avec Node.js)

### 2. Cloner le dépôt et installer les dépendances

```bash
git clone https://github.com/Alexhuang03/ToDoList.git
cd ToDoList
npm install
```

### 3. Configurer l'environnement (`.env`)

Créez un fichier `.env` à la racine :

```env
PORT=3000
APP_URL=http://localhost:3000
MONGO_URI=mongodb://127.0.0.1:27017/todolist
JWT_SECRET=votre_cle_secrete_jwt

# Configuration SMTP (requis pour les codes de validation et mots de passe oubliés)
SMTP_USER=votre_adresse@gmail.com
SMTP_PASS=votre_mot_de_passe_application_google
```

### 4. Lancer l'application

```bash
# Mode standard
npm start

# Mode développement avec rechargement automatique
npm run dev
```

L'application détecte automatiquement si le port 3000 est utilisé et basculera en toute sécurité sur le port 3001 si nécessaire. Ouvrez simplement l'adresse indiquée dans votre terminal :
👉 **`http://localhost:3000`** *(ou `http://localhost:3001`)*.

---

## Licence

© 2026 Alex Huang ([Alexhuang03](https://github.com/Alexhuang03)) — **Tous droits réservés.**

Le code est visible publiquement à titre de consultation uniquement. Toute copie, modification, redistribution ou utilisation, commerciale ou non, est interdite sans autorisation écrite préalable. Voir le fichier [LICENSE](LICENSE).
