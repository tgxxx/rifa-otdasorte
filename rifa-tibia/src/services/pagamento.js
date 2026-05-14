// src/services/pagamento.js
// Integração Pix — suporta Mercado Pago e Asaas
// Para adicionar outro PSP, crie um novo bloco similar abaixo.

const axios  = require('axios');
const config = require('../config/config');

// ─── MERCADO PAGO ─────────────────────────────────────────────────────────────
async function criarPixMercadoPago({ valor, descricao, email_pagador }) {
  const url = 'https://api.mercadopago.com/v1/payments';
  const body = {
    transaction_amount: valor,
    description:        descricao,
    payment_method_id:  'pix',
    payer: { email: email_pagador },
  };

  const resp = await axios.post(url, body, {
    headers: {
      Authorization:  `Bearer ${config.pix.mercadopago.accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `${Date.now()}-${Math.random()}`,
    },
  });

  const d = resp.data.point_of_interaction?.transaction_data;
  return {
    provedor_id:   String(resp.data.id),
    qrcode_texto:  d?.qr_code        || '',
    qrcode_imagem: d?.qr_code_base64 || '',
  };
}

// ─── ASAAS ────────────────────────────────────────────────────────────────────
async function criarPixAsaas({ valor, descricao, email_pagador, nome_pagador }) {
  const base = config.pix.asaas.sandbox
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/api/v3';

  // 1. Busca ou cria customer
  let customerId;
  const busca = await axios.get(`${base}/customers?email=${email_pagador}`, {
    headers: { access_token: config.pix.asaas.apiKey },
  }).catch(() => null);

  if (busca?.data?.data?.length > 0) {
    customerId = busca.data.data[0].id;
  } else {
    const novo = await axios.post(`${base}/customers`, {
      name:  nome_pagador,
      email: email_pagador,
    }, { headers: { access_token: config.pix.asaas.apiKey } });
    customerId = novo.data.id;
  }

  // 2. Cria cobrança Pix
  const vencimento = new Date();
  vencimento.setDate(vencimento.getDate() + 1);

  const cobranca = await axios.post(`${base}/payments`, {
    customer:    customerId,
    billingType: 'PIX',
    value:       valor,
    dueDate:     vencimento.toISOString().split('T')[0],
    description: descricao,
  }, { headers: { access_token: config.pix.asaas.apiKey } });

  // 3. Busca QR Code
  const qr = await axios.get(`${base}/payments/${cobranca.data.id}/pixQrCode`, {
    headers: { access_token: config.pix.asaas.apiKey },
  });

  return {
    provedor_id:   cobranca.data.id,
    qrcode_texto:  qr.data.payload   || '',
    qrcode_imagem: qr.data.encodedImage || '',
  };
}

// ─── DISPATCHER ───────────────────────────────────────────────────────────────
async function criarPix(dados) {
  switch (config.pix.provedor) {
    case 'mercadopago': return criarPixMercadoPago(dados);
    case 'asaas':       return criarPixAsaas(dados);
    default: throw new Error(`PSP "${config.pix.provedor}" não configurado.`);
  }
}

module.exports = { criarPix };
