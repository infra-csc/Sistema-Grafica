# Homologacao do login na VPS — 09/10/2026

O destino `producao` do Portal NORTE continua no Replit. Nenhum arquivo, segredo ou publicacao do hub foi alterado. Nenhuma conexao do app da VPS foi direcionada ao Neon.

## Configuracao instalada

- Imagem `grafica-homolog:20261009-sso`: backend e dependencias da imagem anterior, com o frontend recompilado para `VITE_HUB_URL=https://norte-app-hub.replit.app/`.
- Banco conectado: **copia** `grafica_import_20261008`, com 51 usuarios, 96 eventos e 6.681 pecas.
- `SSO_SECRET` da VPS alinhado ao `SESSION_SECRET` existente nos secrets da publicacao do hub. O segredo de sessao local da Grafica permanece proprio. Valores armazenados somente em `infra/app.env`, modo 600.
- E-mails desativados, dry run ativado, digests de revisao e gestao desativados.
- Container saudavel e PostgreSQL restrito a `127.0.0.1:5432`.

Os processos internos de inventario, prioridades e snapshots continuam ativos: no primeiro boot houve atualizacoes **na copia de homologacao**, sem afetar a origem. A copia deixa de representar exatamente o estado do dump apos o inicio do app.

Pacote de frontend: `artifacts/grafica-frontend-20261009-sso.tar.gz`, SHA256 `99b5bb8797f643e033f27055f922de45ea2a49d179587f33cd6f9ba472376221`, conferido na VPS. Contexto Docker em `/home/marcosvinicius/grafica-homolog/release-sso-20261009`; usa a imagem anterior como base.

## Testes aprovados

Script `infra/grafica/validar-sso-homolog.mjs`, executado pelo stdin dentro do container, com guarda que exige o banco `grafica_import_20261008`.

- JWT sintetico com chave configurada, HS256, emissor `norte-portal`, audiencia `producao` e validade de dois minutos.
- Redirecionamento para troca de uso unico; segundo consumo recusado com 401.
- Cookie Secure/HttpOnly/SameSite=Lax e sessao armazenada no PostgreSQL.
- Assinatura incorreta, token expirado e e-mail nao cadastrado recusados.
- JPEG, PDF e miniatura obtidos pelo endpoint autenticado do app/R2, com tamanho e SHA256 identicos a amostra da origem.
- Arquivos sem sessao recusados com 401; logout invalida a sessao.
- Conta descartavel removida; estado final: 51 usuarios, zero sessoes e zero tokens de troca.

Nao foram feitos uploads ou exclusoes no R2 nesta validacao. O script remove somente seus registros sinteticos na copia do banco.

## Validacao ainda pendente

O teste acima valida o recebimento e a sessao da Grafica, mas **nao autentica uma pessoa pela Microsoft nem solicita um JWT real ao hub**. Ainda falta verificar o percurso completo e os perfis de usuarios reais sem alterar o destino de producao no portal. A equivalencia entre o codigo do editor e o codigo publicado do hub tambem nao foi comprovada por um token real.

O botao Microsoft da VPS abre o portal atual; o cartao Grafica nesse portal continua abrindo o aplicativo antigo. Nao interpretar esse caminho como entrada ja concluida na VPS.

## Retorno da configuracao

Backup anterior: `/home/marcosvinicius/grafica-homolog/infra/backups/config-sso-20261009T133801Z`, protegido com modo 700. Contem `app.env` e `compose.app.yaml` anteriores. A imagem `grafica-homolog:20261007-r2` e o banco `grafica_homolog` foram preservados.

Se necessario, restaurar esses dois arquivos e recriar somente o app com `docker compose -f compose.yaml -f compose.app.yaml up -d --no-deps --no-build app`. Isso retorna ao banco vazio e ao frontend anterior; nao restaura os dados da copia e nao altera a producao.
