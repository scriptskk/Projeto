# soma. — seu dinheiro, mais claro

Projeto inicial de um gerenciador financeiro pessoal multiusuário, com design premium e preparação para integração futura ao WhatsApp.

## Primeira versão funcional

- Landing page responsiva
- Cadastro e login com sessão privada
- Registro de receitas e despesas
- Saldo acumulado e análise mensal
- Gráfico e categorias
- Exportação CSV e exclusão de conta
- SQLite local com isolamento por usuário

## Tecnologia

Node.js 22+, SQLite nativo e HTML/CSS/JavaScript, sem dependências npm. Arquitetura enxuta para protótipo. O motor financeiro foi separado do transporte HTTP, para facilitar a futura integração à WhatsApp Cloud API.

## Como rodar a versão completa

Extraia o arquivo `soma-finance-mvp.zip` fornecido na conversa, execute `npm run dev` e abra http://127.0.0.1:3000. Execute `npm test` para testar validação monetária e isolamento por usuário.

## Status do repositório

Este diretório inicia o trabalho na branch `feat/soma-finance-mvp` para preservar a branch principal. Os arquivos completos do protótipo foram entregues no ZIP separado. Ainda não há deployment público, integração WhatsApp ou IA.

**Não utilizar com dados financeiros reais de terceiros antes de hospedagem HTTPS, revisão de segurança, verificação de e-mail e documentação LGPD definitiva.**
