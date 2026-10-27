# Validações antes da migração — 26/10/2026

Janela solicitada: 14h30 de Brasília. Nenhuma troca do portal ou alteração no Replit realizada nesta etapa. App continua na cópia `grafica_import_20261014`; os dados de hoje estão separados em `grafica_import_20261026`.

## Aprovado

- App e PostgreSQL saudáveis; backup automático de hoje concluído com sucesso, 26 GB livres na VPS.
- Backup atual da homologação: `postgres/grafica-20261026T140114Z-2443020.dump`, 11.124.938 bytes; SHA-256 `aec4012231e145fa4d33e944be088c8bceb8d767e7e1220defb22f8706713dd1`. Upload e releitura no bucket privado `grafica-backups` aprovados.
- Restauração desse backup em `grafica_restorecheck_20261026`: todas as 36 tabelas idênticas em contagem e hash de registros.
- Configuração Microsoft presente; início OAuth retorna 302 para Microsoft, callback esperado, PKCE S256, state e nonce presentes. A autenticação interativa de uma conta ainda depende de confirmação no navegador.
- Login HTTPS 200; identidade anônima 401; leitura no R2 aprovada; e-mails continuam desligados.
- 28 verificações funcionais da versão atual aprovadas, incluindo sete perfis, pedidos, arte, aprovação, produção, conferência, embalagem, entrega, JPEG/PNG/PDF, miniatura e restrições de acesso. Execução `4b69c9d8-1c9a-4e38-9e8d-68135fbfd0b4`; limpeza concluída; contagens voltaram a 51 usuários, 97 eventos e 6.986 peças. Esses testes não validam as funcionalidades novas do Replit.

## Pendências detectadas no início da conferência (histórico)

- Exportação somente leitura do Neon às 14:02:23 UTC: `neon-20261026T140223Z-2444047.dump`, 12.923.484 bytes; SHA-256 `951d9b2238b80cba0742d08612fb3ce64088ac4337fff61c7e086e552e4bcd4a`.
- Cópia restaurada de hoje: 55 usuários, 118 eventos, 8.323 peças e **nove migrações**. O código da VPS conhece seis; a checagem interrompeu antes de executar migrações nessa cópia. Não contornar essa verificação.
- Comparação de colunas com a cópia anterior: novas tabelas `auditorias_do_book` e `operadores`, campos `items.obs_reaproveitamento` e `items.origem_reaproveitamento`; nenhuma coluna anterior removida ou modificada. Metadados não permitem deduzir toda a implementação das funcionalidades novas.
- Cruzamento somente leitura: 23 campos, 64.419 valores, 15.785 referências únicas ao storage; 13.537 encontradas e **2.248 ausentes no R2**. R2 tem 19.239 objetos. É necessário renovar o token da origem e copiar os arquivos recentes. O inventário pode crescer até a pausa final de uso.
- Banco de hoje preservado também em `postgres/grafica-20261026T140507Z-2445628.dump`, 12.924.365 bytes, SHA-256 `0b3fb7f1f67c0a39d3992b82082ac21a20db8cf4f00a98c802cd2d2046388426`; releitura no R2 aprovada. Esse dump novo ainda não passou em seu próprio ensaio de restauração; o ensaio acima foi do banco ativo da homologação.

## Para liberar a troca (estado atual)

Alinhamento do código, migrações, sincronização antecipada, testes funcionais, confirmação do login Microsoft e ensaio de restauração concluídos. Na janela das 14h30 de Brasília: pausar alterações na origem, exportar uma nova cópia isolada para o delta final (não sobrescrever a cópia já validada), aplicar as migrações compatíveis, sincronizar o delta do storage, conferir referências e validar o banco final antes de trocar as entradas. Não desativar Replit sem autorização nem liberar dois bancos para escrita de produção simultaneamente.

Mapear o endereço da integração no app Checklist e trocar sua origem na mesma janela. Repositório fornecido `infra-csc/Checklist-Arena-Workspace` retornou 404 via conector GitHub e clone, e não apareceu na busca da instalação; acesso/leitura ou endereço corrigido ainda pendente. Conferência visual no navegador permanece pendente porque Computer Use foi interrompido por não conseguir identificar a URL atual. E-mails e arquivamento automático continuam desligados na homologação; sua ativação na produção deve ser tratada na virada. Nenhum PDF real foi enviado à API de IA durante os testes.

## Atualização durante a preparação

