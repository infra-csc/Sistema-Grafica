# Modo escuro — 09/10/2026

Opção de tema claro/escuro no cabeçalho e no login. Preferência local persistida no navegador e sincronizada entre abas. Inicialização antes da montagem do React, com tolerância a armazenamento bloqueado.

A pedido do usuário, o fundo usa cinza carvão `#292c32`, próximo ao menu lateral. Superfícies `#2c2f35`, linhas alternadas `#32353b` e bordas `#484c54`. A logo fica branca no tema escuro; fotos e artes não recebem filtros. Cores das constantes usadas em cálculos e exportações permanecem intactas; compatibilidade das telas legadas fica em `client/src/styles/color-mode.css`.

Validação: TypeScript e build Vite aprovados; três testes de persistência/armazenamento aprovados. Navegador: Painel Geral, Eventos, Gráfica e Revisão Final conferidos; alternância entre claro e escuro confirmada, preferência mantida após recarregar, tabelas sem fundo branco e miniaturas carregadas sem filtros.

Publicação somente do frontend: `grafica-homolog:20261009-dark-charcoal`. App e PostgreSQL saudáveis. SHA256 do backend permanece `ed2b6d20a87925d73a2ef11750c3558d6cc40b43bc44c30cf565e051220f78d4`.

Arquivo transferido: `grafica-frontend-dark-charcoal-20261009.tar.gz`, SHA256 `9c8ac22c2333767025e408463fdcb7d3b5d92d3372eb0ac8c92bed325eafbaa4`.

Compose anterior: `/home/marcosvinicius/grafica-homolog/infra/backups/config-dark-charcoal-20261009T190120Z/compose.app.yaml`. Imagens anteriores preservadas para reversão. Replit permanece ativo; banco de homologação e flags de e-mail mantidos.

