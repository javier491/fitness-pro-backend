const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Coach = require('../models/Coach');
const Client = require('../models/Client');
const Exercise = require('../models/Exercise');
const { syncAll } = require('../services/exerciseDB');

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

// Login del admin (se crea manualmente o via seed)
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ message: 'Credenciales incorrectas' });
    }
    const token = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, admin });
  } catch (err) { next(err); }
});

// Crear primer admin (solo si no existe ninguno, o con ADMIN_SECRET)
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

// Listar coaches
router.get('/coaches', adminAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (search) filter.name = { $regex: search, $options: 'i' };
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      Coach.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Coach.countDocuments(filter),
    ]);
    res.json({ data, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

// Activar / desactivar coach
router.put('/coaches/:id/toggle', adminAuth, async (req, res, next) => {
  try {
    const coach = await Coach.findById(req.params.id);
    if (!coach) return res.status(404).json({ message: 'Coach no encontrado' });
    coach.isActive = !coach.isActive;
    await coach.save();
    res.json(coach);
  } catch (err) { next(err); }
});

// Stats generales
router.get('/stats', adminAuth, async (req, res, next) => {
  try {
    const [totalCoaches, activeCoaches, totalClients, activeClients, totalExercises] = await Promise.all([
      Coach.countDocuments(),
      Coach.countDocuments({ isActive: true }),
      Client.countDocuments(),
      Client.countDocuments({ isActive: true }),
      Exercise.countDocuments(),
    ]);
    res.json({ totalCoaches, activeCoaches, totalClients, activeClients, totalExercises });
  } catch (err) { next(err); }
});

// Sincronizar ejercicios desde GitHub dataset
router.post('/exercises/sync', adminAuth, async (req, res, next) => {
  try {
    const synced = await syncAll();
    res.json({ synced, total: await Exercise.countDocuments() });
  } catch (err) { next(err); }
});

module.exports = router;
