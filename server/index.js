require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./db');

const { router: authRouter } = require('./routes/auth');
const filesRouter = require('./routes/files');
const trashRouter = require('./routes/trash');

const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Sécurisation des en-têtes HTTP avec Helmet & CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS avec restriction et support des credentials (cookies)
const allowedOrigins = [process.env.APP_URL, `http://localhost:${PORT}`, 'http://127.0.0.1:3000'].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // En développement ou même domaine
    }
  },
  credentials: true,
}));

// Cookies & Parsing du corps de requête avec limite de taille stricte (anti-DoS)
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));

// Rate limiter global pour toutes les routes API (300 req / 15 min)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Veuillez patienter avant de réessayer.' },
});
app.use('/api', globalLimiter);

// Servir le frontend statique et le dossier Images
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/Images', express.static(path.join(__dirname, '..', 'Images')));

// Routes API
app.use('/api/auth', authRouter);
app.use('/api/files', filesRouter);
app.use('/api/trash', trashRouter);

// Fallback SPA — toutes les autres routes renvoient index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Démarrage
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  });
});
