# Preparação da Gráfica — Hetzner + Cloudflare

## Estado atual — 09/10/2026

VPS conferida e preparada para continuar a homologação, com backup PostgreSQL no
R2. Replit permanece ativo; sua desativação e a troca de produção dependem de
autorização explícita do responsável. Consulte o
[estado atual e procedimento de troca/retorno](../../docs/vps-preparada-e-procedimento-de-troca.md).
As seções abaixo preservam o histórico da preparação inicial.

## Estado em 07/10/2026

**Atualização:** SSH operacional pela porta **2222**, com autenticação por chave
e `sudo -n`. A limpeza dos hotsites, incluindo resíduos e cópias temporárias,
foi concluída e verificada, com backup local conferido. Caddy permanece instalado, mas está
parado/desabilitado e suas rotas antigas foram excluídas. As portas 80 e 8080
ficaram livres. Detalhes em [REMOCAO-HOTSITES.md](REMOCAO-HOTSITES.md).
O inventário abaixo descreve a condição inicial, antes da limpeza.

Docker Engine 29.8.2 e Compose 5.6.0 foram instalados pelo repositório oficial.
Os arquivos estão em `/home/marcosvinicius/grafica-homolog/infra` na VPS.
PostgreSQL 16 está saudável no projeto `grafica-homolog`, com banco
`grafica_homolog`, volume persistente e rede própria. Não possui porta publicada
no host. A conta `grafica_app` não é superusuária e não pode criar bancos ou roles.
Credenciais distintas foram geradas apenas na VPS e salvas em `.env` com modo 600.

Foram verificados: autenticação TCP da conta da aplicação, persistência após
reinício do container, backup em formato custom e restauração real em banco
descartável. A tabela e o banco usados no teste foram removidos ao final.
O último backup limpo está em `infra/backups/grafica-20261007T192819Z-1063699.dump`
na VPS. Backups externos/automáticos ainda precisam de configuração.
Não houve importação do Neon, publicação do app ou alteração de DNS/R2.

Use `ssh -p 2222 vps` e `scp -P 2222 ...`. A configuração SSH local não foi
modificada. A causa do timeout na porta 22 permanece sem confirmação;
detalhes em [DIAGNOSTICO-SSH.md](DIAGNOSTICO-SSH.md).

Destino confirmado: `5.161.234.21`, acesso SSH `vps`, usuário `marcosvinicius`.
Domínio solicitado: `grafica.appsnorte.com`.

A inspeção por SSH encontrou Ubuntu 26.04 LTS x86_64, 2 CPUs, 1,9 GiB de RAM,
38 GiB de disco (32 GiB disponíveis), sem swap e sem Docker no PATH.
Caddy está ativo; as portas 80 e 8080 estão ocupadas. Existe `/srv/hotsites`.
O servidor tem serviços anteriores: sua preservação faz parte da preparação.

`sudo -n` exige autenticação interativa. A tentativa de acesso direto por root
não concluiu; requisições posteriores tiveram timeout. Nada foi instalado ou
alterado no servidor nesta etapa. O DNS e o R2 não foram alterados. A consulta
pública confirmou os servidores DNS Cloudflare de `appsnorte.com`, mas
`grafica.appsnorte.com` retornou nome inexistente. A cópia dos arquivos para
o servidor não concluiu devido a timeouts SSH; os artefatos permanecem locais.

## O que está preparado

- `instalar-docker-ubuntu.sh`: Docker/Compose pelo repositório oficial Ubuntu,
  sem remoção automática de pacotes conflitantes e sem substituir Caddy.
- `compose.yaml`: PostgreSQL 16 de homologação, volume persistente, rede própria,
  healthcheck, rotação de logs e limites iniciais de CPU/RAM; sem porta pública.
- `init/01-usuario-grafica.sh`: conta exclusiva da aplicação, sem superuser,
  com acesso ao banco da Gráfica. Executado somente na inicialização de volume vazio.
- `.env.example`: nomes e configurações sem segredos; os e-mails ficam desligados.
- `backup-postgres.sh`: dump custom, arquivo com acesso restrito e verificação do
  catálogo. Backup externo, retenção e teste de restauração ainda serão configurados.

Esta composição prepara o banco. A aplicação ainda precisa de driver PostgreSQL
TCP, storage R2, transporte de e-mail independente e correções do review para
rodar sem Replit. Ela não está incluída no Compose nesta fase.

