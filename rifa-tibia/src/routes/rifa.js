// src/routes/rifa.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db      = require('../models/db');
const config  = require('../config/config');
const { autenticar, apenasAdmin } = require('../middleware/auth');
const router  = express.Router();

// GET /api/rifa — info da rifa ativa
router.get('/', (req, res) => {
  const rifa = db.prepare("SELECT * FROM rifas WHERE status != 'encerrada' ORDER BY criado_em DESC LIMIT 1").get();
  if (!rifa) return res.status(404).json({ erro: 'Nenhuma rifa ativa.' });

  const disponiveis = db.prepare(
    "SELECT COUNT(*) as total FROM bilhetes WHERE rifa_id = ? AND status = 'disponivel'"
  ).get(rifa.id).total;

  res.json({ ...rifa, bilhetes_disponiveis: disponiveis });
});

// GET /api/rifa/meus-bilhetes — bilhetes do usuário logado
router.get('/meus-bilhetes', autenticar, (req, res) => {
  const bilhetes = db.prepare(`
    SELECT b.numero, b.status, b.pago_em, r.nome as rifa_nome
    FROM bilhetes b
    JOIN rifas r ON b.rifa_id = r.id
    WHERE b.user_id = ?
    ORDER BY b.numero
  `).all(req.user.userId);
  res.json(bilhetes);
});

// POST /api/rifa/reservar — reserva bilhetes antes do pagamento
router.post('/reservar', autenticar, (req, res) => {
  const { quantidade, rifa_id } = req.body;
  if (!quantidade || quantidade < 1)
    return res.status(400).json({ erro: 'Quantidade inválida.' });

  const max = config.rifa.maxBilhetesUsuario;
  if (max > 0) {
    const jaComprou = db.prepare(
      "SELECT COUNT(*) as total FROM bilhetes WHERE rifa_id = ? AND user_id = ? AND status = 'pago'"
    ).get(rifa_id || '', req.user.userId).total;
    if (jaComprou + quantidade > max)
      return res.status(400).json({ erro: `Máximo de ${max} bilhetes por usuário.` });
  }

  const rifa = db.prepare("SELECT * FROM rifas WHERE id = ? AND status = 'aberta'").get(rifa_id);
  if (!rifa) return res.status(404).json({ erro: 'Rifa não encontrada ou encerrada.' });

  const disponiveis = db.prepare(
    "SELECT * FROM bilhetes WHERE rifa_id = ? AND status = 'disponivel' LIMIT ?"
  ).all(rifa.id, quantidade);

  if (disponiveis.length < quantidade)
    return res.status(400).json({ erro: 'Bilhetes insuficientes disponíveis.' });

  // Reserva atomicamente
  const reservar = db.transaction(() => {
    const agora = new Date().toISOString();
    for (const b of disponiveis) {
      db.prepare(
        "UPDATE bilhetes SET status = 'reservado', user_id = ?, reservado_em = ? WHERE id = ? AND status = 'disponivel'"
      ).run(req.user.userId, agora, b.id);
    }
  });
  reservar();

  const numeros = disponiveis.map(b => b.numero);
  const total   = (quantidade * rifa.preco_bilhete).toFixed(2);

  res.json({
    numeros,
    quantidade,
    valor_total: parseFloat(total),
    rifa_id: rifa.id,
    mensagem: `${quantidade} bilhete(s) reservado(s). Finalize o pagamento Pix.`
  });
});

// POST /api/rifa/confirmar-pagamento — chamado pelo webhook do PSP
// ⚠️  Em produção, valide a assinatura do webhook do seu PSP!
router.post('/confirmar-pagamento', async (req, res) => {
  const { pagamento_id } = req.body;
  const pagamento = db.prepare("SELECT * FROM pagamentos WHERE id = ? AND status = 'pendente'").get(pagamento_id);
  if (!pagamento) return res.status(404).json({ erro: 'Pagamento não encontrado.' });

  const confirmar = db.transaction(() => {
    const agora = new Date().toISOString();
    db.prepare("UPDATE pagamentos SET status = 'pago', pago_em = ? WHERE id = ?")
      .run(agora, pagamento.id);
    db.prepare(
      "UPDATE bilhetes SET status = 'pago', pago_em = ? WHERE rifa_id = ? AND user_id = ? AND status = 'reservado'"
    ).run(agora, pagamento.rifa_id, pagamento.user_id);
    db.prepare("UPDATE rifas SET bilhetes_vendidos = bilhetes_vendidos + ? WHERE id = ?")
      .run(pagamento.quantidade, pagamento.rifa_id);
  });
  confirmar();

  // Verifica se atingiu o total e agenda sorteio
  const rifa = db.prepare('SELECT * FROM rifas WHERE id = ?').get(pagamento.rifa_id);
  if (rifa.bilhetes_vendidos >= rifa.total_bilhetes) {
    db.prepare("UPDATE rifas SET status = 'encerrada' WHERE id = ?").run(rifa.id);
    // O sorteio é disparado via rota admin /api/admin/sortear
  }

  res.json({ mensagem: 'Pagamento confirmado.' });
});

// GET /api/rifa/resultado — resultado público do sorteio
router.get('/resultado', (req, res) => {
  const rifa = db.prepare("SELECT * FROM rifas WHERE status = 'sorteada' ORDER BY sorteado_em DESC LIMIT 1").get();
  if (!rifa) return res.json({ sorteado: false });

  const ganhador = rifa.ganhador_id
    ? db.prepare('SELECT nome, email FROM users WHERE id = ?').get(rifa.ganhador_id)
    : null;

  res.json({
    sorteado: true,
    numero_sorteado: rifa.numero_sorteado,
    ganhador: ganhador ? { nome: ganhador.nome, email: ganhador.email.replace(/(.{2}).*(@.*)/, '$1***$2') } : null,
    sorteado_em: rifa.sorteado_em
  });
});

module.exports = router;
