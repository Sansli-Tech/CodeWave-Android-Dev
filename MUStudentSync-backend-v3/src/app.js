const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const { ApiError } = require('./errors');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);   // behind an HTTPS reverse proxy
app.disable('x-powered-by');
app.use(helmet());

// HTTPS is required for the remote backend (TLS is normally terminated by the host/proxy).
app.use((req, res, next) => {
  if (config.requireHttps && !req.secure && req.path !== '/health') {
    return res.status(426).json(new ApiError(426, 'HTTPS_REQUIRED', 'Use HTTPS.').toBody());
  }
  next();
});

app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/me', require('./routes/me'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api', require('./routes/reference'));
app.use('/api', require('./routes/lecturer'));

app.use((req, res) => res.status(404).json(new ApiError(404, 'NOT_FOUND', 'Route not found.').toBody()));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ApiError) return res.status(err.status).json(err.toBody());
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(new ApiError(400, 'BAD_JSON', 'Request body is not valid JSON.').toBody());
  }
  console.error(err);   // details stay in the server log, never in the response
  res.status(500).json(new ApiError(500, 'SERVER_ERROR', 'Something went wrong on the server.').toBody());
});

module.exports = app;
