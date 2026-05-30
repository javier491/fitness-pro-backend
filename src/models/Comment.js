const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  routine: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientRoutine', required: true },
  checkIn: { type: mongoose.Schema.Types.ObjectId, ref: 'CheckIn' },
  date: { type: Date, required: true },
  type: { type: String, enum: ['routine', 'exercise'], default: 'routine' },
  exercise: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise' },
  text: { type: String, required: true },
  author: { type: String, enum: ['client', 'coach'], default: 'client' },
}, { timestamps: true });

module.exports = mongoose.model('Comment', commentSchema);
