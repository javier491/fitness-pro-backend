const admin = require('../config/firebase');

const sendPush = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) return;
  if (!admin.apps.length) return;
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: { ...data },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  } catch (err) {
    console.error('FCM error:', err.message);
  }
};

const sendRoutineReminder = (client) =>
  sendPush(
    client.fcmToken,
    '¡Es hora de entrenar! 💪',
    `${client.name}, tienes una rutina pendiente hoy.`,
    { type: 'routine_reminder' }
  );

const sendCheckInAlert = (coach, client) =>
  sendPush(
    coach.fcmToken,
    '✅ Rutina completada',
    `${client.name} completó su rutina del día.`,
    { type: 'checkin_completed', clientId: client._id.toString() }
  );

module.exports = { sendPush, sendRoutineReminder, sendCheckInAlert };
