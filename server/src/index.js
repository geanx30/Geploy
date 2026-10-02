require('dotenv').config();
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

require('./db'); // garante que as tabelas existem antes de subir rotas

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET nao definido. Configure o arquivo .env (veja .env.example).');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/systems', require('./routes/systems'));
app.use('/api/admin', require('./routes/admin'));

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status < 500 ? err.message : 'Erro interno' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Geploy server rodando na porta ${port}`));

require('./services/healthMonitor').startHealthMonitor();
