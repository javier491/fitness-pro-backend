const router = require('express').Router();
const { protect, clientOnly, coachOnly } = require('../middleware/auth');
const Comment = require('../models/Comment');

router.post('/', protect, clientOnly, async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const comment = await Comment.create({
      ...req.body,
      client: req.user._id,
      date: today,
      author: 'client',
    });
    res.status(201).json(comment);
  } catch (err) { next(err); }
});

router.get('/my', protect, clientOnly, async (req, res, next) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      Comment.find({ client: req.user._id }).sort({ date: -1 })
        .skip(skip).limit(Number(limit)).populate('exercise', 'name'),
      Comment.countDocuments({ client: req.user._id }),
    ]);
    res.json({ data, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

router.get('/client/:clientId', protect, coachOnly, async (req, res, next) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      Comment.find({ client: req.params.clientId }).sort({ date: -1 })
        .skip(skip).limit(Number(limit)).populate('exercise', 'name'),
      Comment.countDocuments({ client: req.params.clientId }),
    ]);
    res.json({ data, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

// Coach responde a un cliente
router.post('/coach/:clientId', protect, coachOnly, async (req, res, next) => {
  try {
    const comment = await Comment.create({
      ...req.body,
      client: req.params.clientId,
      author: 'coach',
      date: new Date(),
    });
    res.status(201).json(comment);
  } catch (err) { next(err); }
});

router.delete('/:id', protect, async (req, res, next) => {
  try {
    const filter = { _id: req.params.id };
    if (req.role === 'client') filter.client = req.user._id;
    const comment = await Comment.findOneAndDelete(filter);
    if (!comment) return res.status(404).json({ message: 'Comentario no encontrado' });
    res.json({ message: 'Comentario eliminado' });
  } catch (err) { next(err); }
});

module.exports = router;
