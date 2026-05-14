// src/services/sorteio.js
// Usa a API pública da Loteria Federal para obter o número sorteado oficial.
// Endpoint: https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil (exemplo)
// Para rifas, usamos a Loteria Federal clássica (quinzenal) — último resultado disponível.

const axios = require('axios');

// ─── ESTRATÉGIA DE SORTEIO ───────────────────────────────────────────────────
// Pega o último resultado da Loteria Federal e usa a soma dos primeiros premios
// módulo o total de bilhetes para determinar o vencedor.
// Isso garante auditabilidade pública (qualquer um pode verificar no site da Caixa).

async function obterNumeroSorteio(totalBilhetes) {
  try {
    // API pública da Caixa — Loteria Federal
    const resp = await axios.get(
      'https://servicebus2.caixa.gov.br/portaldeloterias/api/federal',
      { timeout: 10000 }
    );

    const concurso = resp.data;
    const numeros  = concurso.listaDezenas || [];  // ex: ["12345", "23456", ...]

    if (!numeros.length) throw new Error('Sem números no resultado.');

    // Usa o primeiro prêmio como base (5 dígitos da Loteria Federal)
    const primeiroPremio = parseInt(numeros[0], 10);
    const numeroBilhete  = (primeiroPremio % totalBilhetes) + 1;

    return {
      numero:   numeroBilhete,
      fonte:    `Loteria Federal — Concurso ${concurso.numero}`,
      concurso: concurso.numero,
      data:     concurso.dataApuracao,
      original: numeros[0],
      calculo:  `${primeiroPremio} % ${totalBilhetes} + 1 = ${numeroBilhete}`,
    };
  } catch (err) {
    // Fallback: usa Mega-Sena se Federal falhar
    console.warn('Loteria Federal indisponível, tentando Mega-Sena...');
    const resp2 = await axios.get(
      'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena',
      { timeout: 10000 }
    );
    const dezenas = resp2.data.listaDezenas || [];
    const soma    = dezenas.reduce((acc, n) => acc + parseInt(n, 10), 0);
    const numero  = (soma % totalBilhetes) + 1;

    return {
      numero,
      fonte:    `Mega-Sena — Concurso ${resp2.data.numero} (fallback)`,
      concurso: resp2.data.numero,
      data:     resp2.data.dataApuracao,
      original: dezenas.join(', '),
      calculo:  `soma(${dezenas.join('+')}) % ${totalBilhetes} + 1 = ${numero}`,
    };
  }
}

module.exports = { obterNumeroSorteio };
