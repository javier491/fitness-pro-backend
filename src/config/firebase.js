const admin = require('firebase-admin');

const hasFirebaseConfig =
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_PRIVATE_KEY &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  !process.env.FIREBASE_PRIVATE_KEY.includes('tu_key_aqui');

if (hasFirebaseConfig && !admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  } catch (err) {
    console.warn('[Firebase] No se pudo inicializar — push notifications desactivadas:', err.message);
  }
} else if (!hasFirebaseConfig) {
  console.warn('[Firebase] Credenciales no configuradas — push notifications desactivadas.');
}

module.exports = admin;
