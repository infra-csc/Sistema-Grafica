# Validação visual — Replit versus VPS — 09/10/2026

**Resultado revisado: colunas do Painel e da Revisão equivalentes na mesma largura; ajuste da fila da Gráfica aplicado e validado na homologação.** A comparação inicial confundiu mudanças responsivas com diferenças de versão. Não se afirma igualdade pixel a pixel nem cobertura integral do app.

Origem: https://print-flow-manager-infraestrutura2.replit.app/.
Destino: https://grafica.appsnorte.com/.
Mesmo usuário nos dois ambientes: Marcos Meira, perfil Solicitação.

Critério do responsável: telas idênticas ao app atual, exceto login Microsoft direto já solicitado. Inspeção pelo Chrome, com leitura de conteúdo renderizado, tabelas, controles e capturas visuais. Nenhum formulário foi enviado, nenhuma aprovação/produção foi acionada e nenhum arquivo foi enviado ou excluído.

## Correção da comparação e diferença de versão

| Tela | Replit atual | VPS | Ajuste necessário |
| --- | --- | --- | --- |
| Painel Geral | Na largura 1536, ID, descrição, medidas e patrocinador separados | Mesmas colunas na largura 1536 | Nenhuma correção de colunas necessária; observação anterior retirada |
| Revisão Final | Na largura 1536, coluna `Qtd · Dim · m²` | Mesma coluna na largura 1536 | Nenhuma correção de colunas necessária; observação anterior retirada |
| Gráfica | Eventos finalizados ocultos por padrão; botão `Mostrar eventos realizados` permite consulta | Usava regra anterior, mantendo finalizados à vista | Portado o ajuste de 08/10, lido no código do editor PrintFlowManager; filtro de Travadas preservado |

As capturas iniciais tiveram viewports diferentes: origem 1440×900 e destino 1536×730. Isso também explica as colunas agrupadas: o código adapta a tabela ao espaço útil. Na reconferência, origem 1536×730 e destino 1536×674 mostraram as mesmas colunas no Painel e na Revisão. A altura ainda difere; **não se afirma igualdade pixel a pixel**.

O título no cabeçalho superior apareceu em diferentes momentos do carregamento e navegação. A observação inicial de título ausente na VPS não deve ser tratada como diferença permanente sem uma comparação específica do comportamento do cabeçalho.

## Cobertura

| Tela/área | Resultado da inspeção |
| --- | --- |
| Painel Geral | Mesmas colunas na reconferência em largura 1536; acusação inicial de defeito retirada |
| Eventos | Mesmos controles, filtros e organização de cartões observados; números diferentes |
| Gestão de Prazos | Mesmos indicadores, blocos e modos de visualização observados; diferenças de dados e pequeno ícone de atualização |
| Calendário | Mesma organização mensal, legenda e controles; 100 marcações na origem e 97 na cópia |
| Vincular Patrocinadores | Mesmos passos, filtros, agrupamento e estrutura de tabela; estados pendente/enviado diferentes |
| Revisão Final | Mesmas colunas na reconferência em largura 1536; acusação inicial de defeito retirada |
| Gráfica | Filtro de realizados portado da origem e validado na VPS: ocultação inicial, consulta, totais e persistência na URL |
| Máquinas da Gráfica | Mesmos cartões de quatro impressoras e abas Agora, Diário e Resumo observados; ocupação e diário diferentes |
| Solicitação de peças | Mesmos filtros e estado vazio; totais diferentes |
| Modelos | Mesmas colunas e catálogo de 84 modelos; uso dos modelos diferente |
| Histórico | Mesmos filtros, colunas e apresentação geral; registros e totais diferentes |
| Versões aprovadas | Mesmas abas, indicadores e controles renderizados observados; contagens diferentes. Não foram examinadas todas as versões/books |
| Registros | Mesmos filtros, cartões e visualizador de conferência observados; registros recentes e estado de embalagens diferentes |
| Patrocinadores | Mesmas colunas e filtros; 184 cadastros na origem e 183 na cópia |
| Detalhes de evento | Conferido `Memorias do Pequeno Chef` nos dois ambientes: mesmos 22 itens, agenda operacional, Kit e estrutura da lista |
| Novo Evento | Modal aberto e fechado sem preencher/salvar: mesmos campos e opções de prioridade, datas, prazos e patrocinadores |
| Adicionar peça | Entrada Rápida aberta e fechada sem salvar: mesmas colunas, medidas, material, acabamento e opções por linha |
| Visualizador de foto | Mesma conferência #6308 aberta nos dois ambientes; mesmos controles e original carregado com 1600×1205 |

