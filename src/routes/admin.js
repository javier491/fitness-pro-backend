const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Coach = require('../models/Coach');
const Client = require('../models/Client');
const Exercise = require('../models/Exercise');
const CheckIn = require('../models/CheckIn');
const { syncAll, translateBatch } = require('../services/exerciseDB');

const adminAuth = async (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer')
    ? req.headers.authorization.split(' ')[1] : null;
  if (!token) return res.status(401).json({ message: 'No autorizado' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Solo admins' });
    req.admin = await Admin.findById(decoded.id);
    if (!req.admin) return res.status(401).json({ message: 'Admin no encontrado' });
    next();
  } catch { res.status(401).json({ message: 'Token inválido' }); }
};

/* ── AUTH ── */
router.get('/needs-setup', async (req, res, next) => {
  try {
    const exists = await Admin.findOne();
    res.json({ needsSetup: !exists });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin || !(await admin.comparePassword(password)))
      return res.status(401).json({ message: 'Credenciales incorrectas' });
    const token = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, admin });
  } catch (err) { next(err); }
});

router.post('/setup', async (req, res, next) => {
  try {
    const { email, password, secret } = req.body;
    if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ message: 'Clave incorrecta' });
    const exists = await Admin.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Admin ya existe' });
    const admin = await Admin.create({ email, password });
    res.status(201).json(admin);
  } catch (err) { next(err); }
});

/* ── STATS ── */
router.get('/stats', adminAuth, async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());

    const [totalCoaches, activeCoaches, totalClients, activeClients,
      totalExercises, checkinsToday, checkinsWeek, totalCheckins] = await Promise.all([
      Coach.countDocuments(),
      Coach.countDocuments({ isActive: true }),
      Client.countDocuments(),
      Client.countDocuments({ isActive: true }),
      Exercise.countDocuments(),
      CheckIn.countDocuments({ date: { $gte: today } }),
      CheckIn.countDocuments({ date: { $gte: weekStart } }),
      CheckIn.countDocuments(),
    ]);

    res.json({ totalCoaches, activeCoaches, totalClients, activeClients,
      totalExercises, checkinsToday, checkinsWeek, totalCheckins });
  } catch (err) { next(err); }
});

