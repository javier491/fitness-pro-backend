const router = require('express').Router();
const { protect, clientOnly, coachOnly } = require('../middleware/auth');
const CheckIn = require('../models/CheckIn');
const Client = require('../models/Client');
const Coach = require('../models/Coach');
const ClientRoutine = require('../models/ClientRoutine');
const { sendCheckInAlert } = require('../services/fcm');

// Advance to the next day number in the cycle (wraps around)
function nextDayNumber(totalDays, current) {
  return (current % totalDays) + 1;
}

router.post('/', protect, clientOnly, async (req, res, next) => {
  try {
    const routine = await ClientRoutine.findOne({
      _id: req.body.routine,
      client: req.user._id,
      isActive: true,
    });
    if (!routine) return res.status(404).json({ message: 'Rutina no encontrada' });

    // Status-based validation: only the current active day can be completed
    const currentDayNumber = routine.currentDayNumber || 1;
    if (Number(req.body.routineDayNumber) !== Number(currentDayNumber)) {
      return res.status(400).json({ message: 'Este día ya fue completado o no es el día actual' });
    }

    const currentDay = routine.days.find(d => d.dayNumber === currentDayNumber);
    const isRestDay = currentDay?.isRestDay || false;

    // Fecha de la sesión: el cliente puede enviar una fecha pasada (olvido de guardar)
    const sessionDate = req.body.date ? new Date(req.body.date) : new Date();
    sessionDate.setHours(0, 0, 0, 0);

    // No permitir fechas futuras
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (sessionDate > today) sessionDate.setTime(today.getTime());

    // Streak: basado en la última sesión guardada antes de esta fecha
    const lastCheckin = await CheckIn.findOne({
      client: req.user._id,
      date: { $lt: sessionDate },
    }).sort({ date: -1 });

    let newStreak = 1;
    if (lastCheckin) {
      const lastDate = new Date(lastCheckin.date);
      lastDate.setHours(0, 0, 0, 0);
      const daysSinceLast = Math.floor((sessionDate - lastDate) / (1000 * 60 * 60 * 24));
      if (isRestDay) {
        newStreak = lastCheckin.streak || 1;
      } else if (daysSinceLast <= 5) {
        newStreak = (lastCheckin.streak || 0) + 1;
      }
    }

    const checkin = await CheckIn.create({
      ...req.body,
      client: req.user._id,
      date: sessionDate,
      streak: newStreak,
    });

    // Advance routine to the next day
    const next = nextDayNumber(routine.totalDays, routine.currentDayNumber || 1);
    await ClientRoutine.findByIdAndUpdate(routine._id, { currentDayNumber: next });

    // Update client streak (skip for rest days)
    if (!isRestDay) {
      const streakUpdate = { currentStreak: newStreak };
      const clientDoc = await Client.findById(req.user._id);
      if (newStreak > (clientDoc.longestStreak || 0)) streakUpdate.longestStreak = newStreak;
      await Client.findByIdAndUpdate(req.user._id, streakUpdate);
      const coach = await Coach.findById(clientDoc.coach);
      if (coach) sendCheckInAlert(coach, clientDoc);
    }

    res.status(201).json({ checkin, streak: newStreak });
  } catch (err) { next(err); }
});

router.get('/my', protect, clientOnly, async (req, res, next) => {
  try {
    const { from, to, page = 1, limit = 30 } = req.query;
    const filter = { client: req.user._id };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      CheckIn.find(filter).sort({ date: -1 }).skip(skip).limit(Number(limit))
        .populate('exerciseLogs.exercise', 'name gifUrl'),
      CheckIn.countDocuments(filter),
    ]);
    res.json({ data, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

// Mapa de check-ins para el calendario (todos los del año, solo fechas)
router.get('/my/calendar', protect, clientOnly, async (req, res, next) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const start = new Date(`${year}-01-01`);
    const end = new Date(`${Number(year) + 1}-01-01`);
    const checkins = await CheckIn.find({ client: req.user._id, date: { $gte: start, $lt: end } })
      .select('date streak routineDayNumber');
    res.json(checkins);
  } catch (err) { next(err); }
});

router.get('/dashboard', protect, coachOnly, async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const clients = await Client.find({ coach: req.user._id, isActive: true })
      .select('_id name currentStreak longestStreak');
    const clientIds = clients.map(c => c._id);

    const todayCheckins = await CheckIn.find({
      client: { $in: clientIds },
      date: { $gte: today, $lt: tomorrow },
    }).select('client');

    const completedIds = new Set(todayCheckins.map(c => c.client.toString()));

    const summary = clients.map(c => ({
      client: c,
      completedToday: completedIds.has(c._id.toString()),
    }));

    res.json({
      total: clients.length,
      completedToday: completedIds.size,
      pending: clients.length - completedIds.size,
      summary,
    });
  } catch (err) { next(err); }
});

module.exports = router;