Foto conferida: `/objects/uploads/1a8d6d7f-6c0c-4a4e-bdee-9d7f7032c97e`. O carregamento do original foi confirmado pelo elemento de imagem renderizado (`complete=true`, largura natural 1600, altura natural 1205). A leitura inicial da miniatura ocorreu durante carregamento e não foi usada como prova de falha de armazenamento.

## Diferenças de dados e observação adicional

A origem continua recebendo trabalho; a VPS usa a cópia de 08/10. Contagens, itens visíveis, fotos recentes, status e notificações não precisam coincidir nesta etapa, mas terão de ser sincronizados antes do corte. A causa exata de cada diferença numérica não foi investigada nesta validação visual.

O Histórico da VPS ainda exibe entradas identificadas com `TESTE HOMOLOG 0272c347...`, mesmo após a remoção dos usuários/eventos/peças de teste. Portanto, as contagens e os arquivos de teste voltaram à base anterior, mas **não houve remoção integral de todos os rastros históricos**. Este achado corrige a interpretação ampla de limpeza do relatório funcional. Nenhum registro histórico foi removido nesta conferência.

## Limites e encaminhamento

Esta é uma inspeção visual das telas disponíveis ao perfil Solicitação e de dois formulários. Não inclui todas as abas, menus, estados, tamanhos de tela ou interfaces exclusivas de Admin, Arte, Kit, Cultura e Atendimento. Também não envolve ações de gravação em produção.

Código da alteração de 08/10 consultado em https://replit.com/@infraestrutura2/PrintFlowManager, sem editar, salvar ou republicar. Portado o comportamento de `realizados` em `grafica-filtros.ts`, `use-fila-da-grafica.ts` e `barra-de-filtros.tsx`: ocultação inicial, totais/facetas derivados da mesma base, contador de ocultos, consulta por botão/URL e revelação de peça finalizada em links de notificação. Login Microsoft e R2 preservados.

Checagem TypeScript aprovada, 44 testes de filtros aprovados, compilação Vite aprovada. Imagem implantada: `grafica-homolog:20261009-visual`. Backend `dist/index.js` idêntico ao da imagem anterior. Backup da configuração: `/home/marcosvinicius/grafica-homolog/infra/backups/config-visual-20261009T150818Z`. Imagem anterior preservada.

## Conferência após implantação

Chrome, Marcos Meira/Solicitação, https://grafica.appsnorte.com/grafica. Filtro inicialmente desligado: 1.266 peças no total da fila e 825 não entregues em 23 eventos; Primavera Porto Alegre oculto. Ao ligar: 3.308 no total e 826 não entregues em 24 eventos; selo de 2.042 finalizadas e Primavera Porto Alegre presentes. Recarga manteve `?realizados=1` e `aria-pressed=true`; ao desligar, voltou ao estado inicial. O botão Travadas permanece porque há uma peça travada na cópia; sua presença condicional também existe no código atual da origem.

| Verificação | Resultado |
| --- | --- |
| Identidade da página e conteúdo renderizado | Aprovado |
| Ausência de overlay de erro do framework | Aprovado |
| Filtro ligado/desligado e URL após recarga | Aprovado |
| Captura visual do estado final | Registrada em `artifacts/grafica-vps-alinhada-20261009.jpg` |
| Saúde da aplicação | Container healthy; HTTP local 200 |
| Console | Sem novo erro de aplicação observado após a recarga; havia erro WebSocket no instante da recriação do container e mensagens de canal assíncrono compatíveis com extensão do navegador |

Dimensões temporárias de teste restauradas. Nesta rodada não houve reconferência de interfaces exclusivas de outros perfis ou de todos os tamanhos de tela. Os números diferentes da origem permanecem sujeitos à sincronização final dos dados.
