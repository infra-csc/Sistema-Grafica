# Revisão técnica do Sistema Gráfica e preparação para VPS

Data: 07/10/2026. Escopo: código desta cópia local, configuração de deploy,
dependências, autenticação, arquivos, principais módulos e testes disponíveis.
Na revisão inicial não houve acesso ao Replit publicado, ao banco ou ao bucket real.
Depois, o banco Neon informado pelo usuário foi verificado somente em leitura
(resultados no apêndice ao final). Não foi confirmado qual deployment aponta para ele.
Nenhuma correção de código ou migração de dados foi aplicada nesta revisão.

## Parecer

O projeto é um sistema de gestão de produção gráfica para eventos. A peça é a
entidade central: percorre solicitação, arte, aprovação, revisão, impressão,
conferência, embalagem e entrega. O acervo permite reutilizar material.

É possível migrar para VPS sem reescrever o produto. Entretanto, o repositório
ainda não permite uma implantação independente do Replit: há URLs privadas
no lock, autenticação do storage pelo ambiente Replit e envio de e-mail pelo
conector Replit. Mover também o banco exige adaptar o driver de execução.

O principal problema de autorização encontrado é uma rota alternativa de fotos
com permissões mais amplas que a rota equivalente. Deve ser corrigido antes
de considerar a implantação pronta.

## Achados priorizados

P1 = bloqueio de migração ou falha relevante de autorização. P2 = problema de
operação, confiabilidade ou configuração que precisa ser tratado no preparo.
São conclusões sobre o código; não representam incidentes confirmados em produção.

### 1. P1 — O lock depende de dois registros privados do Replit

**Evidência:** `package-lock.json` contém 324 entradas `resolved` apontando para
hosts privados: 297 para `package-firewall.replit.local` e 27 para
`package-firewall.replit.internal`. Há dependências de testes, do servidor e
binários do Sharp nesse conjunto.

**Efeito:** `npm ci` tenta baixar desses endereços fora do Replit. A instalação
local falhou com `ENOTFOUND`. Um VPS sem acesso a esses hosts encontra o mesmo
impedimento de resolução; `--registry` sozinho não corrige URLs gravadas no lock.

**Ação:** normalizar o lock para um registro acessível, preservando versões e
integridade, e validar uma instalação limpa em Linux. Revisar o diff antes de
incorporar. Não houve alteração no lock original nesta revisão.

### 2. P1 — Os arquivos usam credenciais fornecidas pelo sidecar do Replit

**Evidência:** `server/objectStorage.ts` cria o cliente GCS com identidade externa,
audience `replit` e endpoints em `http://127.0.0.1:1106/token` e `/credential`.
A assinatura de URLs também chama esse sidecar. Não existe um adaptador de
produção para storage independente. O storage de `scripts/local/` é uma simulação.

**Efeito:** configurar somente `PRIVATE_OBJECT_DIR` no VPS não restaura acesso
aos arquivos. Artes, books, fotos e miniaturas dependem desse armazenamento.
Uma cópia somente do banco conserva os caminhos, mas não os bytes dos arquivos.

**Ação:** exportar e conferir o bucket antes do corte; escolher armazenamento
independente e adaptar upload, download, metadados/ACL e miniaturas. Preservar
o contrato `/objects/...` para evitar quebrar referências históricas. Se mudar
o prefixo privado, manter o mapeamento de cada caminho relativo. Preservar também
o suporte HTTP Range dos PDFs e os cabeçalhos de segurança dos downloads.

### 3. P1 — O envio de e-mail depende do conector Replit

**Evidência:** `entregarEmail`, em `server/services/bookEmailNotification.ts`,
instancia `ReplitConnectors` e chama `connectors.proxy("resend", "/emails", ...)`.
Os digests de revisão e gestão compartilham esse canal.

**Efeito:** a configuração atual não fornece uma API key ou transporte autônomo
para o VPS. Publicar o book pode continuar funcionando enquanto seu aviso falha;
a presença do pacote SDK não fornece a identidade/conexão do ambiente Replit.

