# Homologação com os dados copiados — 09/10/2026

Ambiente: https://grafica.appsnorte.com. Banco ativo: `grafica_import_20261008`, cópia do Neon. Imagem atual: `grafica-homolog:20261009-visual` (frontend alinhado; backend preservado). Armazenamento: bucket privado R2 `grafica-homolog-arquivos`.

## Checklist

- [x] Conectar o app da VPS ao banco `grafica_import_20261008`.
- [x] Testar sessões, perfis e os fluxos de pedidos, artes, aprovação, produção e entrega pelas APIs reais da homologação.
- [x] Validar leitura e upload de JPEG, PNG e PDF, e geração/leitura de miniatura WebP pelo app e R2.

## Evidências

Execução aprovada: `0272c347-b8e9-4667-9a08-c05e3e75e5ae`, resultado `OK`, código de saída 0. Script: `infra/grafica/validar-fluxos-homolog.mjs`.

- Sessões e identidade conferidas para Admin, Solicitação, Arte, Atendimento, Gráfica, Kit e Cultura. A administração de usuários ficou restrita ao Admin. Solicitação e Cultura puderam criar eventos; os demais perfis testados foram recusados.
- Atendimento criou um pedido e Solicitação criou a peça e vinculou o atendimento. Restrições entre perfis foram exercitadas.
- Arte foi submetida, aprovada pelo patrocinador e encaminhada à revisão final. O próprio perfil Arte não pôde executar as aprovações reservadas a outros perfis.
- Estados persistidos no PostgreSQL: `awaiting_submission` → `awaiting_sponsor_approval` → `sponsor_approved` → `awaiting_final_review` → `ready_for_production` → `inProduction` → `produced` → `conferred` → `packed` → `delivered`.
- Produção parcial e total, conferência com foto, embalagem e entrega do volume foram concluídas. Foram produzidas e entregues 10 unidades. Impressão sem máquina e conferência sem foto foram recusadas.
- JPEG, PNG e PDF foram enviados e baixados pela aplicação com igualdade de bytes, existência confirmada no R2 e acesso anônimo recusado. Miniatura WebP foi servida pelo app e persistida junto ao original no R2.
- PNG declarado como PDF foi identificado corretamente pelos bytes e servido como PNG. HTML disfarçado de PNG foi recusado.
- Kit não conseguiu ler um arquivo de peça alheia, inclusive pela rota de miniatura.

O login Microsoft real já havia sido validado no navegador com a conta existente de Marcos Meira, perfil Solicitação; a navegação e fotos dos registros também foram observadas. Os testes adicionais de perfis deste relatório usaram sessões SSO sintéticas e APIs HTTPS, sem simular uma autenticação Microsoft de cada usuário.

## Isolamento e limpeza

Backup anterior aos testes: `/home/marcosvinicius/grafica-homolog/infra/backups/pre-homologacao-20261009T142757Z.dump`.

O script exige o banco de cópia e notificações/digests desligados. Criou usuários, eventos, pedido, peça e arquivos identificados como testes, e removeu somente seus próprios registros e objetos. Um par original/miniatura deixado por uma tentativa inicial foi identificado pela janela de criação e pela igualdade dos bytes da imagem sintética antes da remoção.

Contagens antes e após a execução: **51 usuários, 96 eventos e 6.681 peças**. Limpeza final confirmada pelo script. Os testes não alteraram o banco de produção Neon, objetos de origem no Replit nem o destino do portal NORTE.

Conferência final somente de leitura em `2026-10-09T14:36:17.081Z`: 22 campos examinados, 54.024 valores, **12.853 referências ao bucket encontradas de 12.853**, zero ausentes, 3.671 referências com miniatura disponível e **17.768 objetos no R2**. A contagem de objetos voltou ao total anterior aos testes.

## Limites e próximos passos

Esta etapa verifica os fluxos selecionados pelas APIs e persistência real. Kit foi validado em sessão e bloqueio de acesso a peça alheia; seu fluxo próprio completo não foi exercitado. Teste de carga não foi realizado.

Critério visual definido pelo responsável: manter as telas idênticas à versão atual publicada no Replit, exceto a alteração já solicitada de login Microsoft direto. A comparação será técnica entre os ambientes; não depende de uma rodada de aceitação por outra equipe.

Validação visual revisada em 09/10: as colunas do Painel Geral e da Revisão Final coincidem na mesma largura. A comparação inicial foi afetada por viewports diferentes. A divergência real no filtro de eventos realizados da Gráfica foi portada da alteração de 08/10 e implantada na homologação. Cobertura, reconferência, limitações e rastros históricos de testes estão no [relatório visual](validacao-visual-20261009.md).

As acusações iniciais de diferença estrutural de colunas foram retiradas após a reconferência na largura 1536. O título foi observado durante carregamentos diferentes, sem comprovar defeito permanente. Contagens/notificações diferem entre a origem ativa e a cópia. A aprovação dos testes de API não equivale à igualdade visual integral. Nenhum arquivo do projeto Replit foi modificado nesta conferência.

Antes da entrada em produção, ainda é necessária a sincronização final do banco e dos arquivos criados desde a cópia, a validação operacional de backups/restauração e a programação do corte. A produção atual continua recebendo alterações no Replit.
