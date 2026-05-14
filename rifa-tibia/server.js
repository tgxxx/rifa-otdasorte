// server.js — ponto de entrada da aplicação
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const config     = require('./src/config/config');

const app = express();

// ─── SEGURANÇA ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.server.baseUrl, credentials: true }));

// Rate limiting global
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// Rate limiting extra no login (evita brute force)
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { erro: 'Muitas tentativas. Aguarde 15 minutos.' } });
app.use('/api/auth/login', loginLimit);

// ─── PARSERS ─────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── ROTAS DA API ────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./src/routes/auth'));
app.use('/api/rifa',      require('./src/routes/rifa'));
app.use('/api/pagamento', require('./src/routes/pagamento'));
app.use('/api/admin',     require('./src/routes/admin'));

// ─── FRONTEND ESTÁTICO ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'frontend')));

// SPA fallback — todas as rotas não-API servem o index.html
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
  }
});

// ─── START ───────────────────────────────────────────────────────────────────
app.listen(config.server.port, () => {
  console.log(`✅ Servidor rodando em http://localhost:${config.server.port}`);
  console.log(`🎯 Ambiente: ${config.server.env}`);
  console.log(`💡 Edite src/config/config.js para configurar o site.`);
});
