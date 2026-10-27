# Etapa 2 — desvinculação do código

## O que mudou

- Plugins Vite e SDK de conectores do Replit removidos, junto com `.replit`.
- Lockfile usa o registro público npm; versões e integridades são preservadas
  quando a dependência não precisou mudar. `pg` agora é dependência explícita.
- Banco, exportação do Checklist e LISTEN/NOTIFY usam `pg` por TCP e
  `drizzle-orm/node-postgres`. O PostgreSQL local de teste usa o mesmo transporte.
- Entrega de e-mail usa diretamente `https://api.resend.com/emails`, com
  `RESEND_API_KEY` e timeout de 15 segundos. Sem chave, o envio falha antes da rede.
- GCS usa autenticação padrão (`GOOGLE_APPLICATION_CREDENTIALS`/ambiente), e
  URLs assinadas são geradas pelo SDK. Nenhuma chamada ao sidecar do Replit.
- Desenvolvimento mantém o emulador local de arquivos. A estrutura `.private`
  e os caminhos `/objects/...` são preservados para não quebrar os dados atuais.
- Produção é identificada apenas por `NODE_ENV=production`. Homologação deve
  definir `REVISAO_DIGEST_ENABLED=false`, `GESTAO_DIGEST_ENABLED=false` e
  `BOOK_EMAIL_NOTIFICATIONS_ENABLED=false` explicitamente.
- Vite/CSP e mensagens de atualização não exigem domínio ou editor do Replit.
- `npm run dev` e `npm start` carregam `.env`, se existir, sem substituir
  variáveis já fornecidas pelo ambiente. Os comandos funcionam em Windows/Linux.
- CI e `.nvmrc` usam Node 24.15.0, compatível com as dependências atuais.

## Limites desta etapa

Não foi publicada uma nova aplicação, alterado o domínio, importado o Neon ou
transferido nenhum arquivo de produção. Não foi alterado `shared/schema.ts`.

O adaptador de armazenamento ainda é GCS, agora independente. Isso não concede
acesso ao bucket antigo: ele depende de credenciais autorizadas pela empresa.
R2, política de acesso, transferência de objetos e validação dos links existentes
são a etapa seguinte. O emulador local não deve ser usado como storage de produção.

Resend precisa de chave própria e remetente verificado para envio real. As
validações desta etapa simulam o provedor; nenhuma mensagem real é enviada.

As notas da antiga hospedagem foram preservadas em `historico-replit.md` como
histórico, e não como instrução para publicar ou configurar o novo ambiente.

## Execução

1. Instalar a versão de Node em `.nvmrc` ou outra aceita por `engines`.
2. `npm ci`.
3. Copiar `.env.example` para `.env` e preencher os valores do ambiente.
4. `npm run dev`, ou `npm run build` seguido de `npm start`.
5. Executar migrações separadamente: `npm run db:migrate` para inspecionar e
   `npm run db:migrate -- --aplicar` somente no banco escolhido e autorizado.

Nunca executar `db:push` em produção. A etapa de importação terá verificação
própria do histórico de migrações e das diferenças de schema.

## Referências dos adaptadores

- [Conexão PostgreSQL padrão](https://node-postgres.com/features/connecting)
- [Driver node-postgres do Drizzle](https://orm.drizzle.team/docs/get-started-postgresql)
- [Envio direto de e-mail](https://resend.com/docs/api-reference/emails/send-email)
- [Assinatura de URLs no GCS](https://cloud.google.com/storage/docs/access-control/signing-urls-with-helpers)

## Validação realizada em 07/10/2026

- Instalação limpa `npm ci` a partir do registro público: concluída.
- Varredura do lockfile: nenhum pacote instalado `@replit/*`, nenhum driver
  Neon serverless instalado e nenhum endereço privado de download. O Drizzle
  ainda declara o driver Neon como peer **opcional** em seus próprios metadados;
  isso não instala nem utiliza esse driver no app.
- `npm run check` e `npm run check:tests`: aprovados.
- Build final de frontend e backend: aprovado.
- Suíte completa: 6.719 testes aprovados, zero falhas, 19 pulados.
- Integração com banco local descartável, executada separadamente: 59 aprovados,
  zero falhas, nenhum pulado nessa execução.
- Testes de arquivo e provedor direto: quatro aprovados. Upload/download e ACL
  passaram contra o emulador real; o e-mail foi simulado, sem envio externo.
- App completo iniciado localmente: frontend, login, sessão persistida pelo
  driver TCP, leitura da API, upload PUT, download e recusa sem autenticação
  aprovados. O processo e a infraestrutura em memória foram encerrados ao final.

A execução dos testes/build usou Node 24.19.0 disponível no runtime local.
O Node padrão do computador é 24.14.1 e está abaixo do mínimo aceito pelo jsdom
atual; para uso manual, selecionar uma versão de `engines`/`.nvmrc`.
