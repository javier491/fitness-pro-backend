const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const mongoose = require('mongoose');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter, authLimiter } = require('./middleware/rateLimit');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('No permitido por CORS'));
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // preflight para todos los endpoints
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(apiLimiter);

// Archivos estáticos (imágenes subidas)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/coaches', require('./routes/coaches'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/exercises', require('./routes/exercises'));
app.use('/api/routines', require('./routes/routines'));
app.use('/api/checkins', require('./routes/checkins'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => {
  const dbState = ['desconectado', 'conectado', 'conectando', 'desconectando'];
  res.json({
    status: 'ok',
    version: '1.0.0',
    db: dbState[mongoose.connection.readyState] || 'desconocido',
    uptime: Math.floor(process.uptime()),
  });
});

const START_TIME = Date.now();

app.get('/', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbOk = dbState === 1;
  const upSec = Math.floor((Date.now() - START_TIME) / 1000);
  const h = Math.floor(upSec / 3600);
  const m = Math.floor((upSec % 3600) / 60);
  const s = upSec % 60;
  const uptime = `${h}h ${m}m ${s}s`;

  const endpoints = [
    { method: 'POST', path: '/api/auth/register/coach', desc: 'Registrar coach' },
    { method: 'POST', path: '/api/auth/login/coach',    desc: 'Login coach' },
    { method: 'POST', path: '/api/auth/login/client',   desc: 'Login cliente' },
    { method: 'GET',  path: '/api/auth/me',             desc: 'Perfil actual' },
    { method: 'GET',  path: '/api/clients',             desc: 'Listar clientes' },
    { method: 'POST', path: '/api/clients',             desc: 'Crear cliente' },
    { method: 'GET',  path: '/api/clients/:id',         desc: 'Detalle cliente' },
    { method: 'GET',  path: '/api/exercises',           desc: 'Listar ejercicios' },
    { method: 'GET',  path: '/api/routines/today',      desc: 'Rutina de hoy (cliente)' },
    { method: 'POST', path: '/api/routines/assign',     desc: 'Asignar rutina' },
    { method: 'POST', path: '/api/checkins',            desc: 'Registrar check-in' },
    { method: 'GET',  path: '/api/progress/my',         desc: 'Progreso cliente' },
    { method: 'GET',  path: '/api/admin/stats',         desc: 'Estadísticas admin' },
    { method: 'POST', path: '/api/admin/exercises/sync',desc: 'Sync ejercicios' },
  ];

  const methodColor = { GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b', DELETE: '#ef4444', PATCH: '#a855f7' };

  const rows = endpoints.map(e => `
    <tr>
      <td><span class="badge" style="background:${methodColor[e.method] ?? '#6b7280'}20;color:${methodColor[e.method] ?? '#6b7280'}">${e.method}</span></td>
      <td class="path">${e.path}</td>
      <td class="desc">${e.desc}</td>
    </tr>`).join('');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FitCoach API</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a14;color:#e2e8f0;min-height:100vh;padding:40px 24px}
  .container{max-width:860px;margin:0 auto}
  .header{display:flex;align-items:center;gap:16px;margin-bottom:36px}
  .logo{width:48px;height:48px;background:#f97316;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0}
  .header h1{font-size:26px;font-weight:800;color:#fff}
  .header p{font-size:13px;color:#64748b;margin-top:2px}
  .pill{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600}
  .pill.ok{background:rgba(34,197,94,.12);color:#22c55e;border:1px solid rgba(34,197,94,.25)}
  .pill.err{background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.25)}
  .dot{width:7px;height:7px;border-radius:50%}
  .dot.ok{background:#22c55e;box-shadow:0 0 6px #22c55e}
  .dot.err{background:#ef4444}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:28px}
  .card{background:#12121f;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:18px 20px}
  .card .label{font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
  .card .value{font-size:22px;font-weight:700;color:#f1f5f9}
  .card .sub{font-size:12px;color:#475569;margin-top:2px}
  .section{margin-bottom:28px}
  .section h2{font-size:14px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}
  tr{border-bottom:1px solid rgba(255,255,255,.05)}
  tr:last-child{border-bottom:none}
  td{padding:10px 12px;font-size:13px;vertical-align:middle}
  .badge{padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;font-family:monospace}
  .path{font-family:monospace;color:#c4b5fd;font-size:13px}
  .desc{color:#64748b}
  .status-row{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:28px}
  footer{margin-top:40px;text-align:center;font-size:12px;color:#334155}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">⚡</div>
    <div>
      <h1>FitCoach API</h1>
      <p>v1.0.0 &nbsp;·&nbsp; Node.js + MongoDB</p>
    </div>
  </div>

  <div class="status-row">
    <span class="pill ok"><span class="dot ok"></span> Servidor activo</span>
    <span class="pill ${dbOk ? 'ok' : 'err'}"><span class="dot ${dbOk ? 'ok' : 'err'}"></span> Base de datos ${dbOk ? 'conectada' : 'desconectada'}</span>
  </div>

  <div class="cards">
    <div class="card">
      <div class="label">Entorno</div>
      <div class="value">${process.env.NODE_ENV || 'development'}</div>
      <div class="sub">Puerto ${process.env.PORT || 4000}</div>
    </div>
    <div class="card">
      <div class="label">Uptime</div>
      <div class="value">${uptime}</div>
      <div class="sub">desde el inicio</div>
    </div>
    <div class="card">
      <div class="label">Memoria</div>
      <div class="value">${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB</div>
      <div class="sub">heap usado</div>
    </div>
    <div class="card">
      <div class="label">Node.js</div>
      <div class="value" style="font-size:16px">${process.version}</div>
      <div class="sub">runtime</div>
    </div>
  </div>

  <div class="section">
    <h2>Endpoints disponibles</h2>
    <div style="background:#12121f;border:1px solid rgba(255,255,255,.07);border-radius:14px;overflow:hidden">
      <table>${rows}</table>
    </div>
  </div>

  <footer>FitCoach Pro &nbsp;·&nbsp; API Health Page &nbsp;·&nbsp; ${new Date().toLocaleString('es-MX')}</footer>
</div>
</body>
</html>`);
});

app.use(errorHandler);

module.exports = app;
