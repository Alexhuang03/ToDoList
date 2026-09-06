const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const router = express.Router();

// Configuration des cookies d'authentification sécurisés (HttpOnly)
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 jours
};

// Rate limiter anti brute-force pour l'authentification (login / register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 tentatives max
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Veuillez réessayer dans 15 minutes.' },
});

// Rate limiter strict pour la réinitialisation de mot de passe (anti-spam SMTP)
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5, // 5 demandes max par IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes de réinitialisation. Veuillez réessayer dans une heure.' },
});

// Validation d'adresse e-mail
function isValidEmail(email) {
  return typeof email === 'string' &&
    email.length <= 100 &&
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

// Middleware pour vérifier le JWT (Supporte Cookie HttpOnly ET Header Authorization Bearer)
function authMiddleware(req, res, next) {
  let token = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nom requis (texte valide)' });
    }
    if (name.trim().length > 50) {
      return res.status(400).json({ error: 'Nom trop long (50 caractères maximum)' });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Format d\'e-mail invalide' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Mot de passe trop court (6 caractères minimum)' });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'Mot de passe trop long (128 caractères maximum)' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const exists = await User.findOne({ email: cleanEmail });
    if (exists) {
      return res.status(409).json({ error: 'Cet e-mail est déjà utilisé' });
    }

    const user = new User({ name: name.trim(), email: cleanEmail, passwordHash: password });
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    if (password.length > 128) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  res.json({ message: 'Déconnexion réussie' });
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
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'E-mail requis' });
    }

    const cleanEmail = email.toLowerCase().trim();
    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ error: 'Format d\'e-mail invalide' });
    }

    const user = await User.findOne({ email: cleanEmail });
    // Toujours répondre OK pour ne pas révéler si l'email existe (protection contre l'énumération)
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
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token invalide' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Mot de passe trop court (6 caractères minimum)' });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'Mot de passe trop long (128 caractères maximum)' });
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
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Nom requis' });
      }
      if (name.trim().length > 50) {
        return res.status(400).json({ error: 'Nom trop long (50 caractères maximum)' });
      }
      updates.name = name.trim();
    }
    if (wallpaper !== undefined && typeof wallpaper === 'string' && wallpaper.length <= 1000000) {
      updates.wallpaper = wallpaper;
    }
    if (accent !== undefined && typeof accent === 'string' && accent.length <= 20) {
      updates.accent = accent;
    }
    if (theme !== undefined && typeof theme === 'string' && ['dark', 'light'].includes(theme)) {
      updates.theme = theme;
    }
    if (language !== undefined && typeof language === 'string' && ['fr', 'en', 'ru', 'zh'].includes(language)) {
      updates.language = language;
    }

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
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Mot de passe requis' });
    }

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

    // Révoquer le cookie
    res.clearCookie('token', COOKIE_OPTIONS);
    res.json({ message: 'Compte supprimé avec succès' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = { router, authMiddleware, COOKIE_OPTIONS };
