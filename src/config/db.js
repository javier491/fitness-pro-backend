const mongoose = require('mongoose');

const dropLegacyIndexes = async () => {
  try {
    const col = mongoose.connection.collection('checkins');
    const indexes = await col.indexes();
    const legacy = indexes.find(ix => ix.unique && ix.key?.client === 1 && ix.key?.date != null);
    if (legacy) {
      await col.dropIndex(legacy.name);
      console.log('[DB] Índice único legado de checkins eliminado');
    }
  } catch {
    // Ignorar si ya no existe
  }
};

const connectDB = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI no está definida');
  const conn = await mongoose.connect(process.env.MONGODB_URI);
  console.log(`MongoDB conectado: ${conn.connection.host}`);
  await dropLegacyIndexes();
};

module.exports = connectDB;
