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
      const file = await File.findById(item.fileId);
      if (file) {
        let sec = file.sections.find(s => s.name === item.sectionName);
        if (!sec) { sec = { name: item.sectionName, missions: [] }; file.sections.push(sec); }
        sec.missions.push(item.data);
        await file.save();
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
