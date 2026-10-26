# Login Microsoft e migração da Gráfica

Mapeamento iniciado em 08/10/2026 e complementado em 09/10/2026 com leitura do projeto do hub no Replit. Fluxo confirmado no código: Microsoft → Portal NORTE → Gráfica. O código do portal foi consultado pelo editor remoto; não foi copiado para este projeto.

## Contrato atual

1. O Portal NORTE autentica a pessoa pela Microsoft. O callback OAuth, tenant, client ID e credenciais Microsoft precisam ser conferidos no portal; não existem neste código da Gráfica.
2. O portal encaminha para a Gráfica uma URL com `portal_sso=<JWT>`. O destino previsto na VPS é `https://grafica.appsnorte.com/`.
3. A Gráfica valida assinatura HS256 com `SSO_SECRET`, emissor `norte-portal`, idade máxima de cinco minutos e tolerância de relógio de 30 segundos. O payload precisa conter `email`.
4. O e-mail precisa corresponder a um usuário existente em `users`, sem diferenciar maiúsculas de minúsculas. O portal não cadastra automaticamente o usuário na Gráfica. Perfis e permissões vêm do PostgreSQL da Gráfica.
5. A Gráfica gera token de troca de uso único válido por 60 segundos, guardando somente seu hash na tabela `sso_tokens_de_troca`. O frontend consome esse token em `POST /api/auth/sso-exchange`, criando a sessão local.
6. Cookie de sessão HTTPS, HttpOnly, SameSite=Lax; sete dias sem atividade e teto absoluto de 30 dias desde o login. O logout encerra a sessão da Gráfica e navega para `VITE_HUB_URL`; isso não comprova logout da Microsoft ou do portal.

O parâmetro `portal_return` aparece no comentário da rota, mas não é consumido pelo código atual. O endereço de retorno efetivo depende de `VITE_HUB_URL` no build.

## Estado conferido na VPS

| Ponto | Estado |
| --- | --- |
| HTTPS da Gráfica | Configurado em `grafica.appsnorte.com` |
| `SSO_SECRET` | Alinhado ao `SESSION_SECRET` da publicação do hub; segredo de sessão local separado |
| Link para o portal | Frontend recompilado e instalado com `https://norte-app-hub.replit.app/` |
| Banco conectado ao app | Cópia `grafica_import_20261008`, com 51 usuários |
| Banco inicial vazio | `grafica_homolog` preservado para retorno da configuração |
| Cadastro da Gráfica no portal | Slug `producao`; destino ainda no Replit. Código do editor assina com `SESSION_SECRET` do hub; variável presente nos secrets de produção |
| Login real Microsoft → VPS | Pendente |

## Ajustes para concluir

- Endereço, código e painel de publicação do Portal NORTE localizados e conferidos em leitura. Preservar o acesso atual enquanto a VPS é validada.
- Alinhar o segredo SSO da Gráfica na VPS ao segredo usado pelo portal para este app, mantendo `SESSION_SECRET` separado. Não publicar os valores em documentação ou bundle.
- Compilar o frontend com `VITE_HUB_URL` apontando para o portal real. A variável foi adicionada ao exemplo de ambiente para documentar essa dependência.
- Conectar a homologação ao banco copiado antes de testar pessoas reais, pois SSO exige cadastro local.
- Testar pela Microsoft: usuário cadastrado, perfil correto, acesso aos próprios arquivos, logout e reentrada; token inválido e e-mail não cadastrado devem continuar recusados.
- Alterar o destino definitivo da Gráfica no portal apenas na etapa de corte, após sincronizar banco e arquivos.

No código do editor do hub, o callback Microsoft retorna ao próprio portal. A migração somente da Gráfica conserva esse callback; sua configuração efetiva publicada deve ser confirmada durante a validação real.

## Verificação

Suíte local `seguranca-sessao-kit-trilha.test.ts`: 35 testes aprovados, incluindo assinatura/emissor/idade do JWT, uso único e expiração do token de troca, e regras de sessão. Esses testes não substituem o login real pela Microsoft. Nenhuma configuração ativa do portal ou da produção foi alterada nesta etapa.

## Hub localizado e código conferido em 09/10/2026

Portal informado: `https://norte-app-hub.replit.app/`. Projeto acessado em modo de leitura: `https://replit.com/@infraestrutura2/NORTE-App-Hub`. A implementação atual do editor foi conferida; sua equivalência com a versão publicada ainda precisa ser confirmada antes do teste completo.

| Arquivo no hub | Resultado |
| --- | --- |
| `artifacts/norte-portal/src/lib/apps.ts` | Gráfica usa slug `producao`, destino atual `https://print-flow-manager-infraestrutura2.replit.app`, recebimento de `portal_sso` na raiz e retorno via `portal_return` |
| `artifacts/api-server/src/routes/sso.ts` | Emissão usa e-mail da identidade Microsoft validada, exige permissão do app e status `ativo`; registra abertura no histórico |
| `artifacts/api-server/src/lib/sso.ts` | HS256, emissor `norte-portal`, TTL `2m`, audiência `payload.app`, identificador único `jti`; assina com **`SESSION_SECRET` do hub**, não com variável `SSO_SECRET` |
| `artifacts/norte-portal/src/auth/msalConfig.ts` | MSAL com `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`; callback por `VITE_AZURE_REDIRECT_URI` ou origem/base do próprio hub; escopos openid/profile/email/User.Read |

A documentação `.local/instrucoes-sso-controle-acesso.md` é para outro aplicativo e menciona TTL de dez minutos. Ela não representa o contrato atual observado em `lib/sso.ts`; não foi aplicada à Gráfica.

O **`SSO_SECRET` da Gráfica deve corresponder ao segredo com que a versão publicada do hub assina seus tokens**. No código observado, esse segredo é `SESSION_SECRET` do hub. O `SESSION_SECRET` da Gráfica continua próprio. Não alterar o segredo do hub: isso pode afetar todos os aplicativos.

O callback Microsoft permanece no hub enquanto só a Gráfica é migrada. Caso o hub também seja migrado futuramente, será necessário revisar os redirects Microsoft naquele momento. A entrada da Gráfica passa a ser `https://grafica.appsnorte.com/?portal_sso=<TOKEN>&portal_return=<RETORNO>`, conservando slug `producao` e permissões atuais. A alteração de `APP_ENDPOINTS.producao.url` no hub fica para o corte, depois da homologação.

O endereço público correto foi preenchido em `.env.example` para `VITE_HUB_URL`. Nenhum arquivo do hub, segredo ou destino ativo foi modificado. A configuração da VPS foi concluída abaixo; falta testar o fluxo real.

O painel **Publicação → Ajustar configurações → Secrets do app de produção** foi consultado em leitura e confirmou a presença de `SESSION_SECRET`. Nenhum valor foi alterado e não houve republicação. A presença da variável não comprova, isoladamente, que o código publicado seja idêntico ao editor.

Build local separado concluído com `VITE_HUB_URL=https://norte-app-hub.replit.app/`, saída em `artifacts/migracao-sso/public`. O endereço foi conferido no JavaScript gerado e instalado na VPS na imagem `20261009-sso`. O segredo SSO foi alinhado e a cópia do banco foi conectada. Testes técnicos aprovados; login real pela Microsoft permanece pendente. Detalhes, limitações e retorno da configuração em [validação na VPS](validacao-sso-vps-20261009.md).
