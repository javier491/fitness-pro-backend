const router = require('express').Router();
const { protect, coachOnly } = require('../middleware/auth');
const ClientRoutine = require('../models/ClientRoutine');
const RoutineTemplate = require('../models/RoutineTemplate');
const Client = require('../models/Client');

router.use(protect);

/* ---- TEMPLATES (solo coach) ---- */
router.get('/templates', coachOnly, async (req, res, next) => {
  try {
    const templates = await RoutineTemplate.find({ coach: req.user._id, isActive: true })
      .populate('days.exercises.exercise', 'name bodyPart gifUrl');
    res.json(templates);
  } catch (err) { next(err); }
});

router.post('/templates', coachOnly, async (req, res, next) => {
  try {
    const template = await RoutineTemplate.create({ ...req.body, coach: req.user._id });
    res.status(201).json(template);
  } catch (err) { next(err); }
});

router.put('/templates/:id', coachOnly, async (req, res, next) => {
  try {
    const template = await RoutineTemplate.findOneAndUpdate(
      { _id: req.params.id, coach: req.user._id },
      req.body,
      { new: true }
    );
    if (!template) return res.status(404).json({ message: 'Plantilla no encontrada' });
    res.json(template);
  } catch (err) { next(err); }
});

router.delete('/templates/:id', coachOnly, async (req, res, next) => {
  try {
    await RoutineTemplate.findOneAndUpdate(
      { _id: req.params.id, coach: req.user._id },
      { isActive: false }
    );
    res.json({ message: 'Plantilla eliminada' });
  } catch (err) { next(err); }
});

/* ---- CLIENT ROUTINES ---- */
router.get('/client/:clientId', coachOnly, async (req, res, next) => {
  try {
    const routines = await ClientRoutine.find({ client: req.params.clientId, coach: req.user._id })
      .populate('days.exercises.exercise', 'name bodyPart gifUrl target equipment');
    res.json(routines);
  } catch (err) { next(err); }
});

router.post('/assign', coachOnly, async (req, res, next) => {
  try {
    const { clientId, templateId, ...routineData } = req.body;
    const client = await Client.findOne({ _id: clientId, coach: req.user._id });
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });

    await ClientRoutine.updateMany({ client: clientId, isActive: true }, { isActive: false });

    let days = routineData.days;
    if (templateId) {
      const template = await RoutineTemplate.findById(templateId);
      if (template) {
        days = template.days;
        routineData.fromTemplate = templateId;
        routineData.frequency = template.frequency;
        routineData.totalDays = template.totalDays;
      }
    }

    const routine = await ClientRoutine.create({
      ...routineData,
      days,
      coach: req.user._id,
      client: clientId,
    });
    res.status(201).json(routine);
  } catch (err) { next(err); }
});

router.put('/:id', coachOnly, async (req, res, next) => {
  try {
    const routine = await ClientRoutine.findOneAndUpdate(
      { _id: req.params.id, coach: req.user._id },
      req.body,
      { new: true }
    ).populate('days.exercises.exercise');
    if (!routine) return res.status(404).json({ message: 'Rutina no encontrada' });
    res.json(routine);
  } catch (err) { next(err); }
});

/* ---- CLIENT: ver mi rutina de hoy ---- */
router.get('/today', async (req, res, next) => {
  try {
    if (req.role !== 'client') return res.status(403).json({ message: 'Solo clientes' });

    const routine = await ClientRoutine.findOne({ client: req.user._id, isActive: true })
      .populate('days.exercises.exercise');
    if (!routine) return res.status(404).json({ message: 'Sin rutina activa' });

    const currentDayNumber = routine.currentDayNumber || 1;
    const todayDay = routine.days.find(d => d.dayNumber === currentDayNumber) || routine.days[0];
    const nextDayNumber = (currentDayNumber % routine.totalDays) + 1;
    const nextDay = routine.days.find(d => d.dayNumber === nextDayNumber);

    res.json({ routine, todayDay, nextDay, completed: false });
  } catch (err) { next(err); }
});

module.exports = router;
