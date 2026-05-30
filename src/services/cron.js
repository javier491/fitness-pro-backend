const cron = require('node-cron');
const Client = require('../models/Client');
const CheckIn = require('../models/CheckIn');
const ClientRoutine = require('../models/ClientRoutine');
const { sendPush } = require('./fcm');

const startCronJobs = () => {
  const hour = process.env.REMINDER_HOUR || 8;

  // Recordatorio diario a la hora configurada
  cron.schedule(`0 ${hour} * * *`, async () => {
    console.log('[CRON] Enviando recordatorios de rutina...');
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeClients = await Client.find({ isActive: true, fcmToken: { $exists: true, $ne: null } });

      for (const client of activeClients) {
        const checkin = await CheckIn.findOne({ client: client._id, date: { $gte: today } });
        if (checkin) continue;

        const routine = await ClientRoutine.findOne({ client: client._id, isActive: true });
        if (!routine) continue;

        const start = new Date(routine.startDate);
        const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));
        const dayIndex = diffDays % routine.totalDays;
        const todayDay = routine.days.find(d => d.dayNumber === dayIndex + 1);

        if (todayDay?.isRestDay) continue;

        await sendPush(
          client.fcmToken,
          '¡Hora de entrenar! 💪',
          `${client.name}, tienes ${todayDay?.exercises?.length || 0} ejercicios pendientes hoy.`,
          { type: 'routine_reminder' }
        );
      }
      console.log(`[CRON] Recordatorios enviados a ${activeClients.length} clientes potenciales`);
    } catch (err) {
      console.error('[CRON] Error en recordatorios:', err.message);
    }
  });

  // Reset de streak — cada medianoche revisa clientes que no entrenaron ayer
  cron.schedule('5 0 * * *', async () => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);

      const clientsWithStreak = await Client.find({ currentStreak: { $gt: 0 } });

      for (const client of clientsWithStreak) {
        const routine = await ClientRoutine.findOne({ client: client._id, isActive: true });
        if (!routine) continue;

        const start = new Date(routine.startDate);
        const diffDays = Math.floor((yesterday - start) / (1000 * 60 * 60 * 24));
        const dayIndex = diffDays % routine.totalDays;
        const yesterdayDay = routine.days.find(d => d.dayNumber === dayIndex + 1);

        // No resetear si ayer era día de descanso
        if (yesterdayDay?.isRestDay) continue;

        const checkin = await CheckIn.findOne({ client: client._id, date: { $gte: yesterday, $lte: yesterdayEnd } });
        if (!checkin) {
          await Client.findByIdAndUpdate(client._id, { currentStreak: 0 });
        }
      }
    } catch (err) {
      console.error('[CRON] Error en reset de streak:', err.message);
    }
  });

  console.log('[CRON] Jobs programados correctamente');
};

module.exports = { startCronJobs };
