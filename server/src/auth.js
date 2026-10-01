const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const COOKIE_NAME = 'geploy_session';
const TOKEN_TTL = '12h';

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 12);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Nao autenticado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sessao invalida ou expirada' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
}

/**
 * Bloqueia qualquer rota protegida enquanto o usuario tiver uma troca de
 * senha pendente (primeiro login, ou apos o admin resetar a senha dele).
 * As rotas de auth (me/change-password/logout) nao usam este middleware.
 */
function requirePasswordChanged(req, res, next) {
  const row = db.prepare('SELECT must_change_password FROM users WHERE id = ?').get(req.user.sub);
  if (row?.must_change_password) {
    return res.status(403).json({ error: 'Troca de senha obrigatoria', code: 'password_change_required' });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  signToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireAdmin,
  requirePasswordChanged,
};
