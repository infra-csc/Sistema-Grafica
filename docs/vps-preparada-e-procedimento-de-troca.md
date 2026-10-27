# VPS preparada e procedimento de troca

## Restrição do responsável

**Manter Replit ativo. Desativar somente após autorização explícita do responsável.** Preparação, conferências, cópias e testes na VPS não autorizam mudar o destino no portal NORTE, interromper a origem ou realizar a troca de produção.

## Estado conferido em 09/10/2026, 14h50 de Brasília

- VPS `5.161.234.21`, SSH porta 2222. Infraestrutura: `/home/marcosvinicius/grafica-homolog/infra`.
- App `https://grafica.appsnorte.com`, imagem `grafica-homolog:20261009-visual`, saudável. Caddy ativo, configuração validada.
- PostgreSQL saudável; app conectado à cópia `grafica_import_20261008`: 51 usuários, 96 eventos, 6.681 peças, seis migrações, zero índices inválidos.
- App e PostgreSQL publicados somente em loopback nas portas 5000 e 5432. Reinício automático `unless-stopped`; app com sistema de arquivos somente leitura e limite de 512 MiB; banco com limite de 384 MiB.
- Bucket privado do app `grafica-homolog-arquivos`, leitura confirmada. Microsoft configurado, página HTTPS de login com resposta 200, identidade anônima recusada com 401. Isto não repete a autenticação Microsoft real.
- E-mails e digests continuam desligados na homologação.
- Backup diário às 03h de Brasília, atraso de até cinco minutos, destino privado `grafica-backups`. Credencial instalada, root/modo 600. Primeiro envio validado por download integral e hash; restauração do mesmo dump já aprovada nas 36 tabelas. A primeira execução diária completa ainda não ocorreu.
- Disco: 27 GiB disponíveis, 26% utilizado. RAM disponível: aproximadamente 907 MiB; sem swap. Esta conferência não equivale a teste de carga.

Conferência reproduzível, somente leitura: `infra/grafica/conferir-vps-preparada.mjs`. Resultado: `artifacts/vps-preparada-20261009.json`.

Configuração preservada em `/home/marcosvinicius/grafica-homolog/infra/backups/config-preparacao-20261009T175128Z`: ambientes, Compose, Caddy e identificação das imagens. Diretório root/modo 700; arquivos privados modo 600. Contém segredos: não publicar nem anexar ao código. Ainda é cópia somente na VPS.

## Procedimento aguardando autorização de produção

1. Definir janela e quem passará a gravar na VPS. Enquanto a origem recebe alterações, novas cópias são ensaios, não sincronização final.
2. Na janela autorizada, organizar a pausa de novas operações na origem e aguardar uploads/operações em andamento. Não desligar Replit como parte implícita dessa pausa.
3. Exportar Neon somente para leitura com `exportar-neon.sh`. Restaurar em **novo banco isolado**, preservando a cópia atual e backups; aplicar e conferir migrações exclusivamente na nova cópia. Preservar dados de negócio, sem reutilizar sessões e tokens temporários.
4. Reconsultar os objetos da origem e transferir diferenças ao R2. Tokens temporários podem precisar ser renovados. Conferir alterações de conteúdo/metadados além de arquivos novos; a igualdade do nome não garante igualdade do arquivo. Não remover objetos da origem.
5. Cruzar os campos de arquivos do novo banco com R2, exigindo zero referências ausentes. Validar tamanho/hash e permissões dos objetos transferidos, incluindo legados e miniaturas.
6. Preservar configuração e backup antes da mudança. Somente com autorização, apontar app ao novo banco, recriar apenas o container do app e conferir HTTPS, Microsoft, permissões, pedidos, artes, produção, entrega e arquivos.
7. Alterar destino de portal/entrada e liberar uso real somente quando autorizado. Evitar operação real simultânea em dois bancos independentes.
8. Replit permanece ativo mesmo após a mudança de entrada, até ordem explícita para desativá-lo.

## Retorno

Antes de liberar operações reais na VPS, preservar a entrada na origem e recolocar o app da VPS no banco e imagem anteriores. Não apagar volumes, bancos, dumps ou arquivos durante esse retorno.

**Depois que usuários gravarem na VPS**, voltar ao Replit/Neon sem reconciliar as novas operações perderia essas alterações. Pausar operações, guardar backup do destino, apurar e reconciliar a diferença antes de decidir o retorno. O banco anterior não é réplica automática da VPS.

## Pendências antes da operação definitiva

- Sincronização final, janela e autorização da troca.
- Retenção, alertas de falha e conferência da primeira execução diária completa.
- Cópia independente dos documentos/imagens e configuração recuperável fora da VPS.
- Resend configurado com chave carregada e remetente atual `sistemagrafica@nortemkt.com`, domínio verificado em 09/10. Teste para Marcos com remetente anterior `grafica@nortemkt.com` autorizado e confirmado como entregue às 15h01. Falta autorização de ativação e conferência dos destinatários do app; disparos continuam desligados. Detalhes em `resend-configurado-20261009.md`.
- Capacidade sob carga e fluxos/telas fora da cobertura de homologação documentada.

Relatórios: `homologacao-dados-copiados-20261009.md`, `validacao-visual-20261009.md` e `backup-restauracao-20261009.md`.
