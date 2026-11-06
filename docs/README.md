# Documentação do Sistema Gráfica

Comece pelo [README da raiz](../README.md): o que o app é, os perfis, o caminho
da peça e como rodar na sua máquina.

## Referência (vale hoje)

| Documento | Assunto |
| --- | --- |
| [operacao-producao.md](operacao-producao.md) | **Onde e como a produção roda**: VPS, Caddy, Compose, R2, e-mail, login, publicação, rollback, backups |
| [../infra/grafica-dev/README.md](../infra/grafica-dev/README.md) | Ambiente DEV/staging (`devgrafica.appsnorte.com`) e o deploy automático da branch `dev` |
| [integracao-checklist.md](integracao-checklist.md) | Integração com o Checklist de Arena: token, rotas, troca do token |
| [arquitetura.md](arquitetura.md) | Camadas, `shared/`, autenticação, tempo real, caches, agendadores, uploads, segurança |
| [estados-da-peca.md](estados-da-peca.md) | Status da peça: quem move, de onde, para onde |
| [login-microsoft-direto.md](login-microsoft-direto.md) | Como funciona o botão "Entrar com Microsoft" e o que configurar no Entra ID |
| [acesso-pgadmin.md](acesso-pgadmin.md) | Abrir o banco da VPS pelo pgAdmin, via túnel SSH |
| [../e2e/README.md](../e2e/README.md) | Testes de ponta a ponta (Playwright) |
| [../.env.example](../.env.example) | Todas as variáveis de ambiente, uma por uma |
| [../client/src/components/ui/LEIA-ME.md](../client/src/components/ui/LEIA-ME.md) | Componentes de interface |
| [../design_guidelines.md](../design_guidelines.md) | Diretrizes visuais |

## Histórico (registro do que foi feito, com data)

Estes documentos descrevem o estado **na data em que foram escritos**. Ficam
aqui como registro e para consulta de detalhes, mas não descrevem a produção de
hoje — para isso, use a tabela acima.

**Migração Replit/Neon → VPS Hetzner (07/10 a 26/10/2026)**

| Documento | Data | Assunto |
| --- | --- | --- |
| [revisao-tecnica-migracao-vps.md](revisao-tecnica-migracao-vps.md) | 07/10 | Revisão do código e plano da migração |
| [desvinculacao-replit.md](desvinculacao-replit.md) | 07/10 | Etapa 2: código independente do Replit (`pg` por TCP, Resend direto) |
| [homologacao-vps.md](homologacao-vps.md) | 07–09/10 | Primeira publicação em `grafica.appsnorte.com` |
| [configuracao-r2-email.md](configuracao-r2-email.md) | 07/10 | Etapa 3: buckets e credenciais no Cloudflare R2 |
| [plano-copia-storage-r2.md](plano-copia-storage-r2.md) | 08/10 | Cópia dos arquivos do storage do Replit para o R2 |
| [copia-banco-20261008.md](copia-banco-20261008.md) | 08/10 | Primeira cópia do banco Neon |
| [migracao-login-microsoft.md](migracao-login-microsoft.md) | 08–09/10 | Mapeamento do login Microsoft → Portal → Gráfica |
| [validacao-sso-vps-20261009.md](validacao-sso-vps-20261009.md) | 09/10 | Validação do SSO do portal na VPS |
| [homologacao-dados-copiados-20261009.md](homologacao-dados-copiados-20261009.md) | 09/10 | Homologação com dados copiados |
| [backup-restauracao-20261009.md](backup-restauracao-20261009.md) | 09/10 | Backup no R2 e teste de restauração |
| [resend-configurado-20261009.md](resend-configurado-20261009.md) | 09/10 | Domínio e remetente no Resend |
| [vps-preparada-e-procedimento-de-troca.md](vps-preparada-e-procedimento-de-troca.md) | 09/10 | Procedimento de troca e de retorno |
| [validacao-visual-20261009.md](validacao-visual-20261009.md) | 09/10 | Conferência visual na VPS |
| [atualizacao-homologacao-20261014.md](atualizacao-homologacao-20261014.md) | 14/10 | Segunda atualização da homologação |
| [validacoes-pre-migracao-20261026.md](validacoes-pre-migracao-20261026.md) | 26/10 | Validações do dia do corte |
| [historico-replit.md](historico-replit.md) | — | Como o app era publicado no Replit |
| [../infra/grafica/README.md](../infra/grafica/README.md) | 07–09/10 | Preparação inicial da VPS |
| [../infra/grafica/REMOCAO-HOTSITES.md](../infra/grafica/REMOCAO-HOTSITES.md) | 07/10 | Remoção dos hotsites antigos da VPS |
| [../infra/grafica/DIAGNOSTICO-SSH.md](../infra/grafica/DIAGNOSTICO-SSH.md) | 07/10 | Porta 22 sem resposta; SSH na 2222 |

O corte para a VPS aconteceu em **26/10/2026** (banco final
`grafica_producao_20261026b`). Replit e Neon ficaram pausados.

**Ajustes visuais (09/10/2026)**

[modo-escuro-20261009.md](modo-escuro-20261009.md) ·
[ajustes-contraste-dark-20261009.md](ajustes-contraste-dark-20261009.md) ·
[logo-grafica-20261009.md](logo-grafica-20261009.md) ·
[favicon-grafica-20261009.md](favicon-grafica-20261009.md)

**Dados**

[medidas-divergentes.md](medidas-divergentes.md) — correção das medidas em 21/08/2026.

## Como manter

* Mudou a operação (servidor, deploy, backup, variável)? Atualize
  [operacao-producao.md](operacao-producao.md) no mesmo commit.
* Registro de um trabalho pontual (migração, validação) leva a data no nome do
  arquivo e entra na seção "Histórico" acima.
* Nunca escreva senha, chave, token ou `DATABASE_URL` real em documento.