/* ── COACHES ── */
router.get('/coaches', adminAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const match = {};
    if (search) match.name = { $regex: search, $options: 'i' };
    const skip = (Number(page) - 1) * Number(limit);

    const [data, total] = await Promise.all([
      Coach.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: Number(limit) },
        { $lookup: {
            from: 'clients',
            let: { coachId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$coach', '$$coachId'] } } },
              { $group: { _id: '$isActive', count: { $sum: 1 } } },
            ],
            as: 'clientStats',
        }},
        { $addFields: {
            totalClients: { $sum: '$clientStats.count' },
            activeClients: {
              $ifNull: [
                { $arrayElemAt: [
                  { $filter: { input: '$clientStats', cond: { $eq: ['$$this._id', true] } } },
                  0
                ]},
                { count: 0 }
              ]
            },
        }},
        { $addFields: { activeClients: '$activeClients.count' } },
        { $project: { password: 0, clientStats: 0 } },
      ]),
      Coach.countDocuments(match),
    ]);

    res.json({ data, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

router.put('/coaches/:id/toggle', adminAuth, async (req, res, next) => {
  try {
    const coach = await Coach.findById(req.params.id);
    if (!coach) return res.status(404).json({ message: 'Coach no encontrado' });
    coach.isActive = !coach.isActive;
    await coach.save();
    res.json(coach);
  } catch (err) { next(err); }
});

/* ── EJERCICIOS ── */
router.get('/exercises', adminAuth, async (req, res, next) => {
  try {
    const { search, bodyPart, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { nameEN: { $regex: search, $options: 'i' } },
    ];
    if (bodyPart) filter.bodyPart = bodyPart;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      Exercise.find(filter).sort({ name: 1 }).skip(skip).limit(Number(limit)),
      Exercise.countDocuments(filter),
    ]);
    res.json({ data, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

router.post('/exercises', adminAuth, async (req, res, next) => {
  try {
    const exercise = await Exercise.create({ ...req.body, isCustom: true });
    res.status(201).json(exercise);
  } catch (err) { next(err); }
});

router.put('/exercises/:id', adminAuth, async (req, res, next) => {
  try {
    const exercise = await Exercise.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!exercise) return res.status(404).json({ message: 'Ejercicio no encontrado' });
    res.json(exercise);
  } catch (err) { next(err); }
});

router.delete('/exercises/:id', adminAuth, async (req, res, next) => {
  try {
    await Exercise.findByIdAndDelete(req.params.id);
    res.json({ message: 'Ejercicio eliminado' });
  } catch (err) { next(err); }
});

router.get('/exercises/metrics', adminAuth, async (req, res, next) => {
  try {
    const ClientRoutine = require('../models/ClientRoutine');

    // Cuántas veces aparece cada ejercicio en rutinas activas
    const usageInRoutines = await ClientRoutine.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$days' },
      { $unwind: '$days.exercises' },
      { $group: { _id: '$days.exercises.exercise', routineCount: { $sum: 1 } } },
    ]);

    // Cuántas veces se completó cada ejercicio en check-ins
    const usageInCheckins = await CheckIn.aggregate([
      { $unwind: '$exerciseLogs' },
      { $group: { _id: '$exerciseLogs.exercise', checkinCount: { $sum: 1 } } },
    ]);

    const checkinMap = Object.fromEntries(usageInCheckins.map(r => [r._id?.toString(), r.checkinCount]));

    // Unir con datos del ejercicio
    const usedIds = usageInRoutines.map(r => r._id).filter(Boolean);
    const [usedExercises, unusedExercises, byBodyPart] = await Promise.all([
      Exercise.find({ _id: { $in: usedIds } }).select('name bodyPart equipment gifUrl'),
      Exercise.find({ _id: { $nin: usedIds } }).select('name bodyPart equipment').limit(100),
      Exercise.aggregate([
        { $group: { _id: '$bodyPart', total: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
    ]);

    const exerciseMap = Object.fromEntries(usedExercises.map(e => [e._id.toString(), e]));

    const ranked = usageInRoutines
      .filter(r => r._id && exerciseMap[r._id.toString()])
      .map(r => ({
        exercise: exerciseMap[r._id.toString()],
        routineCount: r.routineCount,
        checkinCount: checkinMap[r._id.toString()] || 0,
      }))
      .sort((a, b) => b.routineCount - a.routineCount);

    res.json({
      topUsed:    ranked.slice(0, 20),
      unused:     unusedExercises,
      byBodyPart,
      totalUsed:  usedIds.length,
      totalUnused: await Exercise.countDocuments({ _id: { $nin: usedIds } }),
    });
  } catch (err) { next(err); }
});

router.post('/exercises/sync', adminAuth, async (req, res, next) => {
  try {
    const synced = await syncAll();
    res.json({ synced, total: await Exercise.countDocuments() });
  } catch (err) { next(err); }
});

// Detecta instrucciones en inglés y las traduce al español, procesando en lotes
const englishRegex = /\b(the|and|with|your|you|keep|place|position|hold|perform|slowly|begin|start|return)\b/i;

router.post('/exercises/translate-instructions', adminAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const allWithInstructions = await Exercise.find(
      { 'instructions.0': { $exists: true } }
    ).select('_id instructions');

    const needsTranslation = allWithInstructions.filter(ex =>
      ex.instructions.some(s => englishRegex.test(s))
    );

    if (!needsTranslation.length) {
      return res.json({ translated: 0, remaining: 0 });
    }

    const batch = needsTranslation.slice(0, limit);
    const flatInstructions = batch.flatMap(ex => ex.instructions);
    const flatTranslated = await translateBatch(flatInstructions);

    const anyChanged = flatTranslated.some((t, i) => t !== flatInstructions[i]);
    if (!anyChanged) {
      return res.json({ translated: 0, remaining: needsTranslation.length, translationFailed: true });
    }

    let offset = 0;
    const bulkOps = batch.map(ex => {
      const len = ex.instructions.length;
      const translated = flatTranslated.slice(offset, offset + len);
      offset += len;
      return {
        updateOne: {
          filter: { _id: ex._id },
          update: { $set: { instructions: translated } },
        },
      };
    });

    await Exercise.bulkWrite(bulkOps);
    res.json({ translated: batch.length, remaining: needsTranslation.length - batch.length });
  } catch (err) { next(err); }
});

module.exports = router;
