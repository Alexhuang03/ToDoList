const express = require('express');
const Trash = require('../models/Trash');
const File = require('../models/File');
const { authMiddleware } = require('./auth');
const { hasAccess, isValidObjectId } = require('./files');
const router = express.Router();

// GET /api/trash — Consulter la corbeille de l'utilisateur
router.get('/', authMiddleware, async (req, res) => {
  try {
    const trashDoc = await Trash.findOne({ userId: req.userId });
    res.json({ trash: trashDoc ? trashDoc.items : [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/trash — Ajouter un élément à la corbeille (avec validation stricte)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const item = req.body;
    if (!item || typeof item !== 'object') {
      return res.status(400).json({ error: 'Données invalides' });
    }

    const allowedTypes = ['file', 'mission', 'subtask'];
    if (!allowedTypes.includes(item.type)) {
      return res.status(400).json({ error: 'Type d\'élément non supporté' });
    }

    if (!item.data || typeof item.data !== 'object') {
      return res.status(400).json({ error: 'Données de l\'élément manquantes' });
    }

    // Si lié à un fichier existant, vérifier que l'utilisateur y a bien accès (anti-poisoning)
    if (item.fileId) {
      if (!isValidObjectId(item.fileId.toString())) {
        return res.status(400).json({ error: 'Identifiant de fichier invalide' });
      }
      const file = await File.findById(item.fileId.toString());
      if (file && !hasAccess(file, req.userId)) {
        return res.status(403).json({ error: 'Accès refusé au fichier associé' });
      }
    }

    let trashDoc = await Trash.findOne({ userId: req.userId });
    if (!trashDoc) trashDoc = new Trash({ userId: req.userId, items: [] });
    trashDoc.items.push(item);
    await trashDoc.save();
    res.json({ trash: trashDoc.items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/trash/restore/:idx — Restaurer un élément avec contrôle d'accès strict (Anti-BOLA/IDOR)
router.post('/restore/:idx', authMiddleware, async (req, res) => {
  try {
    const idx = parseInt(req.params.idx, 10);
    if (isNaN(idx) || idx < 0) {
      return res.status(400).json({ error: 'Index invalide' });
    }

    const trashDoc = await Trash.findOne({ userId: req.userId });
    if (!trashDoc || idx >= trashDoc.items.length) {
      return res.status(404).json({ error: 'Élément introuvable dans la corbeille' });
    }

    const item = trashDoc.items[idx];

    // 1. Si c'est un fichier entier, on le recrée pour l'utilisateur
    if (item.type === 'file') {
      trashDoc.items.splice(idx, 1);
      await trashDoc.save();

      const restored = new File({
        name: typeof item.data.name === 'string' ? item.data.name.slice(0, 100) : 'Fichier restauré',
        ownerId: req.userId,
        sections: Array.isArray(item.data.sections) ? item.data.sections : [],
      });
      await restored.save();
      return res.json({ trash: trashDoc.items, restored });
    }

    // 2. Si c'est une mission, vérifier l'accès au fichier cible avant de restaurer
    if (item.type === 'mission' && item.fileId) {
      if (!isValidObjectId(item.fileId.toString())) {
        return res.status(400).json({ error: 'Identifiant de fichier cible invalide' });
      }

      const file = await File.findById(item.fileId.toString());
      if (!file) {
        return res.status(404).json({ error: 'Le fichier d\'origine n\'existe plus' });
      }

      // CONTRÔLE D'ACCÈS CRITIQUE (BOLA/IDOR)
      if (!hasAccess(file, req.userId)) {
        return res.status(403).json({ error: 'Accès refusé au fichier cible' });
      }

      trashDoc.items.splice(idx, 1);
      await trashDoc.save();

      let sec = file.sections.find(s => s.name === item.sectionName);
      if (!sec) {
        file.sections.push({ name: item.sectionName || 'Général', missions: [] });
        sec = file.sections[file.sections.length - 1];
      }

      const d = item.data;
      sec.missions.push({
        id: d.id || String(Date.now()),
        text: typeof d.text === 'string' ? d.text.slice(0, 500) : '',
        done: Boolean(d.done),
        dueDate: d.dueDate || null,
        subtasks: Array.isArray(d.subtasks) ? d.subtasks.map(st => ({
          id: st.id || String(Date.now()),
          text: typeof st.text === 'string' ? st.text.slice(0, 500) : '',
          done: Boolean(st.done),
          dueDate: st.dueDate || null,
        })) : [],
      });
      file.markModified('sections');
      await file.save();
      return res.json({ trash: trashDoc.items });
    }

    // 3. Si c'est une sous-mission, vérifier également l'accès au fichier cible
    if (item.type === 'subtask' && item.fileId && item.parentMissionId) {
      if (!isValidObjectId(item.fileId.toString())) {
        return res.status(400).json({ error: 'Identifiant de fichier cible invalide' });
      }

      const file = await File.findById(item.fileId.toString());
      if (!file) {
        return res.status(404).json({ error: 'Le fichier d\'origine n\'existe plus' });
      }

      // CONTRÔLE D'ACCÈS CRITIQUE (BOLA/IDOR)
      if (!hasAccess(file, req.userId)) {
        return res.status(403).json({ error: 'Accès refusé au fichier cible' });
      }

      trashDoc.items.splice(idx, 1);
      await trashDoc.save();

      let parentMission = null;
      file.sections.forEach(s => {
        const m = s.missions.find(x => x.id === item.parentMissionId);
        if (m) parentMission = m;
      });

      const st = item.data;
      const subtaskObj = {
        id: st.id || String(Date.now()),
        text: typeof st.text === 'string' ? st.text.slice(0, 500) : '',
        done: Boolean(st.done),
        dueDate: st.dueDate || null,
      };

      if (parentMission) {
        parentMission.subtasks.push(subtaskObj);
      } else {
        let sec = file.sections.find(s => s.name === item.sectionName);
        if (!sec) {
          file.sections.push({ name: item.sectionName || 'Général', missions: [] });
          sec = file.sections[file.sections.length - 1];
        }
        sec.missions.push({
          id: String(Date.now()),
          text: `[Restaurée] ${subtaskObj.text}`,
          done: false,
          subtasks: [],
        });
      }

      file.markModified('sections');
      await file.save();
      return res.json({ trash: trashDoc.items });
    }

    // Si type non reconnu ou fichier manquant, suppression sécurisée de l'item corrompu
    trashDoc.items.splice(idx, 1);
    await trashDoc.save();
    res.json({ trash: trashDoc.items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/trash — Vider la corbeille
router.delete('/', authMiddleware, async (req, res) => {
  try {
    await Trash.findOneAndUpdate({ userId: req.userId }, { items: [] }, { upsert: true });
    res.json({ trash: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
