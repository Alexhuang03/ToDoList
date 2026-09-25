const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  resetToken: { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null },
  wallpaper: { type: String, default: null },
  accent: { type: String, default: null },
  theme: { type: String, default: 'dark' },
  language: { type: String, default: 'en' },
  termsAcceptedAt: { type: Date, default: Date.now },
  isVerified: { type: Boolean, default: false },
  verificationCode: { type: String, default: null },
  verificationCodeExpiry: { type: Date, default: null },
  verificationToken: { type: String, default: null },
  verificationTokenExpiry: { type: Date, default: null },
}, { timestamps: true });

// Auto-nettoyage : suppression automatique par MongoDB des comptes non vérifiés après 48h
userSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 48 * 3600, partialFilterExpression: { isVerified: false } }
);

// Hash du mot de passe avant sauvegarde
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
});

// Méthode pour vérifier le mot de passe
userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Ne jamais exposer le hash ni les tokens sensibles dans les réponses JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.resetToken;
  delete obj.resetTokenExpiry;
  delete obj.verificationCode;
  delete obj.verificationCodeExpiry;
  delete obj.verificationToken;
  delete obj.verificationTokenExpiry;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
