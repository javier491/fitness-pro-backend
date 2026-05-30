const mongoose = require('mongoose');

const exerciseEntrySchema = new mongoose.Schema({
  exercise: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise', required: true },
  sets: { type: Number, required: true },
  reps: { type: String, required: true },
  restSeconds: { type: Number, default: 60 },
  notes: { type: String },
  order: { type: Number, default: 0 },
}, { _id: false });

const routineDaySchema = new mongoose.Schema({
  dayNumber: { type: Number, required: true },
  name: { type: String },
  isRestDay: { type: Boolean, default: false },
  exercises: [exerciseEntrySchema],
}, { _id: false });

const routineTemplateSchema = new mongoose.Schema({
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true },
  name: { type: String, required: true },
  description: { type: String },
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
  totalDays: { type: Number, default: 7 },
  days: [routineDaySchema],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('RoutineTemplate', routineTemplateSchema);
