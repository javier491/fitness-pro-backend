const router = require('express').Router();
const { protect, clientOnly, coachOnly } = require('../middleware/auth');
const CheckIn = require('../models/CheckIn');
const BodyMetric = require('../models/BodyMetric');
const Client = require('../models/Client');

const getWeekKey = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
};

const getProgressData = async (clientId, from, to) => {
  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) dateFilter.$lte = new Date(to);
  const hasDate = Object.keys(dateFilter).length > 0;

  const [checkins, metrics, client] = await Promise.all([
    CheckIn.find({ client: clientId, ...(hasDate && { date: dateFilter }) })
      .sort({ date: 1 }).select('date routineDayNumber mood exerciseLogs streak'),
    BodyMetric.find({ client: clientId, ...(hasDate && { date: dateFilter }) }).sort({ date: 1 }),
    Client.findById(clientId).select('currentStreak longestStreak name'),
  ]);

  const weeklyAdherence = {};
  checkins.forEach(c => {
    const week = getWeekKey(c.date);
    weeklyAdherence[week] = (weeklyAdherence[week] || 0) + 1;
  });

  return {
    checkins,
    metrics,
    weeklyAdherence: Object.entries(weeklyAdherence).map(([week, count]) => ({ week, count })),
    streak: { current: client?.currentStreak || 0, longest: client?.longestStreak || 0 },
  };
};

router.get('/my', protect, clientOnly, async (req, res, next) => {
  try {
    const data = await getProgressData(req.user._id, req.query.from, req.query.to);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/client/:clientId', protect, coachOnly, async (req, res, next) => {
  try {
    const data = await getProgressData(req.params.clientId, req.query.from, req.query.to);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/coach/overview', protect, coachOnly, async (req, res, next) => {
  try {
    const clients = await Client.find({ coach: req.user._id, isActive: true })
      .select('_id name currentStreak longestStreak');
    const clientIds = clients.map(c => c._id);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const checkins = await CheckIn.find({
      client: { $in: clientIds },
      date: { $gte: thirtyDaysAgo },
    }).select('client date');

    const byClient = {};
    clients.forEach(c => { byClient[c._id] = { client: c, count: 0 }; });
    checkins.forEach(c => { if (byClient[c.client]) byClient[c.client].count++; });

    res.json({
      totalClients: clients.length,
      adherence: Object.values(byClient).sort((a, b) => b.count - a.count),
    });
  } catch (err) { next(err); }
});

// PDF — reporte de progreso de un cliente
router.get('/client/:clientId/pdf', protect, coachOnly, async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const client = await Client.findOne({ _id: req.params.clientId, coach: req.user._id });
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });

    const [checkins, metrics] = await Promise.all([
      CheckIn.find({ client: client._id }).sort({ date: -1 }).limit(30),
      BodyMetric.find({ client: client._id }).sort({ date: -1 }).limit(10),
    ]);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${client.name.replace(/\s/g, '_')}.pdf"`);
    doc.pipe(res);

    // Encabezado
    doc.fontSize(20).fillColor('#f97316').text('FitCoach Pro', { align: 'center' });
    doc.fontSize(14).fillColor('#333').text(`Reporte de progreso — ${client.name}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#666').text(`Generado el ${new Date().toLocaleDateString('es-MX')}`, { align: 'center' });
    doc.moveDown(2);

    // Info del cliente
    doc.fontSize(12).fillColor('#f97316').text('Datos del cliente');
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#eee');
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#333');
    doc.text(`Email: ${client.email}`);
    if (client.phone) doc.text(`Teléfono: ${client.phone}`);
    if (client.goal) doc.text(`Objetivo: ${client.goal}`);
    doc.text(`Racha actual: ${client.currentStreak} días | Racha máxima: ${client.longestStreak} días`);
    doc.moveDown(1.5);

    // Métricas corporales
    if (metrics.length > 0) {
      doc.fontSize(12).fillColor('#f97316').text('Últimas medidas');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#eee');
      doc.moveDown(0.5);
      const m = metrics[0];
      doc.fontSize(10).fillColor('#333');
      const fields = [
        ['Peso', m.weight, 'kg'], ['Estatura', m.height, 'cm'], ['% Grasa', m.bodyFat, '%'],
        ['Cintura', m.waist, 'cm'], ['Pecho', m.chest, 'cm'], ['Cadera', m.hips, 'cm'],
      ];
      fields.filter(([, v]) => v != null).forEach(([label, val, unit]) => {
        doc.text(`${label}: ${val} ${unit}`);
      });
      doc.moveDown(1.5);
    }

    // Historial de check-ins
    doc.fontSize(12).fillColor('#f97316').text(`Historial de rutinas (últimos ${checkins.length})`);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#eee');
    doc.moveDown(0.5);
    checkins.forEach(c => {
      const dateStr = new Date(c.date).toLocaleDateString('es-MX');
      const mood = c.mood ? `Estado de ánimo: ${c.mood}/5` : '';
      doc.fontSize(9).fillColor('#333').text(`✓ ${dateStr}   Día ${c.routineDayNumber}   ${mood}`);
    });

    doc.end();
  } catch (err) { next(err); }
});

module.exports = router;
