const router = require('express').Router();
const { protect, coachOnly } = require('../middleware/auth');
const Coach = require('../models/Coach');

router.use(protect, coachOnly);

router.get('/profile', (req, res) => res.json(req.user));

router.put('/profile', async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'specialty', 'bio'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const coach = await Coach.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json(coach);
  } catch (err) { next(err); }
});

router.put('/change-password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const coach = await Coach.findById(req.user._id).select('+password');
    if (!(await coach.comparePassword(currentPassword))) {
      return res.status(400).json({ message: 'Contraseña actual incorrecta' });
    }
    coach.password = newPassword;
    await coach.save();
    res.json({ message: 'Contraseña actualizada' });
  } catch (err) { next(err); }
});

module.exports = router;
