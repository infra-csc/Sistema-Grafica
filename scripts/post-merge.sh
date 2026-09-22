#!/bin/bash
# Roda a cada merge no Replit. NÃO mexe mais no banco: o `db:push` automático
# derrubava o que o schema não declara (sequência, índices de busca, sessões)
# e podia pedir confirmação de perda de dado no meio do merge. Mudança de
# banco agora é a migração aditiva, rodada à mão, conferida antes.
set -e
npm install
echo ""
echo "──────────────────────────────────────────────────────────────────────"
echo " Banco: o merge NÃO aplica mudança de schema."
echo " Se o merge trouxe tabela/coluna/índice novo, rode (é idempotente):"
echo "   node scripts/migracao-aditiva-producao.mjs"
echo " e confira o que ainda falta com:"
echo "   node scripts/checar-drift.mjs"
echo "──────────────────────────────────────────────────────────────────────"
