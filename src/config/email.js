const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const send = async (to, subject, html) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || '"FitCoach Pro" <noreply@fitcoach.pro>',
    to,
    subject,
    html,
  });
};

const sendPasswordReset = (to, name, token, role = 'coach') => {
  const url = `${process.env.FRONTEND_URL}/reset-password/${token}?role=${role}`;
  return send(to, 'Recuperar contraseña — FitCoach Pro', `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#1e1e2e;color:#fff;border-radius:12px;padding:32px">
      <h2 style="color:#f97316;margin-top:0">Recuperar contraseña</h2>
      <p>Hola <strong>${name}</strong>,</p>
      <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para continuar:</p>
      <a href="${url}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">
        Restablecer contraseña
      </a>
      <p style="color:rgba(255,255,255,0.5);font-size:13px">Este enlace expira en <strong>1 hora</strong>. Si no solicitaste esto, ignora este correo.</p>
      <hr style="border-color:rgba(255,255,255,0.1);margin:24px 0"/>
      <p style="color:rgba(255,255,255,0.3);font-size:12px">FitCoach Pro · México</p>
    </div>
  `);
};

const sendWelcomeCoach = (to, name) =>
  send(to, '¡Bienvenido a FitCoach Pro!', `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#1e1e2e;color:#fff;border-radius:12px;padding:32px">
      <h2 style="color:#f97316;margin-top:0">¡Bienvenido, ${name}! 💪</h2>
      <p>Tu cuenta de coach en <strong>FitCoach Pro</strong> fue creada exitosamente.</p>
      <p>Ya puedes:</p>
      <ul style="color:rgba(255,255,255,0.7)">
        <li>Dar de alta a tus clientes</li>
        <li>Crear plantillas de rutinas</li>
        <li>Asignar y dar seguimiento a rutinas</li>
        <li>Ver el progreso de cada cliente</li>
      </ul>
      <a href="${process.env.FRONTEND_URL}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">
        Ir al panel
      </a>
    </div>
  `);

const sendWelcomeClient = (to, name, email, password) =>
  send(to, '¡Tu cuenta está lista! — FitCoach Pro', `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#1e1e2e;color:#fff;border-radius:12px;padding:32px">
      <h2 style="color:#f97316;margin-top:0">¡Hola, ${name}! 🏋️</h2>
      <p>Tu coach te dio de alta en <strong>FitCoach Pro</strong>. Descarga la app y entra con estas credenciales:</p>
      <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:4px 0"><strong>Correo:</strong> ${email}</p>
        <p style="margin:4px 0"><strong>Contraseña temporal:</strong> ${password}</p>
      </div>
      <p style="color:rgba(255,255,255,0.5);font-size:13px">Te recomendamos cambiar tu contraseña después de iniciar sesión.</p>
    </div>
  `);

module.exports = { send, sendPasswordReset, sendWelcomeCoach, sendWelcomeClient };
