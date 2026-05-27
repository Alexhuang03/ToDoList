const mongoose = require('mongoose');

const subtaskSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
}, { _id: false });

const missionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
  subtasks: { type: [subtaskSchema], default: [] },
}, { _id: false });

const sectionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  missions: { type: [missionSchema], default: [] },
}, { _id: false });

const trashItemSchema = new mongoose.Schema({
  type: { type: String, enum: ['file', 'mission'], required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  fileId: { type: String },
  sectionName: { type: String },
  origin: { type: String },
  deletedAt: { type: Date, default: Date.now },
}, { _id: false });

const fileSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Liste des user IDs qui ont accès en collaboration
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  sections: { type: [sectionSchema], default: [] },
  trash: { type: [trashItemSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('File', fileSchema);
