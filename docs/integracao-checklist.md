# Integração com o Checklist de Arena

O **Checklist de Arena** é outro app (repositório `infra-csc/checklist-arena-workspace`).
Na montagem do evento ele confere, peça a peça, o que a Gráfica entregou. Para
isso ele **lê** a Gráfica por HTTPS, com um token, e pode pedir **reposição**
de uma peça que chegou faltando ou avariada.

O contrato completo das rotas (campos de cada resposta, códigos de erro, regra
de "peça da Arena entregue") está em
[arquitetura.md → Integração com o Checklist de Arena](arquitetura.md#integração-com-o-checklist-de-arena-2309).
Este documento cobre a operação.

## Como os dois apps se ligam

```
Checklist de Arena                                   Gráfica (grafica.appsnorte.com)
  GRAFICA_URL   = https://grafica.appsnorte.com  ──▶  /api/integracao/checklist/*
  GRAFICA_TOKEN = <mesmo valor>                  ──▶  CHECKLIST_INTEGRACAO_TOKEN
```

| Lado | Variável | Valor |
| --- | --- | --- |
| Gráfica | `CHECKLIST_INTEGRACAO_TOKEN` | segredo aleatório com **32 caracteres ou mais** (`openssl rand -base64 48`) |
| Checklist | `GRAFICA_URL` | `https://grafica.appsnorte.com` |
| Checklist | `GRAFICA_TOKEN` | o mesmo valor do `CHECKLIST_INTEGRACAO_TOKEN` |

O Checklist manda `Authorization: Bearer <token>`. A Gráfica compara em tempo
constante e não registra o token em log.

## Rotas

| Rota | Para quê |
| --- | --- |
| `GET /api/integracao/checklist/eventos` | eventos dos últimos 120 dias com peça da Arena entregue |
| `GET /api/integracao/checklist/eventos/:id/entregues` | peças entregues do evento, com volumes (tubos) e quantidades |
| `GET /api/integracao/checklist/itens/:itemId/thumb` | miniatura da arte da peça |
| `POST /api/integracao/checklist/reposicoes` | pede reposição: cria um complemento da peça (`#0062-C1`) na Revisão Final |

Código: `server/routes/integracao-checklist.ts`, `server/services/checklist-entregues.ts`,
`server/services/reposicao-do-checklist.ts` e `shared/integracao-checklist.ts`.

## Respostas que indicam problema de configuração

| A Gráfica responde | Causa |
| --- | --- |
| **503** | `CHECKLIST_INTEGRACAO_TOKEN` ausente ou com menos de 32 caracteres: integração desligada (falha fechada) |
| **401** | token do Checklist diferente do da Gráfica. No Checklist aparece "Integração recusada pela Gráfica" |
| **405** | método diferente de GET (ou POST em `/reposicoes`) |

## Trocar o token

1. Gerar um valor novo (`openssl rand -base64 48`).
2. Gravar na Gráfica, no arquivo de variáveis do app na VPS, e recriar o app
   (`docker compose ... up -d app`).
3. Gravar o mesmo valor em `GRAFICA_TOKEN` no Checklist e reiniciar.

Entre o passo 2 e o 3 o Checklist recebe 401; faça os dois em sequência.

## DEV

O ambiente DEV (`devgrafica.appsnorte.com`) tem segredos próprios. Para testar
o Checklist contra o DEV, gere um token só para ele e aponte um Checklist de
teste para `https://devgrafica.appsnorte.com`. Nunca reutilize o token de
produção.

## Demo local

`scripts/exportar-checklist.ts` grava eventos reais num JSON, em transação
somente leitura, para a demo local do Checklist. Uso em
[arquitetura.md → Exportar um evento para o Checklist](arquitetura.md#exportar-um-evento-para-o-checklist-demo-local).
