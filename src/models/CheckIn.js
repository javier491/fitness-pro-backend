const mongoose = require('mongoose');

const exerciseLogSchema = new mongoose.Schema({
  exercise:      { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise' },
  setsCompleted: Number,
  repsPerSet:    [Number],
  weightPerSet:  [Number],
  weightUnit:    { type: String, enum: ['kg', 'lbs'], default: 'kg' },
  notes:         String,
  // Valores prescritos por el coach (guardados al momento del check-in)
  setsTarget:    Number,
  repsTarget:    [Number],
}, { _id: false });

const checkInSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  routine: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientRoutine', required: true },
  routineDayNumber: { type: Number, required: true },
  date: { type: Date, required: true },
  completedAt: { type: Date, default: Date.now },
  exerciseLogs: [exerciseLogSchema],
  generalComment: { type: String },
  mood: { type: Number, min: 1, max: 5 },
  streak: { type: Number, default: 1 },
}, { timestamps: true });

// Non-unique index for query performance
checkInSchema.index({ client: 1, date: -1 });
// If upgrading: drop old unique index: db.checkins.dropIndex({ client: 1, date: 1 })

module.exports = mongoose.model('CheckIn', checkInSchema);
