# Preparação da cópia de arquivos — 08/10/2026

**Atualização final: lote completo concluído às 15:03:38 de Brasília em 08/10/2026.**
17.762 objetos, 14.904.542.958 bytes. Verificação posterior da listagem R2:
17.762 objetos, zero ausentes, divergentes ou extras em relação ao lote.
Relatório consolidado: `resultado-transferencia-storage-20261008.json`.
App e PostgreSQL saudáveis; temporários removidos; origem preservada.
Banco/app não foram trocados. A origem continua ativa; sincronização de arquivos
novos/alterados permanece necessária antes da virada. Consulta adicional à origem
após a conclusão recebeu GCS_HTTP_401; não foi possível afirmar ausência de deltas.
Os estados de preparação/interrupção abaixo são o histórico das etapas.

Estado: **piloto de quatro arquivos concluído em 08/10/2026 às 14:40 UTC**,
após autorização do usuário. Copiados 8.888.201 bytes ao R2 e relidos com SHA-256,
tamanho, headers e metadados conferidos. Relatório: `resultado-piloto-storage-r2.json`.
A transferência completa, alteração do app, troca de banco e corte de produção
continuam pendentes de autorização específica.
Não foram criados arquivos no projeto Replit nem instaladas dependências nele.

## Evidências da conferência

Resultados retornados pelo usuário ao executar consultas somente de leitura no Shell:

- O Shell usa `helium / heliumdb`, com 12 usuários, 9 eventos e 239 peças. Não é
  o banco Neon escolhido para esta migração. Não alterar DATABASE_URL do projeto.
- Consulta explícita ao Neon: 51 usuários, 96 eventos, 6.540 peças. Nos 19 campos
  terminados em `_url`/`_urls`: 12.397 chaves únicas, todas encontradas no bucket.
- Complemento: `tubos.fotos_fechamento`, 394 referências únicas, todas encontradas;
  `tubo_itens.fotos` e `kit_remessas.arquivo` estavam vazios. As contagens podem
  sobrepor as referências anteriores; não somá-las como arquivos distintos.
- Inventário inicial: 17.374 objetos, 14.819.434.791 bytes (13,802 GiB), 3.429
  miniaturas; posteriormente 17.467 objetos. A origem permanece recebendo alterações.
- JPEG, PNG, PDF e WEBP lidos em memória, tamanhos e assinaturas básicos aprovados.
  Não foi feita análise visual/exaustiva de integridade de todos os documentos.
- No inventário inicial, 579 objetos apresentaram `custom:aclPolicy`. Ausência de
  ACL é prevista pela rota autenticada, confirmada também no trecho atual do Replit.
- VPS consultada em leitura: 29 GB livres. App e PostgreSQL não foram alterados.

## Origem e destino

- Origem: `replit-objstore-c4b4879f-ce65-4fb1-891e-2d8c9642fe0e`.
- Destino privado: `grafica-homolog-arquivos` na conta Cloudflare configurada.
- Escopo proposto: todos os objetos atuais do bucket, incluindo miniaturas e
  objetos sem referência nos campos examinados. Nenhuma exclusão/limpeza automática.
- Preservar as chaves completas `.private/uploads/...`, metadados customizados,
  Content-Type, Cache-Control, Content-Disposition, Content-Language e Expires.
- ACL customizada é codificada em nomes hex/valores base64, como o adaptador R2
  do app. Não transformar `visibility=public` em acesso público ao bucket.

## Transporte proposto

Executar a ferramenta na VPS, onde as credenciais R2 já são permitidas por IP.
Não liberar o token R2 para outros IPs e não enviá-lo ao Replit. A VPS lê o GCS
via token Google temporário obtido pelo cliente já existente no ambiente Replit.
Esse token será passado em memória pela entrada padrão, sem arquivo no projeto,
sem gravar segredos em relatórios e sem criar acesso persistente novo.

**Validado:** token temporário aceito pela API Google na VPS; listagem e download
das quatro amostras aprovados, seguidos de cópia e releitura dessas amostras no R2.
A validade do token durante o acervo completo ainda não foi comprovada.
Se houver 401/403, interromper;
não ampliar permissões ou abrir endpoints automaticamente. Renovar credencial
temporária e retomar após determinar a causa. O acesso pelo sidecar dentro do
Replit e o acesso externo pela VPS foram testados para essas quatro amostras.

Ferramenta: `infra/grafica/migrar-storage-r2.mjs`. Ela precisa de Node com fetch e
do SDK S3 já instalado na imagem da aplicação. Ao preparar sua execução na VPS,
montar o script sob `/app/` para usar os node_modules da imagem; não alterar o
container ativo. Usar container temporário separado, limites de memória e ambiente
services.env existente. Os comandos concretos de montagem serão conferidos antes
do piloto; não executar o script do projeto original no Replit.

