const mongoose = require('mongoose');

const bodyMetricSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true },
  date: { type: Date, default: Date.now },
  weight: Number,
  height: Number,
  bodyFat: Number,
  waist: Number,
  chest: Number,
  hips: Number,
  leftArm: Number,
  rightArm: Number,
  leftLeg: Number,
  rightLeg: Number,
  notes: String,
  recordedBy: { type: String, enum: ['coach', 'client'], default: 'coach' },
}, { timestamps: true });

module.exports = mongoose.model('BodyMetric', bodyMetricSchema);
