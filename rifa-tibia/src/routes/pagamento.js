// src/routes/pagamento.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db        = require('../models/db');
const config    = require('../config/config');
const { criarPix } = require('../services/pagamento');
const { autenticar } = require('../middleware/auth');
const router    = express.Router();

// POST /api/pagamento/gerar-pix
// Body: { rifa_id, quantidade }
router.post('/gerar-pix', autenticar, async (req, res) => {
  const { rifa_id, quantidade } = req.body;
  if (!rifa_id || !quantidade || quantidade < 1)
    return res.status(400).json({ erro: 'rifa_id e quantidade são obrigatórios.' });

  const rifa = db.prepare("SELECT * FROM rifas WHERE id = ? AND status = 'aberta'").get(rifa_id);
  if (!rifa) return res.status(404).json({ erro: 'Rifa não encontrada.' });

  const user  = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
  const valor = parseFloat((quantidade * rifa.preco_bilhete).toFixed(2));

  try {
    const { provedor_id, qrcode_texto, qrcode_imagem } = await criarPix({
      valor,
      descricao:     `${quantidade}x bilhete(s) - ${rifa.nome}`,
      email_pagador: user.email,
      nome_pagador:  user.nome,
    });

    const pagId = uuidv4();
    db.prepare(`
      INSERT INTO pagamentos (id, user_id, rifa_id, quantidade, valor_total, provedor, provedor_id, qrcode_texto, qrcode_imagem)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(pagId, user.id, rifa.id, quantidade, valor, config.pix.provedor, provedor_id, qrcode_texto, qrcode_imagem);

    res.json({
      pagamento_id:  pagId,
      valor,
      qrcode_texto,
      qrcode_imagem,
      mensagem: 'Pix gerado. Pague e aguarde a confirmação automática.'
    });
  } catch (err) {
    console.error('Erro ao gerar Pix:', err.message);
    res.status(500).json({ erro: 'Erro ao gerar Pix. Verifique as credenciais do PSP.' });
  }
});

// GET /api/pagamento/status/:id
router.get('/status/:id', autenticar, (req, res) => {
  const pag = db.prepare('SELECT * FROM pagamentos WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.userId);
  if (!pag) return res.status(404).json({ erro: 'Pagamento não encontrado.' });
  res.json({ status: pag.status, pago_em: pag.pago_em });
});

// POST /api/pagamento/webhook — recebe notificação do PSP
// ⚠️  Configure a URL do webhook no painel do seu PSP apontando para:
//      https://seusite.com.br/api/pagamento/webhook
router.post('/webhook', async (req, res) => {
  // Mercado Pago envia: { type: 'payment', data: { id: '...' } }
  // Asaas envia:        { event: 'PAYMENT_RECEIVED', payment: { id: '...' } }

  try {
    let provedorId;
    if (req.body.type === 'payment') {
      provedorId = String(req.body.data?.id);
    } else if (req.body.event === 'PAYMENT_RECEIVED') {
      provedorId = String(req.body.payment?.id);
    }

    if (!provedorId) return res.sendStatus(200); // ignora outros eventos

    const pagamento = db.prepare(
      "SELECT * FROM pagamentos WHERE provedor_id = ? AND status = 'pendente'"
    ).get(provedorId);

    if (!pagamento) return res.sendStatus(200);

    // Confirma pagamento
    const agora = new Date().toISOString();
    db.prepare("UPDATE pagamentos SET status = 'pago', pago_em = ? WHERE id = ?")
      .run(agora, pagamento.id);
    db.prepare(
      "UPDATE bilhetes SET status = 'pago', pago_em = ? WHERE rifa_id = ? AND user_id = ? AND status = 'reservado'"
    ).run(agora, pagamento.rifa_id, pagamento.user_id);
    db.prepare("UPDATE rifas SET bilhetes_vendidos = bilhetes_vendidos + ? WHERE id = ?")
      .run(pagamento.quantidade, pagamento.rifa_id);

    // Verifica se atingiu o limite
    const rifa = db.prepare('SELECT * FROM rifas WHERE id = ?').get(pagamento.rifa_id);
    if (rifa.bilhetes_vendidos >= rifa.total_bilhetes) {
      db.prepare("UPDATE rifas SET status = 'encerrada' WHERE id = ?").run(rifa.id);
      console.log(`🎉 Rifa ${rifa.id} encerrada! Pronto para sortear via /api/admin/sortear`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook erro:', err.message);
    res.sendStatus(500);
  }
});

module.exports = router;
