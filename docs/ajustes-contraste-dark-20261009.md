# Correção de contraste do modo escuro

Solicitação: retirar fundos brancos em Vincular Patrocinadores, Modelos e Histórico; corrigir hover dos Modelos; suavizar verde na Gráfica.

Causa: `T.low` (`#f3f4f3`) faltava no mapeamento de superfícies legadas. Hover dos Modelos interpolava o hexadecimal de `T.bg` em uma regra CSS. Correção: `T.low` usa o mesmo cinza das superfícies secundárias no escuro, e o hover usa `var(--n2)` em ambos os temas. Verde passa a fundos `#2d3933` / `#2c3834`, bordas `#4c6656` / `#47665b` e textos `#b0d1bb` / `#a8cbbd` no escuro. Fotos e artes preservadas.

Build Vite aprovado. Validação no navegador: cabeçalho Blue Run Santos da vinculação corrigido; Modelos sem superfície clara, hover real de 2x1 Bravus confirmado em `rgb(50,53,59)`; Histórico sem fundos brancos nos filtros e cabeçalho. Imagens da conferência em `artifacts/dark-*-corrigido-20261009.jpg`.

Publicação de frontend `grafica-homolog:20261009-dark-coherence`; app e PostgreSQL saudáveis. Backup do compose: `infra/backups/config-dark-coherence-20261009T190911Z/compose.app.yaml` na VPS. Arquivo enviado SHA256 `7d9a47d39e551cc0c650f50ecbee7607a6ea6bba98d23b9fd402b5608f008d45`. Replit permanece ativo.
