const jwt = require('jsonwebtoken');
const Coach = require('../models/Coach');
const Client = require('../models/Client');

const protect = async (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer')
    ? req.headers.authorization.split(' ')[1]
    : null;

  if (!token) return res.status(401).json({ message: 'No autorizado' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role === 'coach') {
      req.user = await Coach.findById(decoded.id);
      req.role = 'coach';
    } else {
      req.user = await Client.findById(decoded.id);
      req.role = 'client';
    }
    if (!req.user) return res.status(401).json({ message: 'Usuario no encontrado' });
    next();
  } catch {
    res.status(401).json({ message: 'Token inválido' });
  }
};

const coachOnly = (req, res, next) => {
  if (req.role !== 'coach') return res.status(403).json({ message: 'Solo coaches' });
  next();
};

const clientOnly = (req, res, next) => {
  if (req.role !== 'client') return res.status(403).json({ message: 'Solo clientes' });
  next();
};

module.exports = { protect, coachOnly, clientOnly };