**Ação:** substituir o transporte por integração direta com o provedor escolhido,
mantendo montagem da mensagem, destinatários e registro do resultado. Conferir
remetente autorizado e trocar `BOOK_EMAIL_APP_URL` para o novo domínio.
Usar destinatários de homologação ao verificar envios reais.

### 4. P1 — Mover o PostgreSQL exige mudar o driver, não apenas a URL

**Evidência:** `server/db.ts` usa `Pool` de `@neondatabase/serverless` e
`drizzle-orm/neon-serverless`. `server/tempo-real.ts` também cria um `Client`
desse pacote para LISTEN/NOTIFY. O preload em `scripts/local/neon-local.mjs`
mostra a configuração adicional necessária para comunicar com o banco local
por WebSocket. Scripts de migração, por outro lado, já usam `pg` por TCP.

**Efeito:** um PostgreSQL convencional no VPS não passa a atender o transporte
WebSocket desse driver só por receber sua connection string. O fato de o
script de migração conectar não prova que o app conecta.

**Ação:** se o banco atual permanecer num endpoint compatível com o driver,
essa mudança pode ser adiada. Para PostgreSQL convencional, adaptar pool e
Drizzle ao driver TCP, o cliente de tempo real e tipos específicos do Neon
usados pelos módulos. Testar sessões, transações, locks e LISTEN/NOTIFY contra
PostgreSQL real. Confirmar primeiro qual `DATABASE_URL` o deployment publicado
usa: esta cópia não estabelece o provedor nem a topologia reais de produção.

### 5. P1 — Uma rota alternativa permite anexar comprovantes com perfil indevido

**Evidência:** `POST /api/delivery-photos`, em `server/routes/objects.ts`, usa
somente `requireAuth`. Já `POST /api/items/:itemId/photos`, em
`server/routes/photos.ts`, restringe a ação a Gráfica, Solicitação e Admin.
Ambas gravam com `storage.addDeliveryPhoto`.

**Cenário:** um usuário de Arte ou Atendimento autenticado pode chamar a primeira
rota com `itemId`, `photoUrl` e `uploadedBy` válidos e anexar foto à peça. A
trava global do Kit não impede esse cenário para usuários comuns desses perfis.
Assim, a restrição da segunda rota pode ser contornada pela primeira.

Além disso, ambas aceitam `uploadedBy` do corpo. O schema omite apenas `id` e
`createdAt`, e o storage insere os dados recebidos. O nome exibido como autor
do comprovante pode ser diferente do usuário da sessão.

**Ação:** centralizar o serviço/guarda ou retirar a rota alternativa se estiver
sem uso; aplicar os mesmos perfis e regras de acesso à peça; definir a autoria
pela sessão no servidor. Cobrir as duas rotas com testes negativos por perfil.
Os testes consultados de permissões montam `registerPhotoRoutes`, mas não
exercitam essa alternativa de `registerObjectRoutes`. Uma reprodução isolada
desta revisão executou os handlers reais com storage simulado: Arte e Atendimento
receberam 201 pela alternativa, com autoria arbitrária preservada, e 403 pela
rota por peça (dois casos passaram, reproduzindo o problema).

### 6. P2 — Node declarado no deploy e CI é incompatível com dependências atuais

**Evidência:** `.replit` e `.github/workflows/ci.yml` usam Node 20. O lock fixa
`pdfjs-dist@6.2.108`, com requisito `>=22.13.0 || >=24`, e `jsdom@30.0.1`, com
requisito `^22.22.2 || ^24.15.0 || >=26.0.0`.

**Efeito:** o runtime declarado não atende os requisitos instalados. Isso pode
provocar avisos de engine, falhas de importação ou comportamento não suportado,
especialmente nos testes de tela. O Node local 24.14.1 também gera aviso para
essa versão do jsdom.

**Ação:** fixar uma versão de Node que atenda todos os requisitos do lock e usar
a mesma em desenvolvimento, CI, build e VPS; declarar `engines` e documentar
a versão. Compatibilidade de engine precisa ser acompanhada por execução dos testes.

### 7. P2 — A documentação descreve incorretamente o interruptor dos digests

