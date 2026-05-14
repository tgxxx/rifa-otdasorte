// src/models/db.js — conexão reutilizável
const Database = require('better-sqlite3');
const config   = require('../config/config');
const path     = require('path');
const fs       = require('fs');

const dbDir = path.dirname(config.database.sqlitePath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(config.database.sqlitePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
