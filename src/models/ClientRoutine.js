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

const clientRoutineSchema = new mongoose.Schema({
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  fromTemplate: { type: mongoose.Schema.Types.ObjectId, ref: 'RoutineTemplate' },
  name: { type: String, required: true },
  description: { type: String },
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
  totalDays: { type: Number, default: 7 },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  days: [routineDaySchema],
  isActive: { type: Boolean, default: true },
  currentDayNumber: { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('ClientRoutine', clientRoutineSchema);