**Evidência:** `.env.example` afirma que os digests de revisão e gestão só rodam
quando a variável vale `true`. O código usa `!== "false"` em produção; ausente
também significa ligado. `NODE_ENV=production` basta para o gate de produção.

**Efeito:** ligar a produção no VPS sem configurar explicitamente essas variáveis
ativa os relógios de e-mail. Na homologação conectada a dados reais isso pode
disparar mensagens; numa sobreposição com o Replit, a ausência de coordenação
entre bancos/canais também precisa ser considerada.

**Ação:** alinhar documentação e regra; definir explicitamente
`REVISAO_DIGEST_ENABLED=false`, `GESTAO_DIGEST_ENABLED=false` e
`BOOK_EMAIL_NOTIFICATIONS_ENABLED=false` na homologação. `BOOK_EMAIL_DRY_RUN=true`
simula os envios de e-mail, mas mantém a execução dos jobs e seus registros;
para desligar os jobs de e-mail, usar os interruptores próprios.

### 8. P2 — Copiar `.env.example` para `.env` não carrega o ambiente do servidor

**Evidência:** o README sugere criar `.env` e executar os scripts. Os comandos
`dev`/`start` não usam `--env-file`; o servidor e os scripts de migração leem
`process.env` sem carregar dotenv. O carregamento do Vite não resolve o
`DATABASE_URL` necessário antes, no import do servidor.

**Efeito:** seguir somente esses passos num ambiente sem variáveis exportadas
faz o servidor falhar por ausência de `DATABASE_URL`/`SESSION_SECRET`.

**Ação:** documentar e configurar a injeção do ambiente pelo serviço/container,
ou adotar carregamento explícito antes dos imports. `VITE_HUB_URL`, usado para
o link ao portal e para logout, precisa existir no build do cliente; mudar
somente o ambiente do processo já publicado não muda esse bundle.

### 9. P2 — O processo continua após exceção não tratada e não tem prontidão própria

**Evidência:** `server/index.ts` registra `uncaughtException` e apenas loga.
Não foram encontrados handlers de encerramento SIGTERM/SIGINT no servidor ou
uma rota dedicada de prontidão que confira banco e dependências. O servidor
ouve em `0.0.0.0` e confia em um proxy.

**Efeito:** o processo pode continuar atendendo após falha fatal em estado
inconsistente; uma resposta da página inicial não comprova que banco, sessões
ou arquivos estão acessíveis. Reinícios não drenam explicitamente trabalhos.

**Ação:** configurar supervisão com reinício após falha fatal, encerramento
controlado de HTTP/WebSocket/pool e checagens separadas de vida e prontidão.
Restringir a porta do app ao proxy; preservar Host e X-Forwarded-Proto para
CSRF e cookies `secure`, e encaminhar os upgrades de `/ws`.

## Funcionalidades encontradas

| Área | O que o código implementa |
| --- | --- |
| Eventos | Cadastro, datas, franquia, prioridades, patrocinadores, cotas, acompanhamento, encerramento/reabertura e arquivamento/restauração |
| Solicitação | Criação individual e em lote, modelos, importação XLSX com prévia, envio para o fluxo, revisão final, devoluções e travas de peça |
| Vinculação | Associação de patrocinadores às peças e dispensa de aprovação quando permitida |
| Arte | Miniaturas de aprovação, arquivo final, devoluções, pesquisa de artes anteriores, books e histórico de publicações |
| Atendimento | Aprovação/reprovação por patrocinador, histórico, revogação, pedidos de novas peças e ajustes |
| Produção interna | Envio direto à Gráfica sem patrocinador; sem arquivo final, exige instruções no envio |
| Gráfica | Fila, escolha/reserva de impressora, impressão repartida entre máquinas, quantidades parciais, pausas/trocas e diário/relatório de máquinas |
| Conferência e entrega | Conferência parcial com foto, volumes/tubos e avulsos, fechamento com fotos, etiquetas, entrega em lote e registro de quem recebeu |
| Estoque/acervo | Ativos físicos, disponibilidade, alocação/reserva, reaproveitamento, retorno e triagem |
| Kit | Remessas e acesso limitado às peças criadas pelo próprio usuário do Kit |
| Prazos e análise | Calendário, funil operacional, snapshots, análise de tempo por etapa e desempenho operacional |
| Administração | Usuários, perfis, marcas Kit/Cultura, “ver como”, auditoria, notificações e ferramentas de reparo |
| Exportações | XLSX, PDFs/books, etiquetas e relatórios de evento/máquina |
| Integrações | SSO do portal NORTE, avisos por e-mail e API de leitura do Checklist de Arena por token |

