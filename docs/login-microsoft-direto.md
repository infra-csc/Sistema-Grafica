# Login Microsoft direto na Gráfica

Código instalado e login real validado em 09/10/2026, após cadastro do callback pelo responsável no Microsoft Entra. O destino ativo da Gráfica no Portal NORTE permanece no Replit.

## Comportamento

- Tela de login: botão **Entrar com Microsoft**, apontando para `/api/auth/microsoft`.
- Texto secundário: **Ainda não tem acesso? Entre no portal NORTE e solicite acesso à Gráfica.** Link para `https://norte-app-hub.replit.app/`.
- Entrada Microsoft pelo fluxo de autorização com código, PKCE S256, state e nonce. Credencial do aplicativo somente no servidor, com biblioteca oficial MSAL Node.
- Callback: `/api/auth/microsoft/callback`. Confere tenant/nonce e identidade autenticada no Microsoft Graph. Não aceita e-mail fornecido pelo navegador para autenticar.
- Exige usuário já cadastrado no PostgreSQL da Gráfica. Não cria contas ou altera perfis. Reutiliza a troca de uso único e a sessão existentes, inclusive regras de Kit e Cultura.
- O caminho SSO do portal e a entrada por senha continuam disponíveis.

## Configuração externa

No Microsoft Entra, localizar a inscrição de aplicativo usada para o login corporativo. Em **Autenticação**, adicionar à plataforma **Web** a URL de retorno abaixo, preservando todos os retornos existentes do portal:

```text
https://grafica.appsnorte.com/api/auth/microsoft/callback
```

Configurar somente no arquivo privado `app.env` da VPS:

```text
MICROSOFT_TENANT_ID=<tenant corporativo>
MICROSOFT_CLIENT_ID=<aplicativo registrado>
MICROSOFT_CLIENT_SECRET=<credencial válida existente>
MICROSOFT_REDIRECT_URI=https://grafica.appsnorte.com/api/auth/microsoft/callback
```

Não substituir a credencial ou o callback do portal. O endpoint `/api/auth/microsoft/status` informa apenas se a configuração local está completa; isso não confirma cadastro do retorno nem validade da credencial na Microsoft.

## Verificação e pacote

- 45 testes aprovados: dez do fluxo Microsoft e 35 da sessão/SSO existente.
- TypeScript sem erros; frontend e backend compilados.
- Retorno adulterado/expirado, tenant/nonce divergentes, identidade Graph divergente e conta ausente recusados. Reutilização de callback recusada.
- Pacote preparado em `artifacts/grafica-release-20261009-microsoft.tar.gz`.
- Login real aprovado no navegador com a conta Marcos Meira, perfil Solicitação: Microsoft → callback da VPS → troca de uso único → Painel Geral. A sessão Microsoft existente foi reutilizada; não foi necessário digitar senha.

Imagem instalada: `grafica-homolog:20261009-microsoft`, contexto `/home/marcosvinicius/grafica-homolog/release-microsoft-20261009`. Banco continua sendo a cópia `grafica_import_20261008`. E-mails e digests continuam desativados. Backup anterior à implantação: `/home/marcosvinicius/grafica-homolog/infra/backups/config-microsoft-20261009T141940Z`, contendo configuração da imagem `20261009-sso`; imagem anterior preservada.

No primeiro teste real, a biblioteca MSAL recusou o retorno por `nonce_mismatch`: o nonce da autorização não havia sido passado a `acquireTokenByCode`. Corrigido e coberto por verificação nos testes, sem remover a validação. Novo login real aprovado. Logs registram apenas etapa e código da falha, sem códigos de autorização ou tokens.

Regressão executada após a implantação: SSO no formato do portal, sessão HTTPS, troca de uso único, rejeições, logout e leitura JPEG/PDF/miniatura R2 aprovados. Essa regressão usa conta sintética removida ao final; o login Microsoft real foi validado separadamente. O destino `producao` no portal e os segredos da origem não foram alterados.

Documentação do protocolo: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
