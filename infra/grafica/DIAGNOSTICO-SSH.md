# Diagnóstico SSH — 2026-10-07

Destino: VPS da Gráfica, 5.161.234.21. Preparação do ambiente pausada a pedido
do usuário para investigar os timeouts. Nenhuma senha está registrada aqui.

## Evidências observadas

- A autenticação de root pelo console web da Hetzner funcionou às 18:47 UTC.
- O SSH por chave alterna entre sucesso e timeout antes da autenticação.
- Serviço SSH ativo; UFW inativo; ruleset nftables vazio na inspeção realizada.
  A interface Hetzner consultada não mostrava firewall associado ao servidor.
- Memória e carga sem sinais de saturação durante a inspeção. Tentativas externas
  automatizadas de login existem, mas não foi comprovada relação com os timeouts.
- IPQoS=none também sofreu timeout. Não foi alterada a configuração SSH local.
- A captura em `/var/tmp/grafica-ssh-diagnostico.WQA0gY/handshake.log`
  mostrou SYN recebido às 18:38:31 UTC, SYN-ACK enviado imediatamente e
  retransmitido até 18:39:03, sem conclusão da conexão.
- Nova captura de 45 segundos em
  `/var/tmp/grafica-ssh-diagnostico.QqrnHe/handshake.log`, consultada pelo console,
  mostrou SYN recebido às 18:45:18.798200 e SYN-ACK enviado às
  18:45:18.798241; retransmissões às 18:45:19, 21, 25, 34 e 50.
  Três sondagens locais iniciadas às 18:45:09, 15 e 22 terminaram em timeout.
  Apenas uma nova conexão aparece nessa captura, apesar das três tentativas.
- Teste pelo IPv6 confirmado no console também não abriu conexão; isso não
  identifica a causa da falha IPv4 nem comprova conectividade IPv6 local.

## Interpretação e próximos passos

Há evidência de falha no estabelecimento TCP: em uma tentativa a VPS recebeu
o pacote inicial e respondeu, mas não recebeu a confirmação. Algumas tentativas
nem aparecem na captura. O ponto de perda ainda pode estar no computador,
roteador/NAT, operadora, trânsito ou infraestrutura de rede do provedor.
Não há evidência para atribuir a causa à senha ou à aplicação da Gráfica.

Foi solicitado teste de `ssh vps` no mesmo computador usando hotspot de celular.
Comparar esse resultado com a rede original é o próximo passo para localizar
o problema. Se falhar em redes distintas, coletar capturas correlacionadas e
encaminhar evidências ao suporte do provedor mediante autorização do usuário.

Não foram reiniciados o SSH ou a VPS, alteradas regras de firewall, abertas
portas adicionais ou modificados os mecanismos de autenticação neste diagnóstico.
As capturas terminaram por timeout e contêm cabeçalhos, sem conteúdo de sessão.
A limpeza residual dos hotsites e a instalação do ambiente estavam pendentes
durante a investigação na porta 22.

## Atualização: acesso pela porta 2222

O usuário informou que a porta 2222 está aberta. Três conexões consecutivas
por chave funcionaram, seguidas de consultas administrativas com `sudo -n`.
O servidor foi confirmado em escuta nas portas 22 e 2222. As operações da
migração passaram a usar explicitamente `ssh -p 2222` e `scp -P 2222`.
Não foi alterado o arquivo SSH local. A causa da falha na porta 22 permanece
sem confirmação; o acesso pela 2222 permite retomar a preparação.

A limpeza residual foi executada e a ausência de todos os alvos foi verificada
em uma conexão independente. Um caractere CR acrescentado pelo pipeline do
PowerShell gerou erro após a última linha do script; a checagem posterior
confirmou que as exclusões terminaram. Os arquivos da preparação agora são
transferidos por SCP após normalização para LF.
