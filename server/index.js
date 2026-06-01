require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./db');

const { router: authRouter } = require('./routes/auth');
const filesRouter = require('./routes/files');
const trashRouter = require('./routes/trash');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

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
