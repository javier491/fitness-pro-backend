const router = require('express').Router();
const path = require('path');
const { protect } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimit');
const upload = require('../middleware/upload');
const Coach = require('../models/Coach');
const Client = require('../models/Client');
const Exercise = require('../models/Exercise');

const fileUrl = (req, filename) =>
  `${req.protocol}://${req.get('host')}/uploads/${filename}`;

router.post('/profile', protect, uploadLimiter, upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se envió ningún archivo' });
    const url = fileUrl(req, req.file.filename);
    const Model = req.role === 'coach' ? Coach : Client;
    await Model.findByIdAndUpdate(req.user._id, { profilePic: url });
    res.json({ url });
  } catch (err) { next(err); }
});

router.post('/exercise/:id', protect, uploadLimiter, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se envió ningún archivo' });
    const url = fileUrl(req, req.file.filename);
    await Exercise.findByIdAndUpdate(req.params.id, { gifUrl: url });
    res.json({ url });
  } catch (err) { next(err); }
});

module.exports = router;
