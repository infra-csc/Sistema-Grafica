#!/bin/bash
# Roda a cada merge no Replit. NÃO mexe mais no banco: o `db:push` automático
# derrubava o que o schema não declara (sequência, índices de busca, sessões)
# e podia pedir confirmação de perda de dado no meio do merge. Mudança de
# banco agora é migração versionada (migrations/), rodada à mão, conferida antes.
set -e
npm install
echo ""
echo "──────────────────────────────────────────────────────────────────────"
echo " Banco: o merge NÃO aplica mudança de schema."
echo " Se o merge trouxe arquivo novo em migrations/, veja o que falta e aplique:"
echo "   npm run db:migrate                # simulação"
echo "   npm run db:migrate -- --aplicar"
echo " Banco ainda não adotado? Antes, uma vez: node scripts/migracao-aditiva-producao.mjs"
echo " e a adoção (README -> Banco e migrações -> Adoção)."
echo "──────────────────────────────────────────────────────────────────────"
