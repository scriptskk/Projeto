# soma. — seu dinheiro, mais claro

Um MVP pequeno e funcional para gerenciamento financeiro pessoal. Site responsivo e minimalista, contas isoladas, cadastro/login, receitas e despesas, visualizações, exportação CSV e exclusão de conta.

## Iniciar o projeto

Requer **Node.js 22.13+**. Não precisa instalar pacotes.

```bash
git clone --branch feat/soma-finance-mvp https://github.com/scriptskk/Projeto.git
cd Projeto/soma
npm run dev
```

Acesse **http://127.0.0.1:3000**. O SQLite é criado automaticamente em `.data/soma.sqlite`, fora do Git. Use `npm start` sem modo watch.

Para testar:

```bash
npm test
```

## Funcionalidades

- Cadastro por nome, e-mail e senha; hash scrypt e cookie HttpOnly / SameSite=Strict
- Dados isolados por usuário: nenhuma rota recebe um `userId` arbitrário do navegador
- Registro e exclusão de receitas/despesas, categorias e datas
- Valores financeiros em centavos inteiros, nunca ponto flutuante no banco
- Saldo acumulado e visão mensal, gráfico de seis meses e categorias
- Exportação CSV e exclusão de conta mediante senha
- Interface desktop/mobile com estados vazios, navegação por teclado e feedback de operação

## Estrutura

```
soma/
├── public/
│   ├── index.html            landing page
│   ├── app.html              dashboard privado
│   ├── privacidade.html      aviso de privacidade para alpha
│   └── assets/
│       ├── styles.css       visual responsivo
│       ├── site.js          cadastro e login
│       └── dashboard.js     interatividade financeira
├── server/
│   ├── index.js             API HTTP autenticada
│   ├── db.js                SQLite e regras financeiras
│   └── auth.js              senhas e sessões
├── tests/
│   └── finance.test.js      testes de isolamento e valores
├── .env.example
├── .gitignore
└── package.json
```

## Por que esta base é tão pequena?

**Zero dependências npm.** O front-end é HTML/CSS/JavaScript nativo, a API usa Node.js e `node:sqlite`, com apenas três tabelas. Menos manutenção, inicialização direta e uma estrutura que pode evoluir para Fastify/TypeScript/PostgreSQL sem reescrever a interface.

## WhatsApp e IA

A IA e o WhatsApp **ainda não estão implementados**. Os lançamentos de `server/db.js` foram separados do HTTP para que, futuramente, um adaptador oficial da WhatsApp Cloud API possa chamar as mesmas regras de negócio. A IA deverá apenas interpretar mensagens, nunca escrever livremente no banco.

## Antes de publicar para usuários reais

**Status: protótipo técnico para testes locais.** `node:sqlite` no Node 22 é experimental, por isso o script usa `--experimental-sqlite`. Antes de receber dados financeiros de terceiros:

1. Migrar para SQLite com driver estável ou PostgreSQL, testar backup e restauração e hospedar com HTTPS (`COOKIE_SECURE=true`).
2. Implementar verificação de e-mail, recuperação de senha, proteção aprimorada contra abuso e monitoramento.
3. Publicar termos de uso e política de privacidade completos, com identificação do responsável e procedimentos LGPD.
4. Executar testes end-to-end e auditoria de autenticação/autorização multiusuário.
5. Definir gestão de incidentes, logs, retenção e segurança da infraestrutura.

Sem hospedagem pública nem integração bancária, Pix, WhatsApp ou IA nesta etapa.
