// src/middleware/auth.js
const jwt    = require('jsonwebtoken');
const config = require('../config/config');

function autenticar(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token não fornecido.' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

function apenasAdmin(req, res, next) {
  autenticar(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ erro: 'Acesso restrito a administradores.' });
    }
    next();
  });
}

module.exports = { autenticar, apenasAdmin };
