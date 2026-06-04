const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// Middleware pour vérifier le JWT — exporté pour les autres routes
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Mot de passe trop court (6 caractères minimum)' });
    }
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ error: 'Cet e-mail est déjà utilisé' });
    }
    const user = new User({ name, email, passwordHash: password });
    await user.save();
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    const user = await User.findOne({ email });
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail requis' });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // Toujours répondre OK pour ne pas révéler si l'email existe
    if (!user) return res.json({ message: 'Si cet e-mail existe, un lien a été envoyé.' });

    const crypto = require('crypto');
    const nodemailer = require('nodemailer');

    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = token;
    user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 heure
    await user.save();

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const resetLink = `${appUrl}/?reset_token=${token}`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"ToDoList" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: '🔑 Réinitialisation de votre mot de passe',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;background:#f9f9f9;border-radius:12px;">
          <h2 style="color:#6C5CE7;">Réinitialisation du mot de passe</h2>
          <p>Bonjour <strong>${user.name}</strong>,</p>
          <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous :</p>
          <a href="${resetLink}" style="display:inline-block;margin:1.5rem 0;padding:0.8rem 1.8rem;background:#6C5CE7;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
            Réinitialiser mon mot de passe
          </a>
          <p style="color:#888;font-size:0.85rem;">Ce lien expire dans <strong>1 heure</strong>. Si vous n'avez pas fait cette demande, ignorez cet e-mail.</p>
        </div>
      `,
    });

    console.log(`📧 Email de reset envoyé à ${user.email}`);
    res.json({ message: 'Un e-mail de réinitialisation a été envoyé.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de l\'e-mail. Vérifiez la configuration SMTP.' });
  }
});

// POST /api/auth/reset-password/:token
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Mot de passe trop court (6 caractères minimum)' });
    }
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ error: 'Lien invalide ou expiré. Recommencez la procédure.' });
    }
    user.passwordHash = password; // le pre-save hook va le hacher
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();
    res.json({ message: 'Mot de passe réinitialisé avec succès.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/auth/me — Modifier le profil (nom, fond d'écran, couleur d'accentuation, thème)
router.patch('/me', authMiddleware, async (req, res) => {
  try {
    const { name, wallpaper, accent, theme, language } = req.body;
    const updates = {};
    if (name !== undefined) {
      if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
      updates.name = name.trim();
    }
    if (wallpaper !== undefined) updates.wallpaper = wallpaper;
    if (accent !== undefined) updates.accent = accent;
    if (theme !== undefined) updates.theme = theme;
    if (language !== undefined) updates.language = language;

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/auth/me — Supprimer le compte
router.delete('/me', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Mot de passe requis' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    // Vérifier le mot de passe
    const valid = await user.verifyPassword(password);
    if (!valid) return res.status(401).json({ error: 'Mot de passe incorrect' });

    const File = require('../models/File');
    const Trash = require('../models/Trash');

    // Supprimer tous les fichiers dont l'utilisateur est propriétaire
    await File.deleteMany({ ownerId: req.userId });

    // Retirer l'utilisateur des listes sharedWith des fichiers collaboratifs
    await File.updateMany(
      { sharedWith: req.userId },
      { $pull: { sharedWith: req.userId } }
    );

    // Supprimer la corbeille de l'utilisateur
    await Trash.deleteMany({ userId: req.userId });

    // Supprimer l'utilisateur
    await User.findByIdAndDelete(req.userId);

    res.json({ message: 'Compte supprimé avec succès' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = { router, authMiddleware };
