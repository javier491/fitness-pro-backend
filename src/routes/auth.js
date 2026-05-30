const router = require('express').Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const Coach = require('../models/Coach');
const Client = require('../models/Client');
const { protect } = require('../middleware/auth');
const { sendPasswordReset, sendWelcomeCoach } = require('../config/email');

const signToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });

router.post('/register/coach',
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const coach = await Coach.create(req.body);
      const token = signToken(coach._id, 'coach');
      try { await sendWelcomeCoach(coach.email, coach.name); } catch {}
      res.status(201).json({ token, user: coach, role: 'coach' });
    } catch (err) { next(err); }
  }
);

router.post('/login/coach',
  body('email').isEmail(),
  body('password').notEmpty(),
  async (req, res, next) => {
    try {
      const { email, password, fcmToken } = req.body;
      const coach = await Coach.findOne({ email }).select('+password');
      if (!coach || !(await coach.comparePassword(password))) {
        return res.status(401).json({ message: 'Credenciales incorrectas' });
      }
      if (fcmToken) { coach.fcmToken = fcmToken; await coach.save(); }
      const token = signToken(coach._id, 'coach');
      coach.password = undefined;
      res.json({ token, user: coach, role: 'coach' });
    } catch (err) { next(err); }
  }
);

router.post('/login/client',
  body('email').isEmail(),
  body('password').notEmpty(),
  async (req, res, next) => {
    try {
      const { email, password, fcmToken } = req.body;
      const client = await Client.findOne({ email }).select('+password');
      if (!client || !(await client.comparePassword(password))) {
        return res.status(401).json({ message: 'Credenciales incorrectas' });
      }
      if (fcmToken) { client.fcmToken = fcmToken; await client.save(); }
      const token = signToken(client._id, 'client');
      client.password = undefined;
      res.json({ token, user: client, role: 'client' });
    } catch (err) { next(err); }
  }
);

router.get('/me', protect, (req, res) => res.json({ user: req.user, role: req.role }));

// Cambiar contraseña (autenticado)
router.put('/change-password', protect, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }
    const Model = req.role === 'coach' ? Coach : Client;
    const user = await Model.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ message: 'Contraseña actual incorrecta' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Contraseña actualizada' });
  } catch (err) { next(err); }
});

// Olvidé mi contraseña — coach
router.post('/forgot-password/coach', async (req, res, next) => {
  try {
    const { email } = req.body;
    const coach = await Coach.findOne({ email });
    if (!coach) return res.json({ message: 'Si el correo existe, recibirás un enlace.' });
    const token = coach.createPasswordResetToken();
    await coach.save({ validateBeforeSave: false });
    try {
      await sendPasswordReset(coach.email, coach.name, token, 'coach');
    } catch {
      coach.passwordResetToken = undefined;
      coach.passwordResetExpires = undefined;
      await coach.save({ validateBeforeSave: false });
      return res.status(500).json({ message: 'Error al enviar el correo' });
    }
    res.json({ message: 'Si el correo existe, recibirás un enlace.' });
  } catch (err) { next(err); }
});

// Olvidé mi contraseña — cliente
router.post('/forgot-password/client', async (req, res, next) => {
  try {
    const { email } = req.body;
    const client = await Client.findOne({ email });
    if (!client) return res.json({ message: 'Si el correo existe, recibirás un enlace.' });
    const token = client.createPasswordResetToken();
    await client.save({ validateBeforeSave: false });
    try {
      await sendPasswordReset(client.email, client.name, token, 'client');
    } catch {
      client.passwordResetToken = undefined;
      client.passwordResetExpires = undefined;
      await client.save({ validateBeforeSave: false });
      return res.status(500).json({ message: 'Error al enviar el correo' });
    }
    res.json({ message: 'Si el correo existe, recibirás un enlace.' });
  } catch (err) { next(err); }
});

// Restablecer contraseña
router.post('/reset-password/:token', async (req, res, next) => {
  try {
    const { role = 'coach', password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const Model = role === 'coach' ? Coach : Client;
    const user = await Model.findOne({
      passwordResetToken: hashed,
      passwordResetExpires: { $gt: Date.now() },
    });
    if (!user) return res.status(400).json({ message: 'Token inválido o expirado' });
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    res.json({ message: 'Contraseña restablecida exitosamente' });
  } catch (err) { next(err); }
});

module.exports = router;