**Recurso presente, mas desligado:** Solicitação ao Estoque via Revisão Final.
`SOLICITACAO_AO_ESTOQUE_ATIVA=false` em `shared/consultas-de-estoque.ts` oculta
a tela e desativa as operações correspondentes. Não confundir com o estoque
e o reaproveitamento que continuam disponíveis.

O fluxo principal é:

```text
Rascunho → Vinculação → Arte → Aprovação dos patrocinadores
         → Finalização da arte → Revisão final → Pronto para produção
         → Impressão → Conferência → Embalagem → Entrega
```

Há retornos, cancelamento, reaproveitamento, molde e produção interna, portanto
não se deve reduzir o negócio a uma coluna editável de status.

## Arquitetura e dados

É um monólito modular TypeScript: React/Vite/Tailwind no navegador e
Express/Drizzle no servidor. O build entrega cliente estático e servidor em
`dist/`; o mesmo processo serve frontend e API na porta configurada, padrão 5000.
Não há necessidade arquitetural demonstrada de separar em microserviços.

`shared/` concentra schema, contratos, permissões e regras de domínio usadas
pelos dois lados. `server/routes/` concentra HTTP; `server/services/` contém
rotinas e regras; `server/storage.ts` reúne boa parte do acesso ao banco.

O schema declara 35 tabelas. Os grupos principais são eventos/peças/patrocinadores,
aprovações, books, impressoras/produção, tubos e suas peças, inventário/alocações,
pedidos/consultas, notificações, usuários, sessões, auditoria e controles técnicos.
Os objetos do bucket são um segundo conjunto de dados indispensável ao banco.

As sessões são persistidas no PostgreSQL (`connect-pg-simple`), com cookie
HTTP-only, secure em produção, renovação por atividade e teto absoluto.
SSO cria token de troca de uso único; login por senha usa bcrypt. O fluxo do
portal usa JWT compartilhado: manter `SSO_SECRET` próprio, diferente do segredo
de sessão, e ajustar no portal o destino para o novo domínio.

WebSocket `/ws` avisa alterações. LISTEN/NOTIFY distribui sinais e invalidações
de cache entre processos. Jobs periódicos fazem alertas, digests, snapshots,
prioridade e ciclo de inventário; advisory locks e reservas no banco coordenam
réplicas. Começar com um processo reduz a complexidade operacional.

## Pontos positivos e dívida técnica

- Separação explícita de contratos e regras compartilhadas, evitando duplicação
  entre tela e servidor.
- Migrações versionadas, simulação por padrão e fluxo de adoção de banco legado.
  Arquivamento de eventos/patrocinadores preserva histórico.
- Sessões persistidas, regeneração no login, validação de uploads por bytes,
  proteção dos downloads e autenticação do WebSocket.
- Caches com invalidação por geração e por canal; listas por delta, compressão,
  páginas carregadas sob demanda e miniaturas persistidas.
- Muitos testes orientados a regras e incidentes concretos. A quantidade de
  arquivos não prova cobertura integral; a rota alternativa de fotos mostra
  uma lacuna entre módulos equivalentes.
- Alguns módulos ainda são grandes: `storage.ts` tem aproximadamente 2.900
  linhas, `events.ts` 1.470 e `tubos.ts` 1.230. Refatorar por domínio aos poucos,
  sem acoplar uma reestruturação ampla à migração.
- A análise de tempo por etapa interpreta frases em português de
  `audit_logs.details`. Mudanças nesses textos exigem revisar o parser e os
  testes; evoluir para transições estruturadas seria uma melhoria futura.
