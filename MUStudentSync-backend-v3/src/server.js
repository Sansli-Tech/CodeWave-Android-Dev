const config = require('./config');
const app = require('./app');

app.listen(config.port, () => {
  console.log(`StudentSync API listening on port ${config.port}`);
});
