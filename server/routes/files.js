const express = require('express');
const mongoose = require('mongoose');
const File = require('../models/File');
const User = require('../models/User');
const { authMiddleware } = require('./auth');
const router = express.Router();

// Helper : vérifier que l'user a accès au fichier (propriétaire OU collaborateur)
function hasAccess(file, userId) {
  const uid = userId.toString();
  return file.ownerId.toString() === uid ||
    file.sharedWith.some(id => id.toString() === uid);
}

// GET /api/files — Lister tous les fichiers accessibles
router.get('/', authMiddleware, async (req, res) => {
  try {
    const files = await File.find({
      $or: [
        { ownerId: req.userId },
        { sharedWith: req.userId },
      ],
    })
      .populate('ownerId', 'name email')
      .populate('sharedWith', 'name email')
      .sort({ updatedAt: -1 });
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/files — Créer un fichier
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, emoji } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    const file = new File({ name, emoji: emoji || '', ownerId: req.userId });
    await file.save();
    await file.populate('ownerId', 'name email');
    res.status(201).json({ file });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/files/:id — Détail d'un fichier
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const file = await File.findById(req.params.id)
      .populate('ownerId', 'name email')
      .populate('sharedWith', 'name email');
    if (!file) return res.status(404).json({ error: 'Fichier introuvable' });
    if (!hasAccess(file, req.userId)) return res.status(403).json({ error: 'Accès refusé' });
    res.json({ file });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/files/:id — Mettre à jour un fichier (sections + missions)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'Fichier introuvable' });
    if (!hasAccess(file, req.userId)) return res.status(403).json({ error: 'Accès refusé' });

    const { name, emoji, sections } = req.body;
    if (name !== undefined) file.name = name;
    if (emoji !== undefined) file.emoji = emoji;
    if (sections !== undefined) file.sections = sections;
    await file.save();
    await file.populate('ownerId', 'name email');
    await file.populate('sharedWith', 'name email');
    res.json({ file });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/files/:id — Supprimer un fichier (soft delete : va dans la corbeille globale de l'owner)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'Fichier introuvable' });
    // Seul le propriétaire peut supprimer
    if (file.ownerId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Seul le propriétaire peut supprimer ce fichier' });
    }
    // Marquer comme supprimé (corbeille) : on stocke dans un champ dédié
    file.trash.push({ type: 'file', data: { name: file.name, sections: file.sections }, deletedAt: new Date() });
    // On ne supprime pas vraiment, on archive — géré côté corbeille
    // Pour simplifier : suppression réelle, la corbeille est gérée dans le frontend
    await File.findByIdAndDelete(req.params.id);
    res.json({ message: 'Fichier supprimé' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/files/:id/share — Partager avec un utilisateur par email
router.post('/:id/share', authMiddleware, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'Fichier introuvable' });
    if (file.ownerId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Seul le propriétaire peut partager ce fichier' });
    }
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });

    const targetUser = await User.findOne({ email });
    if (!targetUser) return res.status(404).json({ error: 'Aucun utilisateur avec cet email' });
    if (targetUser._id.toString() === req.userId.toString()) {
      return res.status(400).json({ error: 'Vous êtes déjà le propriétaire' });
    }
    if (file.sharedWith.some(id => id.toString() === targetUser._id.toString())) {
      return res.status(409).json({ error: 'Déjà partagé avec cet utilisateur' });
    }

    file.sharedWith.push(targetUser._id);
    await file.save();
    await file.populate('ownerId', 'name email');
    await file.populate('sharedWith', 'name email');
    res.json({ file });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/files/:id/share/:userId — Retirer un collaborateur
router.delete('/:id/share/:uid', authMiddleware, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'Fichier introuvable' });
    if (file.ownerId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Seul le propriétaire peut modifier le partage' });
    }
    file.sharedWith = file.sharedWith.filter(id => id.toString() !== req.params.uid);
    await file.save();
    await file.populate('ownerId', 'name email');
    await file.populate('sharedWith', 'name email');
    res.json({ file });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