Os limites do banco são iniciais para homologação no servidor inspecionado,
não dimensionamento final. Builds do frontend/servidor serão avaliados fora
dessa máquina de 2 GB para evitar disputa com os serviços ativos.

## Instalar a base

O pacote `artifacts/deploy/grafica-infra-preparacao.zip` contém os sete arquivos
desta pasta, sem credenciais. Extrair e transferir para um diretório próprio
do usuário, por exemplo
`~/grafica-homolog/infra`. Não reutilizar `/srv/hotsites`.

No servidor, uma pessoa com sudo executa:

```sh
cd ~/grafica-homolog/infra
sudo sh instalar-docker-ubuntu.sh
```

Alternativa: disponibilizar ao agente acesso administrativo por chave para
executar esse mesmo script. Não compartilhar senha de sudo ou chaves privadas
no chat. A instalação exige privilégio administrativo; o SSH atual não o fornece.

Depois de Docker disponível:

```sh
cp .env.example .env
chmod 600 .env
chmod 755 init
chmod 644 init/01-usuario-grafica.sh
openssl rand -hex 32
openssl rand -hex 32
# Preencher POSTGRES_ADMIN_PASSWORD e GRAFICA_DB_PASSWORD com valores distintos.
# Não reutilizar a credencial do Neon.
sudo docker compose --env-file .env -f compose.yaml config --quiet
sudo docker compose --env-file .env -f compose.yaml up -d postgres
sudo docker compose --env-file .env -f compose.yaml ps
sudo sh backup-postgres.sh
```

`config --quiet` valida sem imprimir as senhas. Senhas não devem aparecer em
comandos registrados no histórico. Não executar `down -v`: apaga o volume do banco.
Alterar senhas no `.env` não altera usuários de um banco já inicializado.

O PostgreSQL não escuta na internet nem em 5432 no host. Migrações e aplicação
serão executadas em containers na rede própria. A cópia do Neon será importada
em homologação numa etapa separada, preservando o banco atual durante a validação.

## Próximas etapas

1. Obter acesso administrativo e validar o Caddy existente antes de alterar rotas.
2. Instalar Docker e iniciar apenas PostgreSQL de homologação; testar persistência,
   usuário da aplicação, backup e restauração em banco descartável.
3. Criar um bucket R2 privado exclusivo da Gráfica e token limitado a esse bucket,
   na conta Cloudflare da empresa. Ainda faltam acesso à conta e identificador.
4. Adaptar aplicação/driver/storage, preparar imagem e injetar segredos no servidor.
5. Configurar `grafica.appsnorte.com` na Cloudflare e acrescentar uma rota no Caddy
   para o serviço da Gráfica. A porta do app será restrita a loopback/rede interna.
   Preservar Host, HTTPS encaminhado, upload de 50 MB e WebSocket `/ws`.
6. Importar cópias de banco e arquivos, homologar sem e-mails para a equipe real,
   definir backups externos e fazer o corte somente após validação.

O domínio foi informado pelo usuário, mas titularidade, registros DNS existentes,
modo TLS e acesso à conta ainda precisam de verificação. Um painel Coolify não
foi instalado: o proxy e os recursos existentes devem ser considerados antes
de introduzir outro gerenciador no servidor.

## Validação desta preparação

O YAML foi lido sem erros e foram conferidas a ausência de portas publicadas,
as senhas obrigatórias e as quebras de linha LF dos scripts. Não foi possível
executar `sh -n` no servidor porque a conexão interrompeu a transferência.
Docker não está disponível no computador local; Compose e execução do
PostgreSQL ainda precisam de validação no servidor após obter acesso administrativo.

## Referências

- [Instalação oficial do Docker no Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Configuração de ambiente no Compose](https://docs.docker.com/compose/how-tos/environment-variables/envvars/)
- [Review e plano da migração](../../docs/revisao-tecnica-migracao-vps.md)
# Estado atual — 07/10/2026

A homologação já está publicada em https://grafica.appsnorte.com, com PostgreSQL,
R2 e Caddy. Consulte [operação e validação atuais](../../docs/homologacao-vps.md).
Os procedimentos abaixo registram a preparação inicial e suas limitações na época;
afirmações sobre ausência de sudo, Docker, aplicação e acesso Cloudflare foram
superadas pela implantação documentada acima.
