const axios = require('axios');
const Exercise = require('../models/Exercise');

const DATASET_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

// Traducciones de vocabulario fijo (sin necesidad de API)
const bodyPartES = {
  back: 'Espalda', cardio: 'Cardio', chest: 'Pecho',
  'lower arms': 'Antebrazos', 'lower legs': 'Pantorrillas',
  neck: 'Cuello', shoulders: 'Hombros',
  'upper arms': 'Brazos', 'upper legs': 'Piernas', waist: 'Abdomen',
};

const equipmentES = {
  assisted: 'Asistido', band: 'Banda elástica', barbell: 'Barra',
  'body weight': 'Peso corporal', 'bosu ball': 'Bosu', cable: 'Cable',
  dumbbell: 'Mancuerna', 'elliptical machine': 'Elíptica',
  'ez barbell': 'Barra EZ', hammer: 'Martillo', kettlebell: 'Kettlebell',
  'leverage machine': 'Máquina', 'medicine ball': 'Balón medicinal',
  'olympic barbell': 'Barra olímpica', 'resistance band': 'Banda de resistencia',
  roller: 'Rodillo', rope: 'Cuerda / TRX', 'skierg machine': 'SkiErg',
  'sled machine': 'Trineo', 'smith machine': 'Máquina Smith',
  'stability ball': 'Balón de estabilidad', 'stationary bike': 'Bicicleta estática',
  'stepmill machine': 'Escaladora', tire: 'Llanta', 'trap bar': 'Barra Trap',
  'upper body ergometer': 'Ergómetro', weighted: 'Con peso',
  'wheel roller': 'Rueda abdominal',
};

const muscleES = {
  abductors: 'Abductores', abs: 'Abdominales', adductors: 'Aductores',
  biceps: 'Bíceps', calves: 'Pantorrillas',
  'cardiovascular system': 'Sistema cardiovascular', delts: 'Deltoides',
  forearms: 'Antebrazos', glutes: 'Glúteos', hamstrings: 'Isquiotibiales',
  'hip flexors': 'Flexores de cadera', lats: 'Dorsales',
  'levator scapulae': 'Elevador de la escápula', pectorals: 'Pectorales',
  quads: 'Cuádriceps', 'serratus anterior': 'Serrato anterior',
  spine: 'Columna vertebral', traps: 'Trapecios', triceps: 'Tríceps',
  'upper back': 'Espalda alta',
};

const t = (map, v) => (v ? (map[v.toLowerCase()] ?? v) : v);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Traduce un bloque de textos juntos (unidos por \n) en grupos de 25
const translateBatch = async (texts) => {
  if (!texts?.length) return texts;
  try {
    const { translate } = await import('@vitalets/google-translate-api');
    const results = new Array(texts.length);
    const CHUNK = 25;
    for (let i = 0; i < texts.length; i += CHUNK) {
      const chunk = texts.slice(i, i + CHUNK);
      try {
        const { text } = await translate(chunk.join('\n'), { from: 'en', to: 'es' });
        const parts = text.split('\n');
        chunk.forEach((orig, j) => { results[i + j] = parts[j]?.trim() || orig; });
      } catch {
        chunk.forEach((orig, j) => { results[i + j] = orig; });
      }
      await sleep(400); // evita rate limit
    }
    return results;
  } catch {
    return texts;
  }
};

const toExercise = (raw, nameES) => {
  return {
    externalId: raw.id,
    name: nameES || raw.name,
    nameEN: raw.name, // conserva el nombre en inglés por referencia
    bodyPart: t(bodyPartES, raw.category),
    equipment: t(equipmentES, raw.equipment),
    target: t(muscleES, raw.primaryMuscles?.[0]),
    secondaryMuscles: (raw.secondaryMuscles || []).map(m => t(muscleES, m)),
    instructions: raw.instructions || [],
    gifUrl: raw.images?.[0] ? `${IMG_BASE}/${raw.images[0]}` : null,
  };
};

const syncAll = async () => {
  const { data } = await axios.get(DATASET_URL, { timeout: 30000 });

  // 1. Traducir todos los nombres en batch
  console.log(`[Sync] Traduciendo ${data.length} nombres...`);
  const namesEN = data.map(r => r.name);
  const namesES = await translateBatch(namesEN);

  // 2. Construir documentos y hacer upsert
  let upserted = 0;
  const BATCH = 50;
  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH);
    const docs = batch.map((raw, j) => toExercise(raw, namesES[i + j]));
    const ops = docs.map(doc => ({
      updateOne: {
        filter: { externalId: doc.externalId },
        update: { $set: doc },
        upsert: true,
      },
    }));
    const result = await Exercise.bulkWrite(ops);
    upserted += result.upsertedCount + result.modifiedCount;
  }
  return upserted;
};

const getBodyParts = () => Exercise.distinct('bodyPart');

module.exports = { syncAll, getBodyParts };
