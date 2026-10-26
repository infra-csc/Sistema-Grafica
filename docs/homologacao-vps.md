# Homologação da Gráfica na VPS

Atualização em 09/10/2026: app usa a cópia `grafica_import_20261008`, imagem `20261009-microsoft`, login Microsoft direto validado e chave SSO alinhada. Destino ativo no portal permanece no Replit. Fluxos de pedido, arte, aprovação, produção e entrega aprovados pelas APIs da homologação, assim como arquivos e miniaturas no R2. Ver [homologação com os dados copiados](homologacao-dados-copiados-20261009.md) e [login Microsoft direto](login-microsoft-direto.md). As seções seguintes registram a implantação inicial de 07/10 e descrevem o estado daquela data.

Implantação concluída em 07/10/2026 em https://grafica.appsnorte.com.
Este ambiente ainda não contém os dados de produção nem contas para uso da equipe.

## Componentes

- VPS Hetzner `5.161.234.21`; SSH na porta 2222.
- DNS Cloudflare: registro A `grafica`, IP da VPS, proxy ativado, TTL Auto.
  Os registros preexistentes `bi` e `plane` foram preservados.
- Caddy como serviço systemd habilitado, com certificado público Let's Encrypt,
  renovação automática e redirecionamento HTTP para HTTPS.
- Imagem `grafica-homolog:20261007-r2`, Node 24.15.0, processo não root,
  filesystem somente leitura, `/tmp` temporário e limite de 512 MB.
- Aplicação publicada somente em `127.0.0.1:5000`; o Caddy recebe o tráfego externo.
- PostgreSQL 16 em rede Docker própria, porta publicada somente em
  `127.0.0.1:5432` para túnel SSH do pgAdmin, e usuário da aplicação
  sem superuser/createdb/createrole. Banco `grafica_homolog`.
- R2 privado `grafica-homolog-arquivos`. Resend e digests desligados.

O Caddy aceita cabeçalhos de IP real somente das faixas oficiais Cloudflare;
encaminha ao Express um único IP validado, compatível com `trust proxy = 1`.
WebSocket é encaminhado pelo `reverse_proxy`. O limite do proxy é 50 MB.
Faixas consultadas em https://www.cloudflare.com/ips/ e comportamento em
https://caddyserver.com/docs/caddyfile/options#trusted-proxies.

A zona Cloudflare utiliza atualmente modo TLS **Completo**. O certificado da
origem foi validado diretamente, sem ignorar erros TLS. Não foi alterado o modo
global da zona, compartilhada com outros aplicativos.

## Arquivos e segredos

Base na VPS: `/home/marcosvinicius/grafica-homolog`.

- `infra/compose.yaml`: PostgreSQL.
- `infra/compose.app.yaml`: aplicação e seus limites.
- `infra/.env`: credenciais do banco.
- `infra/services.env`: R2 e opções dos serviços.
- `infra/app.env`: DATABASE_URL, SESSION_SECRET e SSO_SECRET próprios.
- `release/`: pacote compilado, dependências declaradas e migrações.
- `/etc/caddy/Caddyfile`: proxy ativo.

Os três arquivos reais de ambiente ficam somente na VPS com modo 600.
Não imprimir `docker compose config` sem `--quiet`: a saída pode conter segredos.
O segredo SSO é isolado; o portal corporativo ainda não está integrado.
Não foi configurada `SEED_PASSWORD` nem criado usuário permanente nesta etapa.

O frontend e o backend foram compilados localmente. A VPS apenas instalou as
dependências da imagem. O bundle atual importa Vite estaticamente, por isso esta
primeira imagem também inclui devDependencies; separar o módulo de desenvolvimento
permite reduzi-la posteriormente. Ela não recebe credenciais no build.

Pacote `grafica-release-20261007-r2.tar.gz` conferido nos dois lados:
SHA256 `5c317a32f17094e93287eac2d8b4cfbfa9476dd09a4e2aa2530e0705fd439003`.

## Operação

```sh
ssh -p 2222 vps
cd ~/grafica-homolog/infra
sudo docker compose -f compose.yaml -f compose.app.yaml ps
sudo docker compose -f compose.yaml -f compose.app.yaml logs --tail=50 app
sudo docker compose -f compose.yaml -f compose.app.yaml restart app
sudo journalctl -u caddy --no-pager -n 50
```

Migrações não rodam automaticamente ao reiniciar:

```sh
# Simular antes de aplicar, sempre no banco de homologação.
sudo docker compose -f compose.yaml -f compose.app.yaml run --rm --no-deps app node scripts/migrar.mjs
sudo sh backup-postgres.sh
sudo docker compose -f compose.yaml -f compose.app.yaml run --rm --no-deps app node scripts/migrar.mjs --aplicar
```

Não executar `down -v`. O volume contém o banco.
Atualizações devem manter uma imagem anterior disponível para voltar o código;
reverter schema exige plano próprio e backup, não apenas trocar a imagem.

## Validação realizada

- Build aprovado e integridade do pacote conferida na VPS.
- Seis migrações aplicadas por transação no banco inicialmente vazio.
- Aplicação e PostgreSQL saudáveis; LISTEN/NOTIFY conectado.
- HTTPS público e HTTPS direto na origem responderam 200 com certificados válidos.
- Tela de login renderizada no navegador.
- `validar-homolog.mjs`: usuário descartável, login HTTPS, cookie Secure/HttpOnly,
  sessão persistida no PostgreSQL, upload PNG por proxy para R2, download idêntico
  e resposta 401 para acesso ao arquivo sem login. Todos aprovados.
- Usuário, sessão, original e miniatura sintéticos removidos ao final.
- Estado final: zero usuários, peças e sessões; seis migrações; zero objetos R2.
- Memória observada em repouso: app ~127 MiB e PostgreSQL ~33 MiB.
- Backup pós-migração com catálogo validado:
  `infra/backups/grafica-20261007T202419Z-1073992.dump`.

O healthcheck do container verifica resposta HTTP da aplicação; não substitui
monitoramento do banco ou R2. Backup externo, retenção automatizada e restauração
do backup pós-migração continuam pendentes para a entrada em produção.

## Próxima etapa

Acesso pgAdmin concluído em 07/10/2026: após intermitências SSH, o Compose foi
transferido e PostgreSQL recriado preservando seu volume. `ss` confirmou somente
`127.0.0.1:5432`; autenticação TCP com `grafica_app` aprovada e seis migrações
preservadas. Túnel SSH temporário desta máquina recebeu resposta PostgreSQL e
foi encerrado após o teste. App saudável e LISTEN/NOTIFY restabelecido.
Backup anterior à alteração criado:
`infra/backups/grafica-20261007T202738Z-1074973.dump`.
Configuração do cliente: [acesso pelo pgAdmin](acesso-pgadmin.md).

Copiar o banco atual e os arquivos para homologação, preservando suas chaves
relativas, e validar os fluxos com dados reais. Antes de restaurar um dump,
conferir a estratégia de schema/migrações e gerar um novo backup do destino.
Senhas dos usuários virão da cópia; os segredos de sessão devem continuar próprios
e as sessões da origem não devem ser reutilizadas. Nenhum corte de produção foi
feito e o Neon não foi modificado nesta implantação.