- Usuário confirmou entrada real pelo Microsoft na VPS.
- Repositório fornecido: `infra-csc/Sistema-Grafica`, commit `71746f5b8e61df52ea402c8321e1a5957ee0ea25`. Base identificada por comparação de conteúdo: `d90b5f6216935b1ed375effef84f8325d46f19f9` (1.001 arquivos iguais entre 1.048 comparados).
- Alterações recentes incorporadas por comparação de três versões em 432 arquivos. Seis conflitos resolvidos preservando logo, favicon e título da VPS e adotando as regras atuais da fila. Backups e relatório locais em `.cache/merge-upstream-20261026/`. R2, Microsoft, Resend e modo escuro preservados.
- TypeScript sem erros; builds frontend e backend aprovados. Testes selecionados em duas rodadas: 361 aprovados, 33 pulados (dependências de integração local indisponíveis). Primeira execução no sandbox não chegou a rodar casos por EPERM na renomeação de temporários do Vitest; execução fora dessa restrição passou.
- Nova imagem `grafica-homolog:20261026-integrada`. Pacote `grafica-release-20261026.tar.gz`, SHA-256 `3f38c9b91dc005b77950705eaf3fc08bf06a90e1d841e62b9e997ee40aa1eb39`.
- Repositório tem dez migrações, incluindo `0009_juntar-remessas-do-kit` ainda pendente na exportação de produção. Aplicada somente na cópia `grafica_import_20261026`. Dez migrações registradas, sem diferença de estrutura, índice inválido ou restrição inválida; 55/118/8.323 usuários/eventos/peças preservados.
- Backup da cópia preparada: `postgres/grafica-20261026T141837Z-2449910.dump`, 12.925.007 bytes, SHA-256 `002eddff8f3ae27815a165daab2d364b5b9cc74ae122e2e3527d2d6defd2059d`. Releitura no R2 aprovada e restauração em `grafica_restore_integrada_20261026` conferida: **38 tabelas idênticas**.
- As duas configurações de integração foram recebidas e gravadas no arquivo protegido da VPS, com backup anterior. Consulta somente leitura de modelos na API oficial Anthropic retornou 200, com o modelo configurado disponível; nenhum PDF enviado nessa verificação. Checklist passou na validação funcional da nova imagem descrita abaixo.
- Todas as 27 auditorias existentes na cópia estavam concluídas antes da inicialização planejada; nenhuma auditoria pendente para retomar.
- Conferência visual via Computer Use interrompida pela ferramenta por não identificar com confiança a URL atual do Chrome. Nenhuma ação nas abas efetuada; não substitui validação visual no navegador.
- Sincronização de storage concluída, relatório privado `transferencias/copia-20261026T1407.jsonl`, lote de 23.953 objetos e 16.662.948.541 bytes. 19.237 objetos anteriores reutilizados após conferir suas versões/metadados; demais objetos conferidos com hash de conteúdo. Apenas origem lida e destino R2 gravado; nenhum objeto de origem apagado.

## Resultado final da preparação — 11h33 de Brasília

- Conferência independente de LIST R2 contra o relatório: 23.953 objetos, nenhum ausente, divergente ou extra, totais de bytes e chaves coincidentes.
- Cruzamento banco/R2: 15.785 referências únicas, todas encontradas; 6.750 com miniatura.
- Homologação publicada na imagem `grafica-homolog:20261026-integrada`, banco `grafica_import_20261026`. Configuração anterior preservada no diretório privado `infra/backups/config-validacao-integrada-20261026` da VPS. Nenhuma mudança no portal ou Replit.
- 30 verificações funcionais contra PostgreSQL e R2 reais aprovadas, execução `77dd0fe8-3d43-4b68-8771-07d5833bc23f`: fluxo completo anterior mais token de leitura do Checklist, rejeição sem token, cadastro de operador por admin, criação de PIN seguro, saída, reentrada e rejeição de PIN incorreto. Registros sintéticos limpos ao final; contagens de usuários/eventos/peças antes e depois idênticas (55/118/8.323).
- Saúde e configuração ativas aprovadas: dez migrações, zero índices inválidos, login HTTPS 200, identidade anônima 401, R2 acessível, Microsoft configurado e e-mails desligados.
- Backup após a publicação/testes: `postgres/grafica-20261026T143303Z-2454973.dump`, 12.925.701 bytes, SHA-256 `5b5e6b849801965111614ed2e6b93b2bed55976be8c07e6aa892e5821a589bd8`; envio e releitura no R2 aprovados. O ensaio de restauração de 38 tabelas foi realizado com o backup anterior, das 14:18:37 UTC, antes dos testes sintéticos.
- Arquivamento automático desativado explicitamente via `ARQUIVAMENTO_AUTOMATICO_ENABLED=false` na homologação para evitar arquivamento de dados copiados durante a preparação.
