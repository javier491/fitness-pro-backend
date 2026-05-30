require('./setup');
const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/app');
const Coach = require('../src/models/Coach');
const Client = require('../src/models/Client');

// Silence email/firebase calls in tests
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

const coachPayload = { name: 'Coach Test', email: 'coach@test.com', password: 'secret123' };
const clientPayload = { name: 'Client Test', email: 'client@test.com', password: 'secret123' };

describe('Auth — Coach', () => {
  test('POST /api/auth/register/coach → 201 + token', async () => {
    const res = await request(app).post('/api/auth/register/coach').send(coachPayload);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.role).toBe('coach');
    expect(res.body.user.password).toBeUndefined();
  });

  test('POST /api/auth/register/coach → 400 on duplicate email', async () => {
    await Coach.create(coachPayload);
    const res = await request(app).post('/api/auth/register/coach').send(coachPayload);
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/register/coach → 400 on invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register/coach')
      .send({ name: 'X', email: 'not-an-email', password: 'secret123' });
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/register/coach → 400 on short password', async () => {
    const res = await request(app)
      .post('/api/auth/register/coach')
      .send({ name: 'X', email: 'x@test.com', password: '123' });
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/login/coach → 200 + token', async () => {
    await request(app).post('/api/auth/register/coach').send(coachPayload);
    const res = await request(app)
      .post('/api/auth/login/coach')
      .send({ email: coachPayload.email, password: coachPayload.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.role).toBe('coach');
  });

  test('POST /api/auth/login/coach → 401 on wrong password', async () => {
    await request(app).post('/api/auth/register/coach').send(coachPayload);
    const res = await request(app)
      .post('/api/auth/login/coach')
      .send({ email: coachPayload.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('POST /api/auth/login/coach → 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login/coach')
      .send({ email: 'nobody@test.com', password: 'secret123' });
    expect(res.status).toBe(401);
  });
});

describe('Auth — Client', () => {
  let coachToken;

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register/coach').send(coachPayload);
    coachToken = res.body.token;
    await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${coachToken}`)
      .send(clientPayload);
  });

  test('POST /api/auth/login/client → 200 + token', async () => {
    const res = await request(app)
      .post('/api/auth/login/client')
      .send({ email: clientPayload.email, password: clientPayload.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.role).toBe('client');
  });

  test('POST /api/auth/login/client → 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login/client')
      .send({ email: clientPayload.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });
});

describe('Auth — GET /me', () => {
  test('returns user when authenticated as coach', async () => {
    const reg = await request(app).post('/api/auth/register/coach').send(coachPayload);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('coach');
    expect(res.body.user.email).toBe(coachPayload.email);
  });

  test('returns 401 when no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer badtoken');
    expect(res.status).toBe(401);
  });
});

describe('Auth — Change Password', () => {
  let token;

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register/coach').send(coachPayload);
    token = res.body.token;
  });

  test('PUT /api/auth/change-password → 200 on valid request', async () => {
    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: coachPayload.password, newPassword: 'newpass456' });
    expect(res.status).toBe(200);
  });

  test('PUT /api/auth/change-password → 400 on wrong current password', async () => {
    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrongpass', newPassword: 'newpass456' });
    expect(res.status).toBe(400);
  });

  test('PUT /api/auth/change-password → 400 on short new password', async () => {
    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: coachPayload.password, newPassword: '123' });
    expect(res.status).toBe(400);
  });
});

describe('Auth — Forgot / Reset Password', () => {
  test('POST /api/auth/forgot-password/coach → always 200', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password/coach')
      .send({ email: 'nobody@nowhere.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
  });

  test('POST /api/auth/reset-password/:token → 400 on invalid token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password/invalidtoken123')
      .send({ role: 'coach', password: 'newpassword123' });
    expect(res.status).toBe(400);
  });

  test('reset password flow succeeds with valid token', async () => {
    await request(app).post('/api/auth/register/coach').send(coachPayload);
    const coach = await Coach.findOne({ email: coachPayload.email });
    const plainToken = coach.createPasswordResetToken();
    await coach.save({ validateBeforeSave: false });

    const resetRes = await request(app)
      .post(`/api/auth/reset-password/${plainToken}`)
      .send({ role: 'coach', password: 'resetnewpass' });
    expect(resetRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/auth/login/coach')
      .send({ email: coachPayload.email, password: 'resetnewpass' });
    expect(loginRes.status).toBe(200);
  });
});