## Modos e garantias

- Padrão/`--planejar`: somente GET na origem e HEAD no destino. Não baixa os
  conteúdos nem grava no R2. Inventaria e verifica compatibilidade de metadados.
- `--amostra`: exatamente os quatro objetos do teste de leitura já aprovado.
- Gravação exige `--aplicar`, um escopo (`--amostra` ou `--todos`) e
  `--confirmar-destino=grafica-homolog-arquivos`, além das credenciais existentes.
- Aplicação limitada a seis objetos em paralelo no lote final, com container de
  768 MiB/1 CPU. Conferência de HEAD na retomada usa até 16 consultas leves.
  Até 64 MiB, conteúdo em memória; acima disso, um arquivo
  temporário privado por vez em disco, com teto de transporte de 512 MiB por objeto.
  Metadados codificados continuam limitados a 1.800 bytes.
  Objetos fora desses limites ou com encoding especial bloqueiam o preflight.
- Download pinado pela generation e condicionado pela metageneration, para não
  misturar conteúdo/metadados de versões diferentes do mesmo objeto.
- Gravação condicionada a objeto inexistente (`If-None-Match: *`). Sem DELETE,
  alteração na origem, sobrescrita automática ou modificação de permissões do bucket.
- Após upload, reler bytes do R2 e comparar SHA-256, tamanho, headers e metadados.
  ETag não é tratado como SHA-256. A ferramenta também envia Content-MD5 no PUT.
- Na retomada, conferir conteúdo e metadados de objetos já existentes. Divergência
  interrompe o lote; exige decisão específica sobre o conflito. Nada é apagado.
- Saída JSONL contém identidade da versão, tamanho, SHA-256 e estado por objeto;
  nenhum token ou valor de ACL. Relatórios persistentes, se necessários, ficarão
  na VPS, fora do Replit, quando a execução for autorizada. Plano não prova conteúdo.

## Sequência para execução futura

1. Validar acesso externo temporário e executar planejamento da amostra, sem PUT.
2. Apresentar o plano e obter autorização para quatro gravações no bucket de homologação.
3. Copiar as quatro amostras e comparar com os hashes já fornecidos pelo usuário.
4. Testar autenticado/sem login e a restrição Kit no app de homologação, incluindo
   objeto com ACL explícita (as quatro amostras atuais não têm ACL).
5. Planejar todo o bucket e revisar limites/conflitos. Após autorização, copiar tudo.
6. Emitir relatório de completude e repetir o inventário para detectar alterações
   durante a cópia. Listagem paginada não é snapshot transacional do bucket.
7. Na virada, combinar pausa de escrita na origem, nova cópia consistente do banco,
   reconciliação dos objetos e tratamento explícito de versões alteradas. Manter
   o serviço antigo disponível para retorno; não apagar origem após copiar.

O banco atual na VPS continua `grafica_homolog`; a base importada de 07/10 é separada
e já está desatualizada. A cópia dos arquivos, sozinha, não ativa os dados no app.
Publicação em produção ainda precisa ter sua conexão Neon confirmada independentemente.

## Referências técnicas verificadas

### Conferência de limites e conflitos — 08/10/2026, 15:01 UTC

Somente leitura do storage; nenhuma transferência nova e nenhuma alteração no app
ou banco. Relatório: `resultado-limites-storage-r2.json`.

- Origem: 17.571 objetos, 14.896.787.307 bytes; 17.567 ainda ausentes no R2.
- Destino: quatro objetos, todos com conteúdo SHA-256, tamanho e metadados iguais
  à origem atual; zero conflitos e zero chaves no destino ausentes na origem.
- Um arquivo de 260.795.708 bytes ultrapassa o limite de 64 MiB do copiador:
  `.private/uploads/0f540128-be32-4e39-9254-9afb7065ead7`.
- Segundo maior: 55.420.398 bytes, dentro do limite atual.
- Metadados codificados: máximo 136 bytes, abaixo de 1.800; 579 objetos com ACL,
  todos com JSON válido. Nenhum encoding especial, chave/tamanho/identidade inválida
  ou objeto sem MD5 na listagem.

Na versão conferida naquele momento, o lote completo estava bloqueado pelo limite local de memória do copiador.
Preparar transporte em fluxo ou arquivo temporário para o objeto maior, com
validação de integridade e preservação de metadados. Não ignorar o arquivo nem
elevar o limite de memória sem adequar o transporte. Esses resultados não provam
a leitura de todos os conteúdos; a integridade completa será verificada na cópia.

