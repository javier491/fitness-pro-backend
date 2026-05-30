require('dotenv').config();
const fs = require('fs');
const path = require('path');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { startCronJobs } = require('./src/services/cron');

const PORT = process.env.PORT || 4000;

// Crear directorio de uploads si no existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

connectDB().then(() => {
  startCronJobs();
  app.listen(PORT, () => {
    console.log(`FitCoach API corriendo en puerto ${PORT}`);
  });
});
