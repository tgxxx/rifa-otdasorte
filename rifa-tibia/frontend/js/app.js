// frontend/js/app.js
// ─── CONFIG (sincroniza com backend) ─────────────────────────
const API = '';  // deixe vazio se frontend e backend estão no mesmo servidor

// ─── ESTADO ──────────────────────────────────────────────────
let token        = localStorage.getItem('token') || null;
let refreshToken = localStorage.getItem('refreshToken') || null;
let userInfo     = JSON.parse(localStorage.getItem('userInfo') || 'null');
let rifaAtual    = null;
let pagamentoId  = null;
let poolingTimer = null;

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  iniciarParticulas();
  atualizarNavUser();
  carregarRifa();
  carregarResultado();
  if (token) carregarMeusBilhetes();
});

// ─── API HELPER ───────────────────────────────────────────────
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(API + path, { ...opts, headers });

  if (resp.status === 401 && refreshToken) {
    // Tenta renovar token
    const r = await fetch(API + '/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (r.ok) {
      const d = await r.json();
      token = d.accessToken;
      localStorage.setItem('token', token);
      headers['Authorization'] = `Bearer ${token}`;
      return fetch(API + path, { ...opts, headers });
    } else {
      logout(false);
    }
  }
  return resp;
}

// ─── RIFA ─────────────────────────────────────────────────────
async function carregarRifa() {
  try {
    const r = await api('/api/rifa');
    if (!r.ok) return;
    rifaAtual = await r.json();

    // Preenche textos dinâmicos
    document.getElementById('nome-site').textContent       = rifaAtual.nome;
    document.getElementById('hero-titulo').innerHTML       = rifaAtual.nome + '<br/><em>' + rifaAtual.descricao + '</em>';
    document.getElementById('hero-premio').textContent     = 'Prêmio: ' + rifaAtual.premio;
    document.getElementById('hero-preco').textContent      = 'R$ ' + rifaAtual.preco_bilhete.toFixed(2).replace('.', ',');
    document.getElementById('footer-nome').textContent     = rifaAtual.nome;
    document.title = rifaAtual.nome;

    // Stats
    const disponiveis = rifaAtual.bilhetes_disponiveis;
    const vendidos    = rifaAtual.total_bilhetes - disponiveis;
    const pct         = Math.round((vendidos / rifaAtual.total_bilhetes) * 100);

    document.getElementById('stat-vendidos').textContent   = vendidos;
    document.getElementById('stat-disponiveis').textContent = disponiveis;
    document.getElementById('stat-total').textContent      = rifaAtual.total_bilhetes;
    document.getElementById('stat-preco').textContent      = 'R$ ' + rifaAtual.preco_bilhete.toFixed(2).replace('.', ',');
    document.getElementById('progress-fill').style.width   = pct + '%';
    document.getElementById('progress-pct').textContent    = pct + '%';

    const badge = document.getElementById('badge-status');
    badge.textContent = rifaAtual.status === 'aberta' ? '🟢 Aberta' : rifaAtual.status === 'encerrada' ? '🔴 Encerrada' : '🏆 Sorteada';
    badge.className = 'badge-status ' + (rifaAtual.status !== 'aberta' ? rifaAtual.status : '');

    atualizarResumo();
    atualizarHint();
  } catch (e) {
    console.error('Erro ao carregar rifa:', e);
  }
}

function atualizarResumo() {
  if (!rifaAtual) return;
  const qty   = parseInt(document.getElementById('qty-input').value) || 1;
  const total = (qty * rifaAtual.preco_bilhete).toFixed(2).replace('.', ',');
  document.getElementById('total-pagar').textContent = 'R$ ' + total;
}

function setQty(n) {
  document.getElementById('qty-input').value = n;
  document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  atualizarResumo();
}

function atualizarHint() {
  const hint = document.getElementById('compra-hint');
  if (!token) hint.textContent = 'Faça login para comprar';
  else if (rifaAtual?.status !== 'aberta') hint.textContent = 'Rifa encerrada';
  else hint.textContent = '';
}

function scrollParaRifa() {
  document.getElementById('rifa').scrollIntoView({ behavior: 'smooth' });
}

// ─── COMPRA ───────────────────────────────────────────────────
async function iniciarCompra() {
  if (!token) { abrirModal('modal-login'); return; }
  if (!rifaAtual || rifaAtual.status !== 'aberta') return;

  const quantidade = parseInt(document.getElementById('qty-input').value) || 1;

  try {
    // 1. Reserva bilhetes
    const rRes = await api('/api/rifa/reservar', {
      method: 'POST',
      body: JSON.stringify({ rifa_id: rifaAtual.id, quantidade }),
    });
    const rData = await rRes.json();
    if (!rRes.ok) { alert(rData.erro || 'Erro ao reservar.'); return; }

    // 2. Gera Pix
    const pRes = await api('/api/pagamento/gerar-pix', {
      method: 'POST',
      body: JSON.stringify({ rifa_id: rifaAtual.id, quantidade }),
    });
    const pData = await pRes.json();
    if (!pRes.ok) { alert(pData.erro || 'Erro ao gerar Pix.'); return; }

    pagamentoId = pData.pagamento_id;

    // 3. Abre modal Pix
    document.getElementById('pix-codigo').value  = pData.qrcode_texto;
    document.getElementById('pix-valor').textContent = 'R$ ' + pData.valor.toFixed(2).replace('.', ',');

    const qrImg = document.getElementById('pix-qr-img');
    if (pData.qrcode_imagem) {
      qrImg.src = 'data:image/png;base64,' + pData.qrcode_imagem;
      qrImg.style.display = 'block';
    } else {
      qrImg.style.display = 'none';
    }

    document.getElementById('pix-status').textContent = '⏳ Aguardando pagamento...';
    document.getElementById('pix-status').className   = 'pix-status';

    abrirModal('modal-pix');
    iniciarPolling();
  } catch (e) {
    alert('Erro inesperado. Tente novamente.');
    console.error(e);
  }
}

