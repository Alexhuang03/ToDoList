const express = require('express');
const Trash = require('../models/Trash');
const File = require('../models/File');
const { authMiddleware } = require('./auth');
const router = express.Router();

// La corbeille est stockée dans un modèle dédié par utilisateur
// GET /api/trash
router.get('/', authMiddleware, async (req, res) => {
  try {
    let trashDoc = await Trash.findOne({ userId: req.userId });
    res.json({ trash: trashDoc ? trashDoc.items : [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/trash — Ajouter un élément à la corbeille
router.post('/', authMiddleware, async (req, res) => {
  try {
    const item = req.body;
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

// POST /api/trash/restore/:idx — Restaurer un élément
router.post('/restore/:idx', authMiddleware, async (req, res) => {
  try {
    const idx = parseInt(req.params.idx);
    let trashDoc = await Trash.findOne({ userId: req.userId });
    if (!trashDoc || idx < 0 || idx >= trashDoc.items.length) {
      return res.status(404).json({ error: 'Élément introuvable' });
    }
    const item = trashDoc.items.splice(idx, 1)[0];
    await trashDoc.save();

    // Si c'est un fichier, on le recrée
    if (item.type === 'file') {
      const restored = new File({ name: item.data.name, ownerId: req.userId, sections: item.data.sections || [] });
      await restored.save();
      return res.json({ trash: trashDoc.items, restored });
    }
    // Si c'est une mission, on la remet dans le fichier
    if (item.type === 'mission' && item.fileId) {
      const file = await File.findById(item.fileId.toString());
      if (file) {
        let sec = file.sections.find(s => s.name === item.sectionName);
        if (!sec) {
          file.sections.push({ name: item.sectionName, missions: [] });
          sec = file.sections[file.sections.length - 1];
        }
        // Reconstruire explicitement l'objet mission pour satisfaire le schéma Mongoose
        const d = item.data;
        sec.missions.push({
          id: d.id || String(Date.now()),
          text: d.text || '',
          done: d.done || false,
          dueDate: d.dueDate || null,
          subtasks: (d.subtasks || []).map(st => ({
            id: st.id || String(Date.now()),
            text: st.text || '',
            done: st.done || false,
            dueDate: st.dueDate || null,
          })),
        });
        file.markModified('sections');
        await file.save();
      } else {
        console.warn('Fichier introuvable pour restauration mission, fileId:', item.fileId);
      }
    }
    // Si c'est une sous-mission, on la remet dans la mission parente
    if (item.type === 'subtask' && item.fileId && item.parentMissionId) {
      const file = await File.findById(item.fileId.toString());
      if (file) {
        let parentMission = null;
        file.sections.forEach(s => {
          const m = s.missions.find(x => x.id === item.parentMissionId);
          if (m) parentMission = m;
        });
        const st = item.data;
        const subtaskObj = {
          id: st.id || String(Date.now()),
          text: st.text || '',
          done: st.done || false,
          dueDate: st.dueDate || null,
        };
        if (parentMission) {
          parentMission.subtasks.push(subtaskObj);
        } else {
          // Mission parente supprimée : on crée une mission de substitution
          let sec = file.sections.find(s => s.name === item.sectionName);
          if (!sec) {
            file.sections.push({ name: item.sectionName, missions: [] });
            sec = file.sections[file.sections.length - 1];
          }
          sec.missions.push({ id: String(Date.now()), text: `[Restaurée] ${st.text}`, done: false, subtasks: [] });
        }
        file.markModified('sections');
        await file.save();
      } else {
        console.warn('Fichier introuvable pour restauration sous-mission, fileId:', item.fileId);
      }
    }
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
