# Etapa 3 — Cloudflare R2 da Gráfica

Escopo atual: configurar somente a Cloudflare. Resend adiado por solicitação
do usuário; sua conta e seus registros DNS serão tratados em outra etapa.

## Estado atual

Bucket `grafica-homolog-arquivos` criado na conta Cloudflare da empresa em
07/10/2026, classe Standard e acesso público **desabilitado**. Não foram
transferidos arquivos de produção, alterados DNS ou habilitado `r2.dev`.

O código tem adaptador R2 pela API S3, preserva `/objects/...`, miniaturas,
ACL e leitura HTTP Range. Desenvolvimento continua usando o emulador GCS.
Para URLs do bucket antigo, `LEGACY_PRIVATE_OBJECT_DIRS` declara o prefixo;
os arquivos terão de ser copiados para as mesmas chaves relativas antes
de usar os dados importados. Normalização de URL não transfere conteúdo.

Metadados de ACL são codificados para cabeçalhos S3 e recuperados pelo app.
Atualização de metadados preserva Content-Type e usa ETag para evitar substituir
conteúdo modificado entre leitura e cópia. Erros de permissão não são tratados
como ausência de arquivo.

Modelo e script de configuração disponíveis na VPS:
`/home/marcosvinicius/grafica-homolog/infra/services.env.example` e
`configurar-chaves-servicos.sh`. O arquivo real `services.env` foi criado
na VPS por SSH, com modo 600 e proprietário `marcosvinicius`.
As chaves reais não foram gravadas no projeto local nem incluídas nesta documentação.

## Credencial R2 criada

- Nome: `grafica-homolog-vps`, token da conta.
- Permissão: leitura/gravação de objetos.
- Escopo: somente `grafica-homolog-arquivos`.
- Validade: sem expiração, conforme alteração informada pelo usuário.
- Origens: `5.161.234.21/32` e `2a01:4ff:f4:4c09::1/128`.

Formulário conferido com bucket exclusivo, prazo de 30 dias e ambos os IPs.
O upload atual das telas passa pelo servidor (`/api/objects/upload-direct`),
compatível com essa restrição. URLs assinadas do caminho legado não servirão
para uploads diretos de navegadores fora da VPS; não habilitar esse caminho
sem revisar as restrições e CORS. Revogar e substituir a credencial se houver exposição.

O usuário criou o token no painel. A página de sucesso confirmou o escopo e
a validade inicial de 07/10/2026 a 06/11/2026; posteriormente o usuário
informou ter removido a expiração no painel. As duas credenciais S3 foram fornecidas
ao arquivo protegido na VPS, sem necessidade de usar o token administrativo
da API Cloudflare. Outros tokens e buckets da conta não foram alterados.

## E-mail pendente

O app usa a API direta do Resend. O usuário informou que não possui conta
e pediu para adiar essa configuração. Nenhum domínio, registro DKIM/SPF ou chave Resend foi
criado nesta etapa. Os envios continuam desabilitados na configuração.

Quando a conta estiver disponível, adicionar o domínio escolhido no Resend,
conferir os registros DNS existentes antes de aplicar os valores gerados pelo
provedor e esperar a verificação. A chave do app deve ter permissão de envio,
limitada ao domínio escolhido, sem acesso administrativo desnecessário.

## Gravar chaves sem expor valores

Depois de criar a credencial R2, executar:

```sh
ssh -p 2222 vps
cd ~/grafica-homolog/infra
sh configurar-chaves-servicos.sh
```

O script solicita somente as duas chaves R2 com eco desligado e cria `services.env` com modo
600. Script atualizado na VPS e sintaxe validada com `sh -n`.
Não sobrescreve um arquivo já existente. O arquivo será fornecido ao
container da aplicação na etapa de publicação. O envio real não é ativado
automaticamente.

## Validação

Tipos do app/testes e build aprovados. Os 64 testes focados em arquivos,
permissões, miniaturas, Range e e-mail simulado passaram. Isso valida o
adaptador e a compatibilidade local, mas não comprova acesso à conta real.

`scripts/validar-r2.ts` está preparado para criar um arquivo sintético em
prefixo exclusivo, conferir ACL, download e faixa de bytes e apagar apenas
esse arquivo ao final. Deve ser executado a partir da VPS após configurar
as chaves, usando as dependências da aplicação. Nenhum e-mail é enviado
por esse script.

Teste contra o R2 real aprovado em 07/10/2026, executado a partir da VPS
em container temporário `node:24.15.0-bookworm-slim`, com 256 MB de memória:
gravação, leitura, ACL (dono permitido e outro usuário negado), preservação
dos bytes e HTTP Range. O arquivo sintético foi removido ao final e o
container encerrado. Validador empacotado sem segredos disponível na VPS
em `infra/validar-r2.mjs`. Nenhum arquivo ou banco de produção foi migrado.

## Referências

- [SDK S3 para R2](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [Permissões e tokens R2](https://developers.cloudflare.com/r2/api/tokens/)
- [Verificação de domínio no Resend](https://resend.com/docs/dashboard/domains/introduction)
