const router = require('express').Router();
const { protect, coachOnly } = require('../middleware/auth');
const Exercise = require('../models/Exercise');
const exerciseDB = require('../services/exerciseDB');

const englishRegex = /\b(the|and|with|your|you|keep|place|position|hold|perform|slowly|begin|start|return)\b/i;

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

router.post('/translate-instructions', coachOnly, async (req, res, next) => {
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
    const flatTranslated = await exerciseDB.translateBatch(flatInstructions);

    // Si ningún texto cambió, Google Translate no está disponible
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

router.get('/:id', async (req, res, next) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) return res.status(404).json({ message: 'Ejercicio no encontrado' });

    // Si las instrucciones parecen estar en inglés, traducirlas al vuelo
    const needsTranslation = exercise.instructions?.length > 0 &&
      exercise.instructions.some(s => /\b(the|and|with|your|you|keep|place|position|hold|perform|slowly|begin|start|return)\b/i.test(s));

    if (needsTranslation) {
      try {
        const { translate } = await import('@vitalets/google-translate-api');
        const joined = exercise.instructions.join('\n');
        const { text } = await translate(joined, { from: 'en', to: 'es' });
        const translated = text.split('\n').map(s => s.trim()).filter(Boolean);
        // Guardar en DB para no traducir de nuevo
        await Exercise.findByIdAndUpdate(exercise._id, { instructions: translated });
        exercise.instructions = translated;
      } catch { /* mantener inglés si falla */ }
    }

    res.json(exercise);
  } catch (err) { next(err); }
});

router.post('/', coachOnly, async (req, res, next) => {
  try {
    const exercise = await Exercise.create({ ...req.body, isCustom: true, coach: req.user._id });
    res.status(201).json(exercise);
  } catch (err) { next(err); }
});

router.put('/:id', coachOnly, async (req, res, next) => {
  try {
    const exercise = await Exercise.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!exercise) return res.status(404).json({ message: 'Ejercicio no encontrado' });
    res.json(exercise);
  } catch (err) { next(err); }
});

router.delete('/:id', coachOnly, async (req, res, next) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) return res.status(404).json({ message: 'Ejercicio no encontrado' });
    await exercise.deleteOne();
    res.json({ message: 'Ejercicio eliminado' });
  } catch (err) { next(err); }
});

module.exports = router;