### Adaptação para arquivos grandes — 08/10/2026

Implementada e testada localmente e na VPS, sem rede no container de teste,
sem credenciais e sem copiar arquivos reais. Oito testes passaram em ambos.
Na VPS, o teste processou um arquivo sintético de exatamente 260.795.708 bytes
com container limitado a 128 MiB de RAM e heap Node de 64 MiB. SHA-256, MD5,
tamanho e limpeza dos temporários foram conferidos, inclusive em falhas simuladas.

O arquivo grande é baixado em fluxo para um temporário de permissão 600 em pasta
privada, com hashes calculados incrementalmente. Antes do PUT, confere MD5 da
origem. O upload usa stream do disco, Content-MD5 e If-None-Match: *; a releitura
do R2 também calcula SHA-256 em fluxo. Conteúdos acima de 512 MiB seguem bloqueados.
Há verificação de espaço livre antes do temporário, reservando mais 64 MiB.
Erros de transporte exigem retomar a execução: não sobrescrever objetos existentes.

Na execução futura, montar o diretório privado da VPS
`/home/marcosvinicius/grafica-homolog/infra/storage-temporario` como `/tmp` gravável
no container temporário. Não usar tmpfs para o arquivo grande, pois consumiria RAM.
O diretório tem modo 700 e UID 1000, compatível com o usuário node da imagem.
Limpeza normal e em exceções remove apenas o arquivo e a pasta gerados pela
ferramenta. Encerramento forçado/SIGKILL pode deixar resíduos, que exigem conferência
antes de qualquer limpeza manual; nenhuma varredura destrutiva foi implementada.

O inspetor agora distingue arquivos acima de 64 MiB (uso de temporário) dos acima
de 512 MiB (bloqueio), e calcula hashes de objetos já existentes em fluxo.
Não houve novo inventário após a adaptação nem teste de transferência real do
objeto grande. Antes da cópia real, renovar o token temporário se expirado e
validar o transporte desse objeto na integração Google/R2. A cópia completa
continua pendente de autorização.

### Piloto real do arquivo grande — 08/10/2026, 12:20–12:21 de Brasília

Após autorização e renovação do token temporário, executado planejamento de um
único objeto com `--arquivo-grande`: destino inexistente, 260.795.708 bytes.
Em seguida, copiado somente `.private/uploads/0f540128-be32-4e39-9254-9afb7065ead7`
para o R2 privado, preservando a mesma chave. MD5 da origem conferido antes do
upload; releitura do R2 com tamanho, headers, metadados e SHA-256 iguais à origem:
`8fb3d9a3b4f47b12b6c7d38e4a8ca0a8c6ddd48ea5e2c4e5d859d3abd0a4c3ca`.
Generation `1785353742396565`, metageneration `1`; código de saída 0.

Temporário removido, diretório confirmado vazio, app e PostgreSQL saudáveis.
Uma medição durante a execução registrou 91,85 MiB de RAM no copiador; não é
medição de pico. Os quatro arquivos do primeiro piloto não foram regravados.
O objeto original no Replit não foi modificado ou removido. A transferência do
acervo completo não foi iniciada. Relatório: `resultado-piloto-storage-arquivo-grande.json`.

