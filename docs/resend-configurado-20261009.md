# Resend preparado — 09/10/2026

Atualização posterior: por solicitação do responsável, remetente alterado para **sistemagrafica@nortemkt.com**, carregado no app e conferido com disparos automáticos desligados. O endereço anterior abaixo registra a configuração e o teste históricos. Não foi enviado novo teste após a troca de endereço.

Chave fornecida pelo responsável instalada em `services.env` da VPS (root/modo 600), fora do código. Configuração anterior preservada em arquivo privado de `infra/backups/services-pre-resend-*`. Container do app recriado sem alterar PostgreSQL ou dados; chave e remetente carregados no processo.

Consulta somente leitura à API Resend: domínio `nortemkt.com` verificado, sem mais páginas de domínios. Remetente escolhido pelo responsável: **grafica@nortemkt.com**. URL do app: `https://grafica.appsnorte.com`.

E-mails permanecem desligados na homologação: `BOOK_EMAIL_NOTIFICATIONS_ENABLED=false`, `BOOK_EMAIL_DRY_RUN=true`, `REVISAO_DIGEST_ENABLED=false`, `GESTAO_DIGEST_ENABLED=false`. Na configuração inicial não foi enviada mensagem de teste ou aviso aos usuários. Leitura do processo confirmou as variáveis e login HTTPS com resposta 200.

Antes de ativar: conferir destinatários calculados pelo app e autorizar os disparos de produção. Se for necessária cópia fixa (`BOOK_EMAIL_TO`) ou endereço para resposta (`BOOK_EMAIL_REPLY_TO`), definir com o responsável; não foram inventados nesta configuração.

## Teste de entrega autorizado

O responsável indicou `marcos.meira@nortemkt.com` para o teste. Enviado **um único e-mail** pela API do Resend, a partir da VPS, às 15h01 de Brasília, com remetente `grafica@nortemkt.com` e assunto `Gráfica — teste de e-mail da VPS`. Chave de idempotência evita duplicação ao repetir a mesma requisição durante sua validade.

ID: `01a121d3-af19-7dd8-88f2-43f0f8b7b591`. Consulta posterior às 15h01 retornou HTTP 200 e `last_event=delivered`. Essa confirmação é do provedor; não representa conferência visual da caixa do usuário. Não foram habilitados avisos automáticos nem exercitado um evento de negócio do app para este envio.

Relatórios: `artifacts/resend-teste-envio-20261009.json` e `artifacts/resend-teste-status-20261009.json`. Consulta conforme [API oficial de e-mail enviado](https://resend.com/docs/api-reference/emails/retrieve-email).

Origem no Replit, Neon e destino do portal NORTE preservados. Desativação do Replit continua dependente de autorização explícita.

Referência da consulta: [API oficial de domínios do Resend](https://github.com/resend/resend-openapi/blob/main/resend.yaml). Relatório sem segredos: `artifacts/resend-configurado-20261009.json`.
