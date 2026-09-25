const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
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

// Rate limiter pour le renvoi d'e-mail de confirmation
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 demandes max par IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes de renvoi. Veuillez réessayer dans 15 minutes.' },
});

// Validation d'adresse e-mail
function isValidEmail(email) {
  return typeof email === 'string' &&
    email.length <= 100 &&
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

// Helper d'envoi d'e-mail avec fallback de développement si SMTP non configuré
async function sendEmail({ to, subject, html, text }) {
  const hasSmtp = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!hasSmtp) {
    console.log('----------------------------------------------------');
    console.log(`📧 [DEV - Aucun SMTP configuré dans .env]`);
    console.log(`Destinataire : ${to}`);
    console.log(`Sujet        : ${subject}`);
    if (text) console.log(`Lien / Info  : ${text}`);
    console.log('----------------------------------------------------');
    return { dev: true };
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"ToDoList" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });
  return { dev: false };
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

// POST /api/auth/register (avec piège Honeypot anti-bots & envoi de vérification)
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, termsAccepted, website_hp } = req.body;

    // Piège à robots : si le champ invisible est rempli, c'est un bot automatisé
    if (website_hp) {
      console.warn(`🤖 Inscription robot bloquée via honeypot pour l'adresse: ${email}`);
      return res.status(400).json({ error: 'Inscription rejetée' });
    }

    if (!termsAccepted || (termsAccepted !== true && termsAccepted !== 'true')) {
      return res.status(400).json({ error: "Vous devez accepter les Conditions d'Utilisation et la Politique de Confidentialité" });
    }
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

    // Jeton d'activation valable 24h
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = new User({
      name: name.trim(),
      email: cleanEmail,
      passwordHash: password,
      termsAcceptedAt: new Date(),
      isVerified: false,
      verificationToken,
      verificationTokenExpiry,
    });
    await user.save();

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const verifyLink = `${appUrl}/?verify_token=${verificationToken}`;

    await sendEmail({
      to: user.email,
      subject: '✉️ Activez votre compte ToDoList',
      text: `Lien d'activation : ${verifyLink}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;background:#f9f9f9;border-radius:12px;">
          <h2 style="color:#6C5CE7;">Bienvenue sur ToDoList !</h2>
          <p>Bonjour <strong>${user.name}</strong>,</p>
          <p>Merci pour votre inscription ! Pour activer votre compte et sécuriser vos accès, veuillez cliquer sur le bouton ci-dessous :</p>
          <a href="${verifyLink}" style="display:inline-block;margin:1.5rem 0;padding:0.8rem 1.8rem;background:#6C5CE7;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
            Activer mon compte
          </a>
          <p style="color:#888;font-size:0.85rem;">Ce lien expire dans <strong>24 heures</strong>. Si vous n'avez pas demandé ce compte, ignorez ce message.</p>
        </div>
      `,
    });

    res.status(201).json({
      message: 'Un e-mail de confirmation vous a été envoyé. Veuillez cliquer sur le lien pour activer votre compte.',
      requiresVerification: true,
      email: user.email,
      devVerifyLink: !process.env.SMTP_USER ? verifyLink : undefined,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/verify-email/:token
router.post('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token invalide' });
    }

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Lien de confirmation invalide ou expiré.' });
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpiry = null;
    await user.save();

    // Connexion automatique après vérification
    const jwtToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', jwtToken, COOKIE_OPTIONS);
    res.json({ message: 'Compte validé avec succès !', token: jwtToken, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', resendLimiter, async (req, res) => {
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
    if (!user) {
      // Réponse générique pour éviter l'énumération
      return res.json({ message: 'Si ce compte existe et n\'est pas encore validé, un lien a été envoyé.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: 'Ce compte est déjà validé. Vous pouvez vous connecter.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    user.verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const verifyLink = `${appUrl}/?verify_token=${verificationToken}`;

    await sendEmail({
      to: user.email,
      subject: '✉️ Nouveau lien pour activer votre compte ToDoList',
      text: `Lien d'activation : ${verifyLink}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;background:#f9f9f9;border-radius:12px;">
          <h2 style="color:#6C5CE7;">Activation de votre compte ToDoList</h2>
          <p>Bonjour <strong>${user.name}</strong>,</p>
          <p>Vous avez demandé un nouveau lien d'activation :</p>
          <a href="${verifyLink}" style="display:inline-block;margin:1.5rem 0;padding:0.8rem 1.8rem;background:#6C5CE7;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
            Activer mon compte
          </a>
          <p style="color:#888;font-size:0.85rem;">Ce lien expire dans <strong>24 heures</strong>.</p>
        </div>
      `,
    });

    res.json({
      message: 'Un nouveau lien de confirmation a été envoyé.',
      devVerifyLink: !process.env.SMTP_USER ? verifyLink : undefined,
    });
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

    // Blocage si l'adresse e-mail n'a pas encore été vérifiée
    if (user.isVerified === false) {
      return res.status(403).json({
        error: 'Veuillez confirmer votre adresse e-mail avant de vous connecter.',
        unverified: true,
        email: user.email,
      });
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

    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = token;
    user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 heure
    await user.save();

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const resetLink = `${appUrl}/?reset_token=${token}`;

    await sendEmail({
      to: user.email,
      subject: '🔑 Réinitialisation de votre mot de passe',
      text: `Lien de réinitialisation : ${resetLink}`,
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
    res.json({
      message: 'Un e-mail de réinitialisation a été envoyé.',
      devResetLink: !process.env.SMTP_USER ? resetLink : undefined,
    });
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
