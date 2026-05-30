const router = require('express').Router();
const crypto = require('crypto');
const { protect, coachOnly } = require('../middleware/auth');
const Client = require('../models/Client');
const BodyMetric = require('../models/BodyMetric');
const ClientRoutine = require('../models/ClientRoutine');
const CheckIn = require('../models/CheckIn');
const { sendWelcomeClient } = require('../config/email');

const generatePassword = () => {
  const words = ['Fit', 'Pro', 'Gym', 'Run', 'Box', 'Zen', 'Top', 'Max'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}${num}`;
};

router.use(protect, coachOnly);

router.get('/', async (req, res, next) => {
  try {
    const { search, isActive, page = 1, limit = 20 } = req.query;
    const filter = { coach: req.user._id };
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) filter.name = { $regex: search, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const [clients, total] = await Promise.all([
      Client.find(filter).sort({ name: 1 }).skip(skip).limit(Number(limit)),
      Client.countDocuments(filter),
    ]);

    res.json({ data: clients, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const rawPassword = generatePassword();
    const { initialMetrics, ...clientData } = req.body;

    const client = await Client.create({ ...clientData, password: rawPassword, coach: req.user._id });

    if (initialMetrics) {
      await BodyMetric.create({
        client: client._id,
        coach: req.user._id,
        ...initialMetrics,
        recordedBy: 'coach',
      });
    }

    try { await sendWelcomeClient(client.email, client.name, client.email, rawPassword); } catch {}

    res.status(201).json({ client, credentials: { email: client.email, password: rawPassword } });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, coach: req.user._id });
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });

    const [metrics, activeRoutine] = await Promise.all([
      BodyMetric.find({ client: client._id }).sort({ date: -1 }).limit(10),
      ClientRoutine.findOne({ client: client._id, isActive: true }).populate('days.exercises.exercise'),
    ]);

    res.json({ client, metrics, activeRoutine });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, coach: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json(client);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, coach: req.user._id },
      { isActive: false },
      { new: true }
    );
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json({ message: 'Cliente desactivado' });
  } catch (err) { next(err); }
});

router.post('/:id/metrics', async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, coach: req.user._id });
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });
    const metric = await BodyMetric.create({
      ...req.body,
      client: client._id,
      coach: req.user._id,
      recordedBy: 'coach',
    });
    res.status(201).json(metric);
  } catch (err) { next(err); }
});

router.get('/:id/metrics', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      BodyMetric.find({ client: req.params.id, coach: req.user._id })
        .sort({ date: -1 }).skip(skip).limit(Number(limit)),
      BodyMetric.countDocuments({ client: req.params.id, coach: req.user._id }),
    ]);
    res.json({ data, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

router.get('/:id/checkins', async (req, res, next) => {
  try {
    const { from, to, page = 1, limit = 30 } = req.query;
    const filter = { client: req.params.id };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      CheckIn.find(filter).sort({ date: -1 }).skip(skip).limit(Number(limit)).populate('routine', 'name'),
      CheckIn.countDocuments(filter),
    ]);
    res.json({ data, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

module.exports = router;
