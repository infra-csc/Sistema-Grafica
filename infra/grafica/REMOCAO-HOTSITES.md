# Remoção dos hotsites — solicitação de 07/10/2026

O usuário autorizou remover da VPS os hotsites para dedicar o ambiente à Gráfica.
A remoção foi executada depois que `sudo -n` passou a fornecer acesso root.
O script foi conferido com `sh -n` no Ubuntu e executado com o hash revisado
`1facf4594f1ed5deca6687d6fd3675619cb68b0b928fee6f8042ee203050aae5`.
Os diretórios, configurações e logs prod/dev dos hotsites foram removidos; Caddy foi
parado e desabilitado. A consulta de sockets após a execução mostrou as portas
80 e 8080 livres.

Dois backups completos foram baixados e tiveram seus checksums comparados.
A cópia final está em `artifacts/backups/hotsites-vps-20261007-final.tar.gz`,
SHA256 `b6a3f41ec0080350eed62973299dc03f5ef149d9becad92797f9eac3cce48d14`.
Ela inclui arquivos, configurações e logs anteriores à remoção.

## Inventário verificado

- `/srv/hotsites`: 4,1 MB, propriedade de `caddy:caddy`; inclui home, produção,
  desenvolvimento e a praça São Paulo, além de links `live` internos.
- `/etc/caddy/Caddyfile`: configura somente os hotsites nas portas 80 e 8080.
- `/etc/caddy/Caddyfile.before-home`: cópia anterior com referência aos hotsites.
- `/var/log/caddy/prod.log` e `dev.log`: logs privados do usuário Caddy.
- A busca em unidades systemd e `/etc/cron.d` não encontrou outras referências
  legíveis aos diretórios. O crontab da conta SSH não retornou tarefas.

O processo Claude Remote e o SSH são ferramentas de administração e permanecem
fora da exclusão. O binário Caddy será preservado para o futuro proxy da Gráfica;
suas rotas atuais serão removidas e o serviço parado/desabilitado.

## Execução preparada

Transferir `remover-hotsites.sh` para o servidor e conferir a configuração atual:

```sh
sh remover-hotsites.sh --verificar
cat /etc/caddy/Caddyfile
```

Com o hash SHA256 exibido e após confirmar que a configuração continua sendo
exclusivamente dos hotsites:

```sh
sudo sh remover-hotsites.sh --aplicar HASH_SHA256_DO_CADDYFILE
```

O script valida os caminhos, verifica o hash, cria e confere um backup antes
de qualquer exclusão e remove os alvos específicos. Se o backup falhar, não
para o serviço nem apaga os arquivos. Não altera contas, SSH, Claude Remote,
firewall, DNS ou bancos.

O arquivo de recuperação fica temporariamente em
`/var/tmp/grafica-hotsites-recuperacao.XXXXXX/hotsites.tar.gz`, acessível apenas
ao usuário SSH. Ele deverá ser baixado, ter o checksum comparado e ser removido
da VPS para concluir a limpeza. A conferência do catálogo não substitui um
teste de restauração.

O backup local foi confirmado antes da primeira exclusão. As cópias temporárias
na VPS ainda precisam ser retiradas: as tentativas dessa limpeza adicional
falharam por timeout ao conectar à porta SSH. São os diretórios exatos
`/var/tmp/grafica-hotsites-previo.T4l4p2` e
`/var/tmp/grafica-hotsites-recuperacao.c0KYwV`, além do script enviado à conta SSH
em `~/grafica-migracao/remover-hotsites-20261007.sh`. O catálogo do backup também
revelou `direct-test.log` em `/var/log/caddy`, que deve ser incluído na limpeza
residual. Não foi confirmada a remoção
desses artefatos temporários. O backup final já está fora da VPS, com checksum
comparado. A reinstalação dos hotsites não faz parte do escopo.

`limpar-residuos-hotsites.sh` reúne somente os alvos restantes, com caminhos
conferidos e bloqueio se um Caddyfile novo já tiver sido criado. Sua execução
também aguardava a recuperação do SSH.

## Conclusão da limpeza residual

Em 2026-10-07 o acesso foi recuperado usando a porta SSH 2222 informada pelo
usuário. O script de limpeza residual foi executado. Uma conexão independente
confirmou a ausência de `/srv/hotsites`, `/etc/caddy/Caddyfile`, `/var/log/caddy`,
dos dois diretórios temporários de backup e do script antigo da conta SSH.
Os backups locais foram preservados. A preparação do ambiente da Gráfica foi
retomada pela porta 2222.
