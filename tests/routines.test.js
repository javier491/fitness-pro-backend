require('./setup');
const request = require('supertest');
const app = require('../src/app');
const ClientRoutine = require('../src/models/ClientRoutine');

jest.mock('../src/config/email', () => ({
  sendWelcomeCoach: jest.fn().mockResolvedValue(true),
  sendWelcomeClient: jest.fn().mockResolvedValue(true),
  sendPasswordReset: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/config/firebase', () => ({}));
jest.mock('../src/services/fcm', () => ({
  sendPush: jest.fn(),
  sendRoutineReminder: jest.fn(),
  sendCheckInAlert: jest.fn(),
}));
jest.mock('../src/services/cron', () => ({ startCronJobs: jest.fn() }));

const coachCreds = { name: 'Coach', email: 'coach@routines.com', password: 'secret123' };
const clientCreds = { name: 'Client', email: 'client@routines.com', password: 'clientpass' };

let coachToken, clientToken, clientId;

const sampleDay = {
  dayNumber: 1,
  name: 'Día 1 — Pecho',
  exercises: [],
  isRestDay: false,
};

const sampleRoutine = {
  name: 'Rutina de prueba',
  frequency: 'weekly',
  totalDays: 3,
  days: [
    { dayNumber: 1, name: 'Día 1', exercises: [], isRestDay: false },
    { dayNumber: 2, name: 'Descanso', exercises: [], isRestDay: true },
    { dayNumber: 3, name: 'Día 3', exercises: [], isRestDay: false },
  ],
};

beforeEach(async () => {
  const coachRes = await request(app).post('/api/auth/register/coach').send(coachCreds);
  coachToken = coachRes.body.token;

  const clientRes = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${coachToken}`)
    .send(clientCreds);
  clientId = clientRes.body._id;

  const loginRes = await request(app)
    .post('/api/auth/login/client')
    .send({ email: clientCreds.email, password: clientCreds.password });
  clientToken = loginRes.body.token;
});

describe('Routine Templates', () => {
  test('GET /api/routines/templates → empty list for new coach', async () => {
    const res = await request(app)
      .get('/api/routines/templates')
      .set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('POST /api/routines/templates → 201 creates template', async () => {
    const res = await request(app)
      .post('/api/routines/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Full Body 3 días', frequency: 'weekly', totalDays: 3, days: [sampleDay] });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Full Body 3 días');
    expect(res.body.coach).toBeDefined();
  });

  test('GET /api/routines/templates → returns created templates', async () => {
    await request(app)
      .post('/api/routines/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Template A', frequency: 'weekly', totalDays: 1, days: [sampleDay] });
    await request(app)
      .post('/api/routines/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Template B', frequency: 'weekly', totalDays: 1, days: [sampleDay] });

    const res = await request(app)
      .get('/api/routines/templates')
      .set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('PUT /api/routines/templates/:id → updates template', async () => {
    const created = await request(app)
      .post('/api/routines/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Old Name', frequency: 'weekly', totalDays: 1, days: [sampleDay] });
    const id = created.body._id;

    const res = await request(app)
      .put(`/api/routines/templates/${id}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  test('DELETE /api/routines/templates/:id → soft deletes template', async () => {
    const created = await request(app)
      .post('/api/routines/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'To Delete', frequency: 'weekly', totalDays: 1, days: [sampleDay] });
    const id = created.body._id;

    const del = await request(app)
      .delete(`/api/routines/templates/${id}`)
      .set('Authorization', `Bearer ${coachToken}`);
    expect(del.status).toBe(200);

    const list = await request(app)
      .get('/api/routines/templates')
      .set('Authorization', `Bearer ${coachToken}`);
    expect(list.body).toHaveLength(0);
  });

  test('GET /api/routines/templates → 403 when client tries to access', async () => {
    const res = await request(app)
      .get('/api/routines/templates')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Routine Assign', () => {
  test('POST /api/routines/assign → 201 assigns routine to client', async () => {
    const res = await request(app)
      .post('/api/routines/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ ...sampleRoutine, clientId, startDate: new Date() });
    expect(res.status).toBe(201);
    expect(res.body.client).toBe(clientId);
    expect(res.body.isActive).toBe(true);
    expect(res.body.days).toHaveLength(3);
  });

  test('POST /api/routines/assign → new assignment deactivates old one', async () => {
    const startDate = new Date();
    await request(app)
      .post('/api/routines/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ ...sampleRoutine, name: 'Routine 1', clientId, startDate });

    await request(app)
      .post('/api/routines/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ ...sampleRoutine, name: 'Routine 2', clientId, startDate });

    const allRoutines = await ClientRoutine.find({ client: clientId });
    expect(allRoutines).toHaveLength(2);
    const active = allRoutines.filter(r => r.isActive);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Routine 2');
  });

  test('POST /api/routines/assign from template → uses template days', async () => {
    const tpl = await request(app)
      .post('/api/routines/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Plantilla Base', frequency: 'weekly', totalDays: 3, days: sampleRoutine.days });
    const templateId = tpl.body._id;

    const res = await request(app)
      .post('/api/routines/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'From Template', clientId, templateId, startDate: new Date() });
    expect(res.status).toBe(201);
    expect(res.body.fromTemplate).toBe(templateId);
    expect(res.body.days).toHaveLength(3);
  });

  test('POST /api/routines/assign → 404 for unknown client', async () => {
    const fakeId = '6578a2b3c4d5e6f7a8b9c0d1';
    const res = await request(app)
      .post('/api/routines/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ ...sampleRoutine, clientId: fakeId, startDate: new Date() });
    expect(res.status).toBe(404);
  });
});

describe('Today Routine — Client', () => {
  test("GET /api/routines/today → 404 when client has no routine", async () => {
    const res = await request(app)
      .get('/api/routines/today')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(404);
  });

  test('GET /api/routines/today → returns todayDay and completed status', async () => {
    await request(app)
      .post('/api/routines/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ ...sampleRoutine, clientId, startDate: new Date() });

    const res = await request(app)
      .get('/api/routines/today')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.routine).toBeDefined();
    expect(res.body.todayDay).toBeDefined();
    expect(res.body.completed).toBe(false);
  });

  test('GET /api/routines/today → 403 when coach tries to access', async () => {
    const res = await request(app)
      .get('/api/routines/today')
      .set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/routines/client/:clientId → returns client routines for coach', async () => {
    await request(app)
      .post('/api/routines/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ ...sampleRoutine, clientId, startDate: new Date() });

    const res = await request(app)
      .get(`/api/routines/client/${clientId}`)
      .set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
