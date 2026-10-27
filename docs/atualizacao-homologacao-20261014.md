# Atualização da homologação — 14/10/2026

Produção no Replit e destino do portal NORTE preservados. Nenhuma exclusão no storage de origem. Disparos de e-mail desativados.

## Dados e arquivos

- Neon exportado às 14:13:15 UTC em modo somente leitura. Dump `neon-20261014T141315Z-3051741.dump`, 11.094.397 bytes, SHA-256 `065092f35fb90d032adecd4aab97691e9fe80dd5056f38756e4a8f1d4c3a2f46`.
- Nova cópia `grafica_import_20261014`: 51 usuários, 97 eventos, 6.986 peças. Seis migrações aplicadas; nenhum índice ou restrição inválido e nenhuma diferença de estrutura pendente.
- Cópia conectada ao app da VPS. Configuração anterior preservada no diretório privado `infra/backups/config-refresh-20261014` da VPS; bancos anteriores preservados.
- Transferência `infra/transferencias/copia-20261014T1413.jsonl`: 19.239 objetos, 15.228.728.622 bytes de inventário, evento `concluido`, saída zero. Objetos anteriores reutilizados somente após confirmação de versão, tamanho, ETag e metadados; demais objetos com comparação de conteúdo SHA-256.
- Cruzamento final às 14:18:24 UTC: 22 campos, 56.620 valores, 13.538 referências únicas, todas encontradas no R2; zero ausentes; 4.415 referências com miniatura. O relatório é anterior aos uploads sintéticos dos testes.

## Backups

- Banco anterior: `postgres/grafica-20261014T141312Z-3051457.dump`, SHA-256 `e994d657d25049f943e2b74fac27a93f637030610fe953e77a1ab4b7f7a7d85a`.
- Nova cópia: `postgres/grafica-20261014T141440Z-3052583.dump`, 11.095.365 bytes, SHA-256 `7e440c4ddd372bf1335c231b07c58734fe26f867998b62d08401d28212d6522d`.
- Ambos enviados ao bucket privado efetivamente configurado `grafica-backups` e verificados por releitura.
- Timer ativo; execução automática de 14/10 às 06:03:05 UTC concluiu com sucesso. A restauração integral já foi validada na cópia de 09/10; o novo dump de 14/10 ainda precisa de seu próprio ensaio de restauração.

## Validação funcional

Teste `validar-fluxos-20261014.mjs`, execução `cfe61e53-fa55-4ef8-ae32-7682ee5d7297`, 28 verificações aprovadas. Perfis admin, solicitação, arte, atendimento, gráfica, kit e cultura; pedidos; arte; aprovação; revisão final; produção parcial e total; conferência; embalagem e entrega. JPEG, PNG e PDF com bytes idênticos após download; miniatura WebP; bloqueio de acesso anônimo, HTML disfarçado e arquivo de peça alheia ao Kit.

Registros sintéticos limpos ao final; usuários/eventos/peças voltaram a 51/97/6.986. Relatório privado `infra/migration/atualizacao-20261014/flow-validation.log` na VPS. O teste usa sessões controladas; não confirma uma nova autenticação interativa Microsoft no navegador.

## Antes da troca

Validar novamente login Microsoft real; ensaiar restauração do novo backup; revisar avisos por e-mail antes de ativar; combinar a janela de interrupção de alterações na origem; sincronizar o delta final; só então alterar o destino do portal mediante autorização. Não operar simultaneamente os dois bancos como produção.
