const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // Persist instance so globalTeardown can stop it
  global.__MONGOD__ = mongod;

  // Write URI to a temp file so test workers can read it
  const tmpFile = path.join(__dirname, '.mongo-uri.tmp');
  fs.writeFileSync(tmpFile, uri);

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key-fitcoach';
  process.env.JWT_EXPIRE = '1d';
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  process.env.MONGO_URI_TEST = uri;
};
