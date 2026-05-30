require('./setup');
const request = require('supertest');
const app = require('../src/app');

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

const coachPayload = { name: 'Coach', email: 'coach@clients.com', password: 'secret123' };

const makeClient = (n = 1) => ({
  name: `Client ${n}`,
  email: `client${n}@test.com`,
  password: 'clientpass',
  phone: '5551234567',
});

let coachToken;

beforeEach(async () => {
  const res = await request(app).post('/api/auth/register/coach').send(coachPayload);
  coachToken = res.body.token;
});

describe('Clients CRUD', () => {
  test('GET /api/clients → empty list for new coach', async () => {
    const res = await request(app)
      .get('/api/clients')
      .set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  test('POST /api/clients → 201 creates client', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${coachToken}`)
      .send(makeClient(1));
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('client1@test.com');
    expect(res.body.password).toBeUndefined();
  });

  test('POST /api/clients → creates initial body metric when provided', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ ...makeClient(2), initialMetrics: { weight: 80, height: 175 } });
    expect(res.status).toBe(201);

    const clientId = res.body._id;
    const metricsRes = await request(app)
      .get(`/api/clients/${clientId}/metrics`)
      .set('Authorization', `Bearer ${coachToken}`);
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.body.data).toHaveLength(1);
    expect(metricsRes.body.data[0].weight).toBe(80);
  });

  test('GET /api/clients/:id → returns client detail', async () => {
    const created = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${coachToken}`)
      .send(makeClient(3));
    const id = created.body._id;

    const res = await request(app)
      .get(`/api/clients/${id}`)
      .set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.client._id).toBe(id);
    expect(res.body.metrics).toBeDefined();
  });

  test('GET /api/clients/:id → 404 for other coach client', async () => {
    const otherCoach = await request(app)
      .post('/api/auth/register/coach')
      .send({ name: 'Other', email: 'other@coach.com', password: 'secret123' });
    const otherToken = otherCoach.body.token;

    const created = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${otherToken}`)
      .send(makeClient(4));
    const id = created.body._id;

    const res = await request(app)
      .get(`/api/clients/${id}`)
      .set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(404);
  });

  test('PUT /api/clients/:id → updates client', async () => {
    const created = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${coachToken}`)
      .send(makeClient(5));
    const id = created.body._id;

    const res = await request(app)
      .put(`/api/clients/${id}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Updated Name', goal: 'Perder peso' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
    expect(res.body.goal).toBe('Perder peso');
  });

  test('DELETE /api/clients/:id → deactivates client (soft delete)', async () => {
    const created = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${coachToken}`)
      .send(makeClient(6));
    const id = created.body._id;

    const res = await request(app)
      .delete(`/api/clients/${id}`)
      .set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);

    const detail = await request(app)
      .get(`/api/clients/${id}`)
      .set('Authorization', `Bearer ${coachToken}`);
    expect(detail.body.client.isActive).toBe(false);
  });
});

describe('Clients — Pagination', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${coachToken}`)
        .send(makeClient(i));
    }
  });

  test('returns paginated list with total and totalPages', async () => {
    const res = await request(app)
      .get('/api/clients?page=1&limit=3')
      .set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.total).toBe(5);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.page).toBe(1);
  });

  test('second page returns remaining clients', async () => {
    const res = await request(app)
      .get('/api/clients?page=2&limit=3')
      .set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.page).toBe(2);
  });

  test('search by name filters results', async () => {
    const res = await request(app)
      .get('/api/clients?search=Client 1')
      .set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Client 1');
  });
});

describe('Clients — Metrics', () => {
  let clientId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${coachToken}`)
      .send(makeClient(99));
    clientId = res.body._id;
  });

  test('POST /api/clients/:id/metrics → 201', async () => {
    const res = await request(app)
      .post(`/api/clients/${clientId}/metrics`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ weight: 75.5, bodyFat: 18.2, waist: 85 });
    expect(res.status).toBe(201);
    expect(res.body.weight).toBe(75.5);
    expect(res.body.recordedBy).toBe('coach');
  });

  test('GET /api/clients/:id/metrics → paginated metrics list', async () => {
    await request(app)
      .post(`/api/clients/${clientId}/metrics`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ weight: 75 });
    await request(app)
      .post(`/api/clients/${clientId}/metrics`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ weight: 74.5 });

    const res = await request(app)
      .get(`/api/clients/${clientId}/metrics`)
      .set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });
});

describe('Clients — Auth guard', () => {
  test('GET /api/clients → 401 without token', async () => {
    const res = await request(app).get('/api/clients');
    expect(res.status).toBe(401);
  });

  test('POST /api/clients → 403 when authenticated as client', async () => {
    await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${coachToken}`)
      .send(makeClient(7));

    const clientLogin = await request(app)
      .post('/api/auth/login/client')
      .send({ email: 'client7@test.com', password: 'clientpass' });
    const clientToken = clientLogin.body.token;

    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${clientToken}`)
      .send(makeClient(8));
    expect(res.status).toBe(403);
  });
});
