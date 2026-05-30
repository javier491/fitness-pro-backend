const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Called at the top of each test file: require('./setup')
// Registers beforeAll/afterAll/afterEach hooks for that test suite.

beforeAll(async () => {
  const tmpFile = path.join(__dirname, '.mongo-uri.tmp');
  const uri = process.env.MONGO_URI_TEST || fs.readFileSync(tmpFile, 'utf8');

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-fitcoach';
  process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
});
