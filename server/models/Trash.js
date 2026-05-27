const mongoose = require('mongoose');

const trashItemSchema = new mongoose.Schema({
  type: { type: String, enum: ['file', 'mission'], required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  fileId: { type: String },
  sectionName: { type: String },
  origin: { type: String },
  deletedAt: { type: Date, default: Date.now },
}, { _id: false });

const trashSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: { type: [trashItemSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Trash', trashSchema);
