# ⚔️ Rifa Tibia Gold — Guia de Configuração e Deploy

## 📁 Estrutura do Projeto

```
rifa-tibia/
├── server.js                  ← Servidor principal (não editar)
├── package.json
├── src/
│   ├── config/
│   │   └── config.js          ← ⭐ EDITE AQUI (tudo em um lugar)
│   ├── routes/
│   │   ├── auth.js            ← Login, registro, JWT
│   │   ├── rifa.js            ← Bilhetes, sorteio
│   │   ├── pagamento.js       ← Pix, webhook
│   │   └── admin.js           ← Painel admin
│   ├── services/
│   │   ├── pagamento.js       ← Integração PSP (Mercado Pago / Asaas)
│   │   └── sorteio.js         ← API Loteria Federal
│   ├── models/
│   │   ├── db.js              ← Conexão SQLite
│   │   └── initDb.js          ← Cria tabelas e dados iniciais
│   └── middleware/
│       └── auth.js            ← Validação JWT
├── frontend/
│   ├── index.html             ← Página principal (editável)
│   ├── css/style.css          ← Estilo (editável)
│   └── js/app.js             ← Lógica frontend (editável)
└── data/
    └── rifa.db                ← Banco SQLite (criado automaticamente)
```

---

## 🚀 Passo a Passo para Colocar Online

### PASSO 1 — Instalar dependências localmente

```bash
cd rifa-tibia
npm install
```

### PASSO 2 — Editar configurações (OBRIGATÓRIO)

Abra **`src/config/config.js`** e edite:

| Campo | O que fazer |
|-------|-------------|
| `rifa.nomeSite` | Nome do seu site |
| `rifa.premioDescricao` | Descreva o prêmio |
| `rifa.precoPorBilhete` | Preço (padrão: 0.10) |
| `rifa.totalBilhetes` | Quantos bilhetes para fechar |
| `rifa.contatoWhatsApp` | Seu número (com DDI, ex: 5521999999999) |
| `pix.provedor` | `"mercadopago"` ou `"asaas"` |
| `pix.mercadopago.accessToken` | Seu token do Mercado Pago |
| `jwt.secret` | Gere uma string aleatória longa |
| `server.baseUrl` | URL do seu site em produção |

**Como gerar o JWT secret (no terminal):**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### PASSO 3 — Criar o banco de dados

```bash
node src/models/initDb.js
```

Isso cria:
- As tabelas (users, rifas, bilhetes, pagamentos...)
- A rifa inicial com os bilhetes
- Um admin padrão: `admin@rifatibia.com` / senha: `admin123`

⚠️ **TROQUE A SENHA DO ADMIN ANTES DE SUBIR!**

### PASSO 4 — Testar localmente

```bash
npm start
# Acesse: http://localhost:3000
```

---

## 🌐 Deploy em Produção

### Opção A — Railway (mais fácil, grátis para começar)

1. Acesse [railway.app](https://railway.app) e crie conta
2. Clique em **New Project → Deploy from GitHub**
3. Suba o projeto no seu GitHub primeiro:
   ```bash
   git init
   git add .
   git commit -m "primeiro commit"
   git remote add origin https://github.com/SEUSUSUARIO/rifa-tibia.git
   git push -u origin main
   ```
4. No Railway, conecte o repositório
5. Vá em **Variables** e adicione as variáveis de ambiente (veja abaixo)
6. Railway gera uma URL automática (ex: `rifa-tibia.up.railway.app`)

### Opção B — VPS (DigitalOcean, Hostinger, etc.)

```bash
# No servidor:
git clone https://github.com/SEUSUSUARIO/rifa-tibia.git
cd rifa-tibia
npm install
node src/models/initDb.js

# Instalar PM2 para manter o servidor rodando
npm install -g pm2
pm2 start server.js --name rifa-tibia
pm2 startup  # configura reinício automático
pm2 save
```

Para usar seu próprio domínio com HTTPS, use Nginx como proxy reverso:
```nginx
# /etc/nginx/sites-available/rifa
server {
    server_name seusite.com.br;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Opção C — Render.com (grátis com sleep)

1. Acesse [render.com](https://render.com)
2. New Web Service → conecte seu GitHub
3. Build Command: `npm install && node src/models/initDb.js`
4. Start Command: `npm start`

---

## 🔑 Variáveis de Ambiente (para deploy)

Em produção, use variáveis de ambiente em vez de editar o config.js:

```env
PORT=3000
NODE_ENV=production
JWT_SECRET=sua-string-aleatoria-longa
JWT_REFRESH_SECRET=outro-segredo-diferente
MERCADOPAGO_TOKEN=APP_USR-seu-token
BASE_URL=https://seusite.com.br
```

E atualize `config.js` para ler de `process.env`:
```js
// Substitua os valores fixos por:
jwt: {
  secret: process.env.JWT_SECRET || 'fallback-dev',
  // ...
}
```

---

## 💳 Configurar o Pix

### Mercado Pago (recomendado para iniciantes)
1. Acesse [mercadopago.com.br](https://www.mercadopago.com.br)
2. Perfil → Configurações → Credenciais
3. Copie o **Access Token de Produção**
4. Cole em `config.js → pix.mercadopago.accessToken`
5. Configure o webhook no Mercado Pago:
   - URL: `https://seusite.com.br/api/pagamento/webhook`
   - Eventos: `payment`

### Asaas
1. Acesse [app.asaas.com](https://app.asaas.com)
2. Configurações → Integrações → API
3. Copie a API Key
4. Configure `config.js → pix.asaas.apiKey`
5. No Asaas: Configure webhook → `https://seusite.com.br/api/pagamento/webhook`

---

## 🏆 Fazer o Sorteio

Quando todos os bilhetes forem vendidos, acesse como admin:

```bash
curl -X POST https://seusite.com.br/api/admin/sortear \
  -H "Authorization: Bearer SEU-TOKEN-ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"rifa_id": "ID-DA-RIFA"}'
```

O sistema consulta a API da Loteria Federal automaticamente e registra o resultado.

---

## 🛡️ Checklist de Segurança Antes de Subir

- [ ] Troquei `jwt.secret` por uma string aleatória longa
- [ ] Troquei `jwt.refreshSecret` por outro segredo diferente
- [ ] Troquei a senha do admin (no banco ou via endpoint)
- [ ] Configurei `server.baseUrl` com a URL real
- [ ] Coloquei `server.env = "production"`
- [ ] Configurei HTTPS no servidor (via Nginx + Let's Encrypt ou Railway/Render faz automático)
- [ ] Testei o webhook do Pix localmente com o [Ngrok](https://ngrok.com) antes de subir

---

## ❓ Dúvidas comuns

**O site não carrega os bilhetes:**
→ Rode `node src/models/initDb.js` para criar o banco.

**Pix não gera QR Code:**
→ Verifique se o token do PSP está correto no `config.js`.

**Webhook não confirma pagamento:**
→ No painel do PSP, certifique-se que a URL do webhook aponta para `https://seusite.com/api/pagamento/webhook`.

**Sorteio falhou:**
→ A API da Loteria Federal às vezes tem instabilidade. Tente novamente em alguns minutos.