- Notas antigas em `.agents/memory/db-architecture.md` contradizem o fluxo
  atual de migrações descrito no README. Confirmar o ambiente publicado e usar
  o código/scripts atuais como evidência; não executar instruções antigas de
  `db:push` em produção.

## Proposta de implantação derivada do código

```text
Navegador / Portal NORTE / Checklist
                  ↓ HTTPS
          Proxy reverso no VPS
                  ↓ HTTP + upgrade /ws
       Serviço Node supervisionado
          ├─ PostgreSQL + sessões
          ├─ Storage persistente independente
          └─ Provedor de e-mail independente
```

É uma proposta para homologar, sem escolha contratada de fornecedor ou tamanho
de VPS. Faltam volume e tamanho do bucket, tamanho do banco, concorrência,
tráfego e consumo real de CPU/RAM. Uploads de até 50 MB passam em memória;
imagens e geração de PDFs/miniaturas merecem medição antes do dimensionamento.

Uma migração menor move primeiro a aplicação e preserva o banco atual, caso
seu endpoint seja acessível e compatível. Uma migração completa move também o
PostgreSQL, após adaptar o driver. Ambas precisam resolver storage, e-mail e
instalação fora do Replit.

O repositório não contém Dockerfile, Compose ou unidade de serviço pronta para
VPS. Esses artefatos, o proxy, a supervisão, os backups e a observabilidade
precisam fazer parte da implementação da migração.

## Sequência para migrar

1. **Inventário de produção:** conferir deployment, connection strings de
   produção versus dev, versão de Node, estado das migrações, bucket, integrações,
   domínio, destinatários e acesso ao portal. Exportar segredos por canal seguro.
2. **Portabilidade:** corrigir lock/runtime, implementar storage e transporte de
   e-mail independentes, resolver a rota de fotos e decidir onde o banco ficará.
3. **Homologação:** instalar limpo em Linux; montar serviço/proxy/TLS; importar
   cópia consistente do banco e bucket, com e-mails desligados. Confirmar a
   identidade do banco antes de qualquer comando que escreva.
4. **Validação:** percorrer todos os perfis e o fluxo completo, incluindo SSO,
   aprovação real, retorno/cancelamento, impressão parcial, Kit, estoque,
   PDFs grandes e Checklist. Exercitar locks simultâneos contra PostgreSQL real.
5. **Corte:** interromper novas escritas no Replit, fazer backup final e copiar
   o delta de dados/arquivos; aplicar somente migrações pendentes necessárias;
   conferir contagens e referências; trocar domínio/destinos do portal e
   Checklist; habilitar jobs/e-mails após verificar a operação.
6. **Acompanhamento:** observar falhas de sessão, objetos não encontrados,
   e-mails, jobs e consumo. Manter backup e procedimento de restauração testado.

Não usar `db:push` para preparar o banco de produção. Conferir com `db:drift` e
`db:migrate` em simulação, respeitando o modo de adoção quando o banco legado
ainda não tem registros de migração. Backup/restauração deve preservar dados,
objetos, índices extras e a tabela de controle das migrações.

Rollback exige atenção às novas escritas: depois que o VPS recebe alterações,
voltar o domínio para um banco antigo não é uma reversão consistente. Se os
bancos forem separados, prever exportação/reconciliação ou novo período sem
escrita antes de voltar.

## Validação desta revisão

Leitura estática dos módulos, schemas, scripts, documentação, lock e configuração
de CI, com verificações locais em Windows e Node 24.14.1.

| Verificação | Resultado |
| --- | --- |
| Instalação pelo lock original | Não concluiu: hosts privados do Replit não resolvem fora desse ambiente |
| Instalação temporária | Concluiu após trocar somente as 324 URLs privadas por URLs públicas em uma cópia do lock; versões e integridades preservadas; lifecycle scripts desabilitados |
| `npm run check` | Passou |
| `npm run check:tests` | Passou |
| `npm run build` | Passou; gerou cliente e `dist/index.js` |
| Reprodução isolada das permissões de fotos | Dois casos passaram, confirmando o bypass e a autoria controlada pelo corpo |
| Suíte Vitest completa, limitada a quatro workers | 6.712 testes passaram, quatro falharam e 19 foram pulados; 345 arquivos passaram, um falhou e três foram pulados; duração aproximada de 6min44s |
| Repetição isolada do arquivo que falhou | `arquivados-telas.test.ts`: sete testes passaram, em aproximadamente nove segundos |
| Migrações, E2E, SSO/e-mail/bucket reais | Não executados nesta revisão |

