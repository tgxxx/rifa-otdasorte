// src/routes/admin.js
const express = require('express');
const db      = require('../models/db');
const { apenasAdmin } = require('../middleware/auth');
const { obterNumeroSorteio } = require('../services/sorteio');
const router  = express.Router();

// Todas as rotas aqui exigem role = 'admin'

// GET /api/admin/dashboard
router.get('/dashboard', apenasAdmin, (req, res) => {
  const rifa      = db.prepare("SELECT * FROM rifas ORDER BY criado_em DESC LIMIT 1").get();
  const usuarios  = db.prepare('SELECT COUNT(*) as total FROM users').get().total;
  const pagos     = db.prepare("SELECT COUNT(*) as total, SUM(valor_total) as receita FROM pagamentos WHERE status = 'pago'").get();
  const pendentes = db.prepare("SELECT COUNT(*) as total FROM pagamentos WHERE status = 'pendente'").get().total;

  res.json({ rifa, usuarios, pagamentos_confirmados: pagos.total, receita_total: pagos.receita, pagamentos_pendentes: pendentes });
});

// GET /api/admin/pagamentos
router.get('/pagamentos', apenasAdmin, (req, res) => {
  const lista = db.prepare(`
    SELECT p.*, u.nome, u.email
    FROM pagamentos p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.criado_em DESC
    LIMIT 100
  `).all();
  res.json(lista);
});

// GET /api/admin/bilhetes
router.get('/bilhetes', apenasAdmin, (req, res) => {
  const { rifa_id } = req.query;
  const bilhetes = db.prepare(`
    SELECT b.numero, b.status, b.pago_em, u.nome, u.email
    FROM bilhetes b
    LEFT JOIN users u ON b.user_id = u.id
    WHERE b.rifa_id = ?
    ORDER BY b.numero
  `).all(rifa_id);
  res.json(bilhetes);
});

// POST /api/admin/sortear
// Executa o sorteio via Loteria Federal e registra o ganhador
router.post('/sortear', apenasAdmin, async (req, res) => {
  const { rifa_id } = req.body;
  const rifa = db.prepare("SELECT * FROM rifas WHERE id = ? AND status IN ('encerrada','aberta')").get(rifa_id);
  if (!rifa) return res.status(404).json({ erro: 'Rifa não encontrada.' });
  if (rifa.status === 'sorteada') return res.status(400).json({ erro: 'Rifa já foi sorteada.' });

  try {
    const resultado = await obterNumeroSorteio(rifa.total_bilhetes);

    // Encontra o bilhete ganhador
    const bilhete = db.prepare(
      "SELECT * FROM bilhetes WHERE rifa_id = ? AND numero = ? AND status = 'pago'"
    ).get(rifa.id, resultado.numero);

    const ganhadorId = bilhete?.user_id || null;

    db.prepare(`
      UPDATE rifas SET status = 'sorteada', numero_sorteado = ?, ganhador_id = ?, sorteado_em = ?
      WHERE id = ?
    `).run(resultado.numero, ganhadorId, new Date().toISOString(), rifa.id);

    // Log de auditoria
    db.prepare(`
      INSERT INTO auditoria (user_id, acao, detalhes)
      VALUES (?, 'SORTEIO', ?)
    `).run(req.user.userId, JSON.stringify(resultado));

    const ganhador = ganhadorId
      ? db.prepare('SELECT nome, email FROM users WHERE id = ?').get(ganhadorId)
      : null;

    res.json({
      numero_sorteado: resultado.numero,
      fonte:           resultado.fonte,
      concurso:        resultado.concurso,
      data_apuracao:   resultado.data,
      calculo:         resultado.calculo,
      ganhador:        ganhador || 'Bilhete não vendido (sem ganhador)',
    });
  } catch (err) {
    console.error('Erro no sorteio:', err.message);
    res.status(500).json({ erro: 'Falha ao consultar API da Loteria. Tente novamente.' });
  }
});

// POST /api/admin/nova-rifa — cria uma nova rifa após encerrar a anterior
router.post('/nova-rifa', apenasAdmin, (req, res) => {
  const { nome, descricao, premio, preco_bilhete, total_bilhetes } = req.body;
  if (!nome || !premio || !preco_bilhete || !total_bilhetes)
    return res.status(400).json({ erro: 'Campos obrigatórios faltando.' });

  const { v4: uuidv4 } = require('uuid');
  const rifaId = uuidv4();

  db.prepare(`
    INSERT INTO rifas (id, nome, descricao, premio, preco_bilhete, total_bilhetes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(rifaId, nome, descricao || '', premio, preco_bilhete, total_bilhetes);

  const insertBilhete = db.prepare(
    'INSERT INTO bilhetes (id, numero, rifa_id, status) VALUES (?, ?, ?, ?)'
  );
  const criar = db.transaction(() => {
    for (let i = 1; i <= total_bilhetes; i++) {
      insertBilhete.run(uuidv4(), i, rifaId, 'disponivel');
    }
  });
  criar();

  res.status(201).json({ rifaId, mensagem: `Nova rifa criada com ${total_bilhetes} bilhetes.` });
});

module.exports = router;
