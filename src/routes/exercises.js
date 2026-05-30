const router = require('express').Router();
const { protect, coachOnly } = require('../middleware/auth');
const Exercise = require('../models/Exercise');
const exerciseDB = require('../services/exerciseDB');

router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    const { search, bodyPart, equipment, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (search) filter.$text = { $search: search };
    if (bodyPart) filter.bodyPart = bodyPart;
    if (equipment) filter.equipment = equipment;

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      Exercise.find(filter).skip(skip).limit(Number(limit)),
      Exercise.countDocuments(filter),
    ]);

    res.json({ data, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

router.get('/bodyparts', async (req, res, next) => {
  try {
    const parts = await exerciseDB.getBodyParts();
    res.json(parts);
  } catch {
    const local = await Exercise.distinct('bodyPart');
    res.json(local);
  }
});

router.get('/sync', coachOnly, async (req, res, next) => {
  try {
    const synced = await exerciseDB.syncAll();
    res.json({ synced });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) return res.status(404).json({ message: 'Ejercicio no encontrado' });
    res.json(exercise);
  } catch (err) { next(err); }
});

router.post('/', coachOnly, async (req, res, next) => {
  try {
    const exercise = await Exercise.create({ ...req.body, isCustom: true, coach: req.user._id });
    res.status(201).json(exercise);
  } catch (err) { next(err); }
});

module.exports = router;
