const mongoose = require('mongoose');

const connectDB = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI no está definida');
  const conn = await mongoose.connect(process.env.MONGODB_URI);
  console.log(`MongoDB conectado: ${conn.connection.host}`);
};

module.exports = connectDB;