- [R2 S3 API: PUT condicional e metadados](https://developers.cloudflare.com/r2/api/s3/api/)
- [GCS: listagem](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list)
- [GCS: leitura e condições de versão](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/get)

## Validação local

### Transferência completa iniciada — 08/10/2026, 12:34 de Brasília

Atualização de retomada em 08/10/2026 às 14:05 de Brasília: novo token recebido,
copiador atualizado e dez testes locais aprovados. Novo container:
`grafica-storage-copia-20261008T1705`; relatório cumulativo privado:
`/home/marcosvinicius/grafica-homolog/infra/transferencias/copia-20261008T1705.jsonl`.

Modo `--retomar` lê o relatório anterior montado somente para leitura em
`/app/retomada.jsonl`. Reaproveita o SHA-256 já validado apenas quando chave,
generation, metageneration e tamanho da origem continuam iguais e HEAD no R2
confirma ETag, tamanho, headers e metadados. ETag é marcador de versão observado,
não tratado como hash do conteúdo. Esses registros recebem `reutilizado: true`.
Arquivos sem confirmação compatível passam novamente pela verificação completa;
conflito não é sobrescrito. O novo relatório inclui os registros reaproveitados,
permitindo retomadas futuras sem voltar sempre ao primeiro lote.

Monitoramento em tempo real por subagente, solicitado pelo usuário, confirmou
interrupção desta retomada às 14:55:32 de Brasília, com `GCS_HTTP_401`, exit1.
16.189/17.713 chaves verificadas, 13.639.045.175 bytes; 1.524 restantes do lote.
App/PostgreSQL saudáveis. Próxima retomada deve usar o relatório cumulativo
`copia-20261008T1705.jsonl`, não o relatório inicial, após novo token fornecido.
Automação de cinco minutos está pausada; foi substituída pelo monitor contínuo.
Registro: `status-transferencia-storage-retomada-20261008.json`.

Nova retomada com token fornecido (validade informada 18:05:02Z), container
`grafica-storage-copia-20261008T1759` e relatório cumulativo `copia-20261008T1759.jsonl`.
Dez testes locais aprovados, incluindo limite de concorrência e interrupção de
novas operações após falha. Após HEAD de 16.189 objetos e confirmação das versões,
ETags, tamanhos, headers e metadados, 1.573 demais objetos foram verificados.
Novo inventário ampliou o lote para 17.762 objetos. Evento `concluido`, saída zero,
quantidade única igual ao plano e bytes totais iguais. Monitoramento contínuo por
subagente confirmou fim, saúde dos serviços e diretório temporário vazio.
Conferência adicional independente de LIST no R2 às 18:04:45Z confirmou todas as
chaves, tamanhos e ETags do relatório; nenhum objeto extra, ausente ou divergente.
O SHA-256 de conteúdo foi validado antes do registro de cada arquivo; para os
reaproveitados, o hash anterior foi preservado mediante confirmação das versões.

Usuário autorizou iniciar a transferência completa. Preflight renovado:
17.618 objetos, 14.899.295.839 bytes; cinco existentes idênticos, zero conflitos
e zero limites pendentes. Relatório local: `preflight-transferencia-storage-20261008.json`.

Copiador iniciado na VPS no container `grafica-storage-copia-20261008T1535`,
com três arquivos simultâneos, 512 MiB de RAM e 0,75 CPU. Nove testes locais
passaram, incluindo limite de concorrência e interrupção após falha sem abandonar
as operações já iniciadas. O processo é independente da conexão SSH.
Token Google recebido pela entrada padrão, sem arquivo; credenciais R2 continuam
somente na configuração protegida já existente na VPS. Nenhuma exclusão na origem.

Relatório cumulativo privado na VPS:
`/home/marcosvinicius/grafica-homolog/infra/transferencias/copia-20261008T1535.jsonl`.
Cada `verificado` corresponde a tamanho, metadados e SHA-256 conferidos após
releitura do R2. `concluido` confirma o término do lote listado; `interrompido`
exige verificar a causa antes de retomar. Token expirado pode produzir GCS_HTTP_401.
Não interpretar início ou registros parciais como acervo completo migrado.
A origem continua ativa; término do lote ainda exige reconciliação de alterações.

Estado atualizado: interrompido em 08/10/2026 às 13:04:54 de Brasília, com
`GCS_HTTP_401`, exit code 1. Foram 6.104 objetos e 5.169.322.233 bytes verificados.
A API Google recusou a credencial temporária; provável expiração, sem confirmação
independente do horário de validade. Renovar o token antes de retomar. Arquivos
já copiados permanecem no R2; a origem não foi modificada. Relatório:
`status-transferencia-storage-20261008.json`.

Executar `node --check infra/grafica/migrar-storage-r2.mjs` e
`node --test infra/grafica/migrar-storage-r2.test.mjs`. Os testes não usam rede:
verificam os bloqueios de gravação, formato de metadados, detecção de conteúdo
truncado/excedente, divergência de ACL e encoding não suportado. Compatibilidade
real do transporte e do PUT condicional foi validada no piloto de quatro arquivos.
Validação complementar do app em 08/10/2026: 22 verificações aprovadas em HTTPS.
As quatro amostras reais foram lidas pelo app com SHA-256 idêntico, cache privado
e resposta 401 sem login. Fixtures descartáveis validaram login e cookies seguros,
ACL privada (dono permitido, outro usuário 403), ACL public ainda exigindo login,
miniatura armazenada com ACL do original e Kit (peça própria permitida, alheia 403,
inclusive com `?thumb=1`). O admin acessou a peça Kit sem ACL privada.
Os três usuários, evento, remessa, peça, sessões e quatro objetos sintéticos foram
removidos. Contagens do banco e conjunto de chaves R2 conferidos com o estado
anterior: zero usuários/eventos/peças/remessas/sessões e as quatro amostras mantidas.
Relatório: `resultado-validacao-storage-acesso.json`.
A ACL explícita foi testada com arquivos sintéticos; a validação de metadados
de todos os arquivos reais permanece parte da futura cópia completa.
