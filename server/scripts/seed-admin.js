require('dotenv').config();
const db = require('../src/db');
const { hashPassword } = require('../src/auth');

const username = process.env.SEED_ADMIN_USERNAME;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!username || !password) {
  console.error('Defina SEED_ADMIN_USERNAME e SEED_ADMIN_PASSWORD no .env antes de rodar este script.');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  db.prepare('UPDATE users SET password_hash = ?, role = ? WHERE id = ?').run(
    hashPassword(password),
    'admin',
    existing.id
  );
  console.log(`Admin "${username}" atualizado.`);
} else {
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
    username,
    hashPassword(password),
    'admin'
  );
  console.log(`Admin "${username}" criado.`);
}