function iniciarPolling() {
  clearInterval(poolingTimer);
  poolingTimer = setInterval(verificarPagamento, 5000);
}

async function verificarPagamento() {
  if (!pagamentoId) return;
  const r = await api(`/api/pagamento/status/${pagamentoId}`);
  if (!r.ok) return;
  const d = await r.json();

  if (d.status === 'pago') {
    clearInterval(poolingTimer);
    document.getElementById('pix-status').textContent = '✅ Pagamento confirmado! Bilhetes garantidos.';
    document.getElementById('pix-status').className   = 'pix-status pago';
    carregarRifa();
    carregarMeusBilhetes();
  }
}

function copiarPix() {
  const cod = document.getElementById('pix-codigo').value;
  navigator.clipboard.writeText(cod).then(() => alert('Código Pix copiado!'));
}

// ─── RESULTADO ────────────────────────────────────────────────
async function carregarResultado() {
  try {
    const r = await api('/api/rifa/resultado');
    if (!r.ok) return;
    const d = await r.json();

    if (d.sorteado) {
      document.getElementById('resultado-pendente').style.display = 'none';
      document.getElementById('resultado-box').style.display      = 'block';
      document.getElementById('res-numero').textContent   = d.numero_sorteado;
      document.getElementById('res-ganhador').textContent = d.ganhador?.nome || 'Não identificado';
      document.getElementById('res-data').textContent     = d.sorteado_em ? 'Sorteado em: ' + new Date(d.sorteado_em).toLocaleDateString('pt-BR') : '';
    }
  } catch {}
}

// ─── MEUS BILHETES ────────────────────────────────────────────
async function carregarMeusBilhetes() {
  if (!token) return;
  const r = await api('/api/rifa/meus-bilhetes');
  if (!r.ok) return;
  const bilhetes = await r.json();

  const sec = document.getElementById('meus-bilhetes');
  const grid = document.getElementById('lista-bilhetes');

  if (bilhetes.length === 0) { sec.style.display = 'none'; return; }

  sec.style.display = 'block';
  grid.innerHTML = bilhetes.map(b => `
    <span class="bilhete-chip ${b.status}">
      #${String(b.numero).padStart(3, '0')}
    </span>
  `).join('');
}

// ─── AUTH ─────────────────────────────────────────────────────
async function login() {
  const email = document.getElementById('login-email').value.trim();
  const senha  = document.getElementById('login-senha').value;
  document.getElementById('erro-login').textContent = '';

  const r = await api('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, senha }),
  });
  const d = await r.json();
  if (!r.ok) { document.getElementById('erro-login').textContent = d.erro; return; }

  token        = d.accessToken;
  refreshToken = d.refreshToken;
  userInfo     = d.user;
  localStorage.setItem('token',        token);
  localStorage.setItem('refreshToken', refreshToken);
  localStorage.setItem('userInfo',     JSON.stringify(userInfo));

  fecharModal('modal-login');
  atualizarNavUser();
  atualizarHint();
  carregarMeusBilhetes();
}

async function registrar() {
  const nome  = document.getElementById('reg-nome').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const senha  = document.getElementById('reg-senha').value;
  document.getElementById('erro-registro').textContent = '';

  const r = await api('/api/auth/registro', {
    method: 'POST', body: JSON.stringify({ nome, email, senha }),
  });
  const d = await r.json();
  if (!r.ok) { document.getElementById('erro-registro').textContent = d.erro; return; }

  fecharModal('modal-registro');
  abrirModal('modal-login');
  document.getElementById('login-email').value = email;
  alert('Conta criada! Faça login.');
}

async function logout(redirect = true) {
  if (refreshToken) {
    await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
  }
  token = null; refreshToken = null; userInfo = null;
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userInfo');
  atualizarNavUser();
  document.getElementById('meus-bilhetes').style.display = 'none';
  atualizarHint();
}

function atualizarNavUser() {
  if (userInfo && token) {
    document.getElementById('nav-auth').style.display = 'none';
    document.getElementById('nav-user').style.display = 'flex';
    document.getElementById('user-nome-display').textContent = userInfo.nome;
  } else {
    document.getElementById('nav-auth').style.display = 'flex';
    document.getElementById('nav-user').style.display = 'none';
  }
}

// ─── MODAIS ───────────────────────────────────────────────────
function abrirModal(id) {
  document.getElementById(id).classList.add('active');
}
function fecharModal(id) {
  document.getElementById(id).classList.remove('active');
}
function fecharModalClick(e, id) {
  if (e.target.id === id) fecharModal(id);
}
function trocarModal(de, para) {
  fecharModal(de); abrirModal(para);
}

// ─── PARTÍCULAS ───────────────────────────────────────────────
function iniciarParticulas() {
  const canvas = document.getElementById('particles');
  const ctx    = canvas.getContext('2d');
  let W, H, particles;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.2,
      vy: -Math.random() * 0.4 - 0.1,
      a: Math.random() * 0.5 + 0.1,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(212,160,23,${p.a})`;
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.y < -5)  { p.y = H + 5; p.x = Math.random() * W; }
      if (p.x < -5)  p.x = W + 5;
      if (p.x > W + 5) p.x = -5;
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize(); draw();
}

// ─── CONTATO ──────────────────────────────────────────────────
// Preenche links de contato via API (config vem do backend)
api('/api/rifa').then(r => r.json()).then(() => {
  // Os links de contato podem ser hardcoded no HTML ou carregados de um endpoint de config
}).catch(() => {});
