const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ message: 'Error de validación', errors });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ message: `El ${field} ya está registrado` });
  }

  res.status(err.statusCode || 500).json({
    message: err.message || 'Error interno del servidor',
  });
};

module.exports = errorHandler;
