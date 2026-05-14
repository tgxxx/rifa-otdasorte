// src/routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db      = require('../models/db');
const config  = require('../config/config');
const router  = express.Router();

// POST /api/auth/registro
router.post('/registro', (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha)
    return res.status(400).json({ erro: 'nome, email e senha são obrigatórios.' });
  if (senha.length < 6)
    return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres.' });

  const existente = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existente)
    return res.status(409).json({ erro: 'E-mail já cadastrado.' });

  const hash = bcrypt.hashSync(senha, 10);
  const id   = uuidv4();
  db.prepare('INSERT INTO users (id, nome, email, senha_hash) VALUES (?, ?, ?, ?)')
    .run(id, nome.trim(), email.toLowerCase(), hash);

  res.status(201).json({ mensagem: 'Conta criada com sucesso!' });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha)
    return res.status(400).json({ erro: 'E-mail e senha obrigatórios.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(senha, user.senha_hash))
    return res.status(401).json({ erro: 'Credenciais inválidas.' });

  const accessToken = jwt.sign(
    { userId: user.id, nome: user.nome, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
  const refreshToken = jwt.sign(
    { userId: user.id },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpires }
  );

  // Salva refresh token
  const expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO refresh_tokens (token, user_id, expira_em) VALUES (?, ?, ?)')
    .run(refreshToken, user.id, expira);

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, nome: user.nome, email: user.email, role: user.role }
  });
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ erro: 'Refresh token obrigatório.' });

  const salvo = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(refreshToken);
  if (!salvo || new Date(salvo.expira_em) < new Date())
    return res.status(401).json({ erro: 'Refresh token inválido ou expirado.' });

  try {
    const payload = jwt.verify(refreshToken, config.jwt.refreshSecret);
    const user    = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
    const novoToken = jwt.sign(
      { userId: user.id, nome: user.nome, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
    res.json({ accessToken: novoToken });
  } catch {
    res.status(401).json({ erro: 'Token inválido.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken)
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
  res.json({ mensagem: 'Logout realizado.' });
});

module.exports = router;
