# Backup e restauração da Gráfica — 09/10/2026

## Resultado verificado

O backup agora identifica o banco efetivamente conectado ao app, `grafica_import_20261008`, em vez do banco de inicialização `grafica_homolog`. O dump custom foi restaurado em banco temporário isolado, sem substituir o banco do app.

- Dump: `grafica-20261009T151610Z-1598982.dump`, 10.500.120 bytes.
- SHA-256: `07457d0b6e308cbeb71979f960a85bed8fe5d70df7a8e9b047fd949c1f2e5b66`.
- Comparação: 36 tabelas, incluindo as migrações; contagens e hashes do conteúdo iguais em todas.
- Contagens: 51 usuários, 96 eventos, 6.681 peças.
- Banco temporário removido após o sucesso. Relatório local: `artifacts/backups/restorecheck-20261009.json`.

## Agendamento na VPS

Unidades `grafica-backup.service` e `grafica-backup.timer` instaladas e habilitadas. Agenda: diariamente às 03h de Brasília, com atraso aleatório de até cinco minutos e execução pendente após indisponibilidade. Bloqueio por `flock` impede execuções simultâneas.

Execução manual em 09/10 às 14h01 de Brasília: sucesso, banco correto. Novo dump `grafica-20261009T170127Z-1620452.dump`. App e PostgreSQL continuaram saudáveis. A geração faz leitura do banco da homologação; não conecta ao Neon de produção.

## Destino fora da VPS

Bucket Cloudflare R2 `grafica-backups` criado, classe Standard, acesso público desabilitado e vazio na conferência. Separado do bucket do app `grafica-homolog-arquivos`.

Envio executado em `infra/grafica/enviar-backup-r2.mjs`: chave única por dump, criação sem sobrescrever, conferência de tamanho, metadado SHA-256 e leitura integral do objeto para confirmar hash.

Formulário preparado com nome `grafica-backups-vps`, leitura/gravação de objetos somente em `grafica-backups`, uso limitado ao IPv4 `5.161.234.21/32`, TTL Sempre. Após o responsável informar que concluiu, a listagem do Cloudflare confirmou o token ativo e restrito ao bucket de backups. As chaves não estavam mais disponíveis na tela e `backup-r2.env` ainda estava ausente na VPS. É necessário obter o arquivo de credenciais salvo pelo responsável antes do primeiro envio. IP e TTL finais não foram reconferidos após a criação pelo responsável.

O responsável forneceu as chaves S3 em imagem, permitindo usar a credencial já criada. Não foi criada outra credencial pelo agente. Instaladas diretamente por SSH em `backup-r2.env`, propriedade root e modo 600; não foram guardadas em arquivo local nem registradas no código. O formulário adicional preparado não foi enviado.

Primeiro envio aprovado às **14h41 de Brasília** (`2026-10-09T17:41:51.135Z`): `postgres/grafica-20261009T151610Z-1598982.dump`, 10.500.120 bytes, SHA-256 idêntico ao dump restaurado no teste. O objeto foi baixado integralmente em memória para conferir tamanho e hash. Foi usado o backup existente, sem refazer o dump nesta validação.

O wrapper diário detecta a credencial instalada e inclui o envio e a conferência ao R2 após gerar o dump. O agendamento permanece diário às 03h de Brasília. A primeira execução agendada completa ainda não ocorreu; a geração local e o envio foram verificados separadamente. Falhas no envio fazem o serviço terminar com erro.

## Pendências

- Observar a primeira execução agendada completa após a instalação da credencial.
- Definir retenção e alertas de falha. Nenhum backup é apagado automaticamente nesta preparação; acompanhar espaço em disco.
- Definir cópia independente dos documentos/imagens do bucket do app e das configurações necessárias à recuperação completa. Este agendamento cobre PostgreSQL.
- Antes do corte: sincronização final dos dados e arquivos da produção atual, janela de corte e plano de retorno.

Não houve alteração da origem no Replit/Neon ou do destino cadastrado no portal NORTE.
