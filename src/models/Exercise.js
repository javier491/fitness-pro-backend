const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
  externalId: { type: String, unique: true, sparse: true },
  name: { type: String, required: true },
  bodyPart: { type: String },
  equipment: { type: String },
  gifUrl: { type: String },
  target: { type: String },
  secondaryMuscles: [String],
  instructions: [String],
  isCustom: { type: Boolean, default: false },
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach' },
}, { timestamps: true });

exerciseSchema.index({ name: 'text', bodyPart: 'text', target: 'text' });

module.exports = mongoose.model('Exercise', exerciseSchema);
