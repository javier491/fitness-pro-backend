require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Conectado a MongoDB');

  const col = mongoose.connection.collection('checkins');
  const indexes = await col.indexes();

  console.log('Índices actuales:');
  indexes.forEach(ix => console.log(' -', ix.name, JSON.stringify(ix.key), ix.unique ? '(UNIQUE)' : ''));

  const legacy = indexes.find(ix => ix.unique && ix.key?.client === 1 && ix.key?.date != null);
  if (legacy) {
    await col.dropIndex(legacy.name);
    console.log(`✅ Índice único eliminado: ${legacy.name}`);
  } else {
    console.log('ℹ️  No se encontró índice único (ya fue eliminado o nunca existió)');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
