// src/models/initDb.js
// Roda uma vez para criar as tabelas: node src/models/initDb.js

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const config   = require('../config/config');

const dbDir = path.dirname(config.database.sqlitePath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(config.database.sqlitePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- Usuários
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    nome        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    senha_hash  TEXT NOT NULL,
    role        TEXT DEFAULT 'user',     -- 'user' ou 'admin'
    criado_em   TEXT DEFAULT (datetime('now'))
  );

  -- Rifas (pode ter mais de uma ativa no futuro)
  CREATE TABLE IF NOT EXISTS rifas (
    id              TEXT PRIMARY KEY,
    nome            TEXT NOT NULL,
    descricao       TEXT,
    premio          TEXT NOT NULL,
    preco_bilhete   REAL NOT NULL,
    total_bilhetes  INTEGER NOT NULL,
    bilhetes_vendidos INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'aberta',  -- 'aberta' | 'encerrada' | 'sorteada'
    numero_sorteado INTEGER,
    ganhador_id     TEXT REFERENCES users(id),
    criado_em       TEXT DEFAULT (datetime('now')),
    sorteado_em     TEXT
  );

  -- Bilhetes
  CREATE TABLE IF NOT EXISTS bilhetes (
    id          TEXT PRIMARY KEY,
    numero      INTEGER NOT NULL,
    rifa_id     TEXT NOT NULL REFERENCES rifas(id),
    user_id     TEXT REFERENCES users(id),
    status      TEXT DEFAULT 'disponivel', -- 'disponivel' | 'reservado' | 'pago'
    reservado_em TEXT,
    pago_em     TEXT
  );

  -- Pagamentos
  CREATE TABLE IF NOT EXISTS pagamentos (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    rifa_id         TEXT NOT NULL REFERENCES rifas(id),
    quantidade      INTEGER NOT NULL,
    valor_total     REAL NOT NULL,
    status          TEXT DEFAULT 'pendente', -- 'pendente' | 'pago' | 'expirado'
    provedor        TEXT,           -- 'mercadopago' | 'asaas'
    provedor_id     TEXT,           -- ID do pagamento no PSP
    qrcode_texto    TEXT,           -- Pix copia-e-cola
    qrcode_imagem   TEXT,           -- base64 do QR
    criado_em       TEXT DEFAULT (datetime('now')),
    pago_em         TEXT
  );

  -- Refresh tokens
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    expira_em   TEXT NOT NULL,
    criado_em   TEXT DEFAULT (datetime('now'))
  );

  -- Auditoria
  CREATE TABLE IF NOT EXISTS auditoria (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   TEXT,
    acao      TEXT NOT NULL,
    detalhes  TEXT,
    ip        TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
  );
`);

// Cria a rifa inicial com base no config
const { v4: uuidv4 } = require('uuid');
const config2 = require('../config/config');
const rifaExistente = db.prepare('SELECT id FROM rifas LIMIT 1').get();
if (!rifaExistente) {
  const rifaId = uuidv4();
  db.prepare(`
    INSERT INTO rifas (id, nome, descricao, premio, preco_bilhete, total_bilhetes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    rifaId,
    config2.rifa.nomeSite,
    config2.rifa.descricao,
    config2.rifa.premioDescricao,
    config2.rifa.precoPorBilhete,
    config2.rifa.totalBilhetes
  );

  // Gera todos os bilhetes disponíveis
  const insertBilhete = db.prepare(
    'INSERT INTO bilhetes (id, numero, rifa_id, status) VALUES (?, ?, ?, ?)'
  );
  const insertMany = db.transaction(() => {
    for (let i = 1; i <= config2.rifa.totalBilhetes; i++) {
      insertBilhete.run(uuidv4(), i, rifaId, 'disponivel');
    }
  });
  insertMany();
  console.log(`✅ Rifa criada com ${config2.rifa.totalBilhetes} bilhetes.`);
}

// Cria admin padrão (troque a senha depois!)
const bcrypt = require('bcryptjs');
const adminExistente = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!adminExistente) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (id, nome, email, senha_hash, role)
    VALUES (?, 'Administrador', 'admin@rifatibia.com', ?, 'admin')
  `).run(uuidv4(), hash);
  console.log('✅ Admin criado — e-mail: admin@rifatibia.com | senha: admin123');
  console.log('⚠️  TROQUE A SENHA DO ADMIN ANTES DE COLOCAR ONLINE!');
}

db.close();
console.log('✅ Banco de dados inicializado com sucesso.');
module.exports = db;
