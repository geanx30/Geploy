const express = require('express');
const db = require('../db');
const {
  verifyPassword,
  hashPassword,
  signToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} = require('../auth');

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    must_change_password: Boolean(user.must_change_password),
  };
}

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario e senha sao obrigatorios' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuario ou senha invalidos' });
  }

  const token = signToken(user);
  setSessionCookie(res, token);
  res.json(toPublicUser(user));
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!user) return res.status(401).json({ error: 'Usuario nao encontrado' });
  res.json(toPublicUser(user));
});

router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Senha atual e nova senha sao obrigatorias' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta' });
  }

  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    hashPassword(newPassword),
    user.id
  );
  res.json(toPublicUser({ ...user, must_change_password: 0 }));
});

module.exports = router;
