const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = require('../src/app');
const connectDB = require('../src/config/db');

let connected = false;

module.exports = async (req, res) => {
  if (!connected) {
    try {
      await connectDB();
      connected = true;
    } catch (err) {
      console.error('[DB] Error al conectar:', err.message);
      // Continúa de todas formas — la página de estado mostrará DB desconectada
    }
  }
  return app(req, res);
};