O lock original e os arquivos da aplicação foram preservados. Os resultados
de tipos/build acima usam dependências obtidas pela cópia temporária; não
demonstram que o `npm ci` original ou o runtime Node 20 declarado funcionam.

As quatro falhas da suíte completa ocorreram em `arquivados-telas.test.ts`,
nas confirmações e restaurações de eventos/patrocinadores: os elementos esperados
não apareceram e houve avisos de `act()` sobreposto. O arquivo passou isoladamente.
Isso é um indício de instabilidade do teste sob a execução conjunta, não uma
confirmação de defeito funcional das telas. A suíte completa não ficou verde
nesta revisão; investigar sincronização/isolamento e repetir em Linux com o
runtime escolhido antes da implantação.

Os E2E existentes cobrem cinco fluxos em três larguras. Conforme a própria
documentação, não validam SSO real, e-mail real e aprovação por patrocinador de
ponta a ponta. O PostgreSQL de teste PGlite serializa conexões; portanto, seus
resultados não substituem um teste de concorrência contra PostgreSQL real.

Não foi possível verificar tamanho do bucket, custo atual, incidentes de produção,
backup real, permissões do bucket nem a versão efetivamente publicada.

## Atualização — banco Neon informado pelo usuário

Consultas em 07/10/2026, com transações somente leitura. A connection string e
a senha não foram gravadas no projeto ou neste relatório. Nenhuma migração ou
alteração de dado foi executada.

| Item | Resultado observado |
| --- | --- |
| PostgreSQL | 16.15 |
| Tamanho do banco | 122.347.520 bytes, aproximadamente 117 MiB |
| Eventos | 89 |
| Peças | 6.395 |
| Usuários | 50 |
| Registros de fotos | 12.583; são linhas do banco, não volume em bytes do bucket |
| Ativos de inventário | 8.537 |
| Auditoria | 76.229 linhas |
| Driver do aplicativo | Conexão por `@neondatabase/serverless` confirmada a partir deste computador, com consulta em transação somente leitura |
| Verificador `checar-drift.mjs` | Nada faltando; nada sobrando fora dos índices intencionalmente criados por script |
| Índices extras preserváveis | Os três índices trigram de auditoria: details, entity_id e user_name |

As contagens refletem o momento das consultas e incluem registros arquivados ou
cancelados quando presentes; não representam somente trabalho ativo.
O tamanho do banco não inclui o bucket de artes/books/fotos.

O controle `drizzle.__drizzle_migrations` contém `0000` até `0003`, com hashes
iguais aos arquivos locais. `0004_atendimento-cultura` e `0005_producao-interna`
ainda não estão registradas. Entretanto, suas colunas (`users.cultura`,
`items.producao_interna` e `items.instrucoes_grafica`) já existem. Isso é
compatível com aplicação por outro caminho, mas a origem não foi determinada.

Antes do próximo deploy, regularizar o controle pelo executor versionado:
conferir a simulação e, numa etapa autorizada de implantação, aplicar as duas
migrações idempotentes e registrar seus hashes. Não é necessário repetir a
adoção da base, pois esse banco já possui o controle e as quatro primeiras
migrações registradas. Esta revisão não executou essa regularização.

**Impacto na proposta:** manter esse Neon elimina a necessidade de adaptar o
driver TCP e copiar o banco na primeira etapa. Permanecem os bloqueios de lock,
storage e e-mail, a correção de autorização das fotos e os ajustes de operação.
O VPS escolhido ainda precisa comprovar acesso ao endpoint. Confirmar no Replit
que este é o banco do deployment de destino antes de qualquer corte; a URL
fornecida e os dados existentes não comprovam sozinhos essa associação.
