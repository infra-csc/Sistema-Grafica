# Acesso ao PostgreSQL da Gráfica pelo pgAdmin

**Configurado e validado em 07/10/2026:** PostgreSQL escuta somente em
`127.0.0.1:5432` na VPS. Túnel SSH temporário testado desta máquina e encerrado;
autenticação TCP com `grafica_app` aprovada. A aplicação restabeleceu LISTEN/NOTIFY.
Houve intermitência SSH antes da aplicação; sua causa ainda não foi identificada.

O banco de homologação pode ser acessado por túnel SSH. A porta 5432 da VPS
deve escutar apenas em `127.0.0.1`, conforme `infra/grafica/compose.yaml`.
Não abrir 5432 no firewall nem usar o IP público como host do banco no pgAdmin.

Em **Register → Server**, usar:

| Aba | Campo | Valor |
|---|---|---|
| General | Name | Gráfica — Homologação |
| Connection | Host name/address | `127.0.0.1` |
| Connection | Port | `5432` |
| Connection | Maintenance database | `grafica_homolog` |
| Connection | Username | `grafica_app` |
| Connection | Password | Senha própria do banco na VPS |
| Parameters | Connection timeout | `15` |
| SSH Tunnel | Use SSH tunneling | Yes |
| SSH Tunnel | Tunnel host | `5.161.234.21` |
| SSH Tunnel | Tunnel port | `2222` |
| SSH Tunnel | Username | `marcosvinicius` |
| SSH Tunnel | Authentication | Identity file |
| SSH Tunnel | Identity file | `C:\Users\marcos.meira\.ssh\id_vps` |
| SSH Tunnel | Keep alive | `30` |

SSL mode pode ficar em `prefer`; a conexão externa é criptografada pelo SSH.
Não configurar `require` para o PostgreSQL interno sem antes provisionar TLS nele.
Se a chave SSH possuir passphrase, informá-la quando o pgAdmin solicitar.
A chave deve estar na máquina onde o pgAdmin está executando.

Para consultar a senha **no seu próprio terminal**, sem enviá-la ao chat:

```powershell
ssh -p 2222 vps "sed -n 's/^GRAFICA_DB_PASSWORD=//p' ~/grafica-homolog/infra/.env"
```

Essa é a senha do usuário `grafica_app`, diferente da senha SSH e da senha
administrativa do PostgreSQL. Esse usuário possui acesso de leitura e escrita
no banco da Gráfica; não é administrador do cluster.

Depois de conectar, abrir Query Tool em `grafica_homolog` e conferir:

```sql
SELECT current_database(), current_user, version();
```

O banco ainda contém apenas a estrutura de homologação, sem dados de produção.
Se ocorrer timeout no túnel antes de pedir a senha do banco, conferir primeiro
`ssh -p 2222 vps`; o acesso SSH apresentou intermitências de rede nesta preparação.

Referência: https://www.pgadmin.org/docs/pgadmin4/latest/server_dialog.html
