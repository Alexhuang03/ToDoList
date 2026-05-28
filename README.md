# ToDoList

> Un gestionnaire de tâches web ultra-minimaliste, pensé pour la rapidité de saisie et la collaboration sans friction.

## Le Concept

La plupart des outils de productivité sont trop complexes. **ToDoList** supprime la friction : pas de menus infinis ni de pop-ups intrusifs. Vous tapez votre tâche, l'application s'occupe de la trier. C'est l'outil parfait pour ceux qui veulent un espace de travail épuré sans sacrifier les fonctionnalités puissantes.

## Fonctionnalités Principales

* **Saisie Éclair (Quick Entry) :** Tapez simplement votre tâche et ajoutez `#nomdelasection` à la fin. L'application crée la section à la volée et y range votre mission automatiquement.
* **Interface Minimaliste :** Les actions avancées (ajouter des sous-missions, supprimer) n'apparaissent qu'au survol de la souris pour garder une interface visuellement apaisante.
* **Validation Automatique :** Cochez toutes vos sous-missions, et la mission principale se valide et s'archive automatiquement.
* **Mode Collaboratif :** Vos espaces sont privés par défaut, mais vous pouvez inviter des collaborateurs sur un fichier (`@`) via leur adresse e-mail en un seul clic.
* **Corbeille Sécurisée :** Une suppression accidentelle ? Retrouvez toutes vos tâches et fichiers dans la corbeille globale.

## Installation & Utilisation

1. Clonez ce dépôt : `git clone https://github.com/Alexhuang03/ToDoList.git`
2. Ouvrez le dossier du projet : `cd ToDoList`
3. Faire un .env
   1. Exemple

      `MONGO_URI=mongodb://localhost:27017/todolist `
      `JWT_SECRET=ta_cle_secrete_ici `
      `PORT=3000`
4. Télécharger nodes.js `https://nodejs.org/en` si ce n'est pas encore fait
5. Télécharger mongodb `https://www.mongodb.com/try/download/community` si ce n'est pas fait
6. Lancez le serveur local :

```bash
npm start        # serveur statique sur http://localhost:3000
# ou
npm run dev      # avec rechargement automatique (live-server)
```

> Aucune installation requise au préalable — `npx` télécharge automatiquement le serveur à la première utilisation. Node.js doit être installé sur la machine.

## Philosophie de Design

Le design de ToDoList repose sur le "Progressive Disclosure" (divulgation progressive). Les tâches accomplies deviennent grisées, en italique et descendent automatiquement en bas de liste pour libérer votre charge mentale. L'édition de texte se fait en cliquant directement sur la tâche (Inline Editing), sans aucune icône superflue.
