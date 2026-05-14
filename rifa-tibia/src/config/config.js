// ============================================================
//  ⚙️  ARQUIVO DE CONFIGURAÇÃO — EDITE AQUI ANTES DE SUBIR
// ============================================================

module.exports = {

  // ─── RIFA ────────────────────────────────────────────────
  rifa: {
    nomeSite:       "OTDASORTE",          // Nome exibido no site
    descricao:      "Ganhe moedas no Tibia!",   // Subtítulo
    premioDescricao:"1000 Gold Coins Tibia",  // Descrição do prêmio
    precoPorBilhete: 0.10,                      // R$ por bilhete
    totalBilhetes:   1,                       // Quantos bilhetes para fechar o sorteio
    maxBilhetesUsuario: 0,                     // Limite por comprador (0 = sem limite)
    contatoWhatsApp: "55219999999",           // Seu WhatsApp (com DDI+DDD, sem +)
    contatoEmail:    "contato@rifatibia.com.br",
  },

  // ─── PIX ─────────────────────────────────────────────────
  pix: {
    // Escolha seu PSP: "mercadopago" | "asaas" | "gerencianet" | "pagseguro"
    provedor: "mercadopago",

    mercadopago: {
      accessToken: "APP_USR-2572234826500820-051405-caad62f18647b1ecb0d8a3cf451da242-3402580836", // painel.mercadopago.com → Credenciais
    },

    asaas: {
      apiKey:      "COLOQUE-SUA-APIKEY-AQUI",         // app.asaas.com → Configurações → API
      sandbox:      true,                             // mude para false em produção
    },
  },

  // ─── BANCO DE DADOS ──────────────────────────────────────
  database: {
    // Opção simples (SQLite — sem instalar nada, ideal para começar)
    tipo: "sqlite",
    sqlitePath: "./data/rifa.db",

    // Opção produção (PostgreSQL — descomente e preencha)
    // tipo: "postgres",
    // url: "postgresql://usuario:senha@host:5432/rifa",
  },

  // ─── JWT (autenticação) ──────────────────────────────────
  jwt: {
    secret:         "230936d98c45ff13ec51ec85aa850f5e2fba8633e772da6f1a91602a8939c02d102ed13b723e89b11e5afb65c2ec0b336e13bafee9a002638ff40bab0ca4731b", // OBRIGATÓRIO trocar!
    expiresIn:      "24h",
    refreshSecret:  "95cccdbcf5621b9bce100b03bba687cfdbd72b11f1942ec2974d769e0c9e24380baaabcc32e576414ec61164d0c5e71b2e4465ea840b34d8325f14210e427e06",
    refreshExpires: "7d",
  },

  // ─── SERVIDOR ────────────────────────────────────────────
  server: {
    port:    3000,
    baseUrl: "http://localhost:3000",  // Em produção: "https://seusite.com.br"
    env:     "production",           // "production" em produção
  },

  // ─── NOTIFICAÇÕES (opcional) ─────────────────────────────
  email: {
    ativo:    false,          // true para ativar envio de e-mail
    servico:  "gmail",        // "gmail" | "sendgrid" | "mailgun"
    usuario:  "seu@gmail.com",
    senha:    "senha-de-app-google", // Senha de App (não sua senha normal)
  },
};
