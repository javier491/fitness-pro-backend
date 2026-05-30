const fs = require('fs');
const path = require('path');

module.exports = async () => {
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
  }
  const tmpFile = path.join(__dirname, '.mongo-uri.tmp');
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
};
