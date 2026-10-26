# Cópia do banco — 08/10/2026

Neon exportado às 15h49 (Brasília), com conexão somente leitura e TLS verificado. Dump custom PostgreSQL 16 restaurado por transação no banco separado `grafica_import_20261008`, de propriedade de `grafica_app`. Backup prévio do destino: `infra/backups/grafica-20261008T184932Z-1351642.dump`.

Restaurados 51 usuários, 96 eventos, 6.681 peças, 12.745 fotos de entrega e 4.012 versões de arte. Dados de sessões, tokens SSO, limites de tentativas e reservas de disparo foram excluídos da exportação. Senhas dos usuários preservadas na cópia.

Duas migrações pendentes aplicadas exclusivamente na cópia. Seis migrações em dia, schema sem faltas ou sobras, índices e restrições válidos. Três índices adicionais previstos por scripts preservados.

A primeira restauração foi revertida por transação porque `public` já existia. A repetição excluiu apenas a criação e o comentário desse schema do catálogo, preservando `pg_trgm`. A checagem de drift precisou dos auxiliares `checks/checar-drift.mjs` e `checks/schema.ts` montados no container temporário. Após o ajuste, a validação passou.

Conferência somente leitura de 22 campos, incluindo arquivos de remessas e fotos de tubos: 12.853 referências únicas ao bucket; 12.847 encontradas entre 17.762 objetos no R2; seis ausentes. Causa ainda não confirmada. Chaves no relatório privado da VPS `infra/migration/20261008/r2-missing-keys.json`.

App e PostgreSQL saudáveis. Conexão do app permanece em `grafica_homolog`, com zero usuários. Neon e Replit não foram alterados. Antes de usar a cópia com R2, conferir e transferir os arquivos ausentes. Antes do corte definitivo, sincronizar novamente a origem, que continua recebendo alterações.

Contagens e integridade do dump: [resultado](resultado-copia-banco-20261008.json).

## Complemento às 17h07 (Brasília)

Os seis arquivos foram confirmados na origem: cinco JPEG e um PDF, criados entre 15h40 e 15h44, depois do lote anterior. Copiados mediante autorização, sem sobrescrever objetos, com caminhos e metadados preservados. Releitura do R2 confirmou SHA-256 idêntico para todos. Total: 4.942.267 bytes.

Nova conferência da cópia `grafica_import_20261008`: todas as 12.853 referências encontradas, zero ausentes, 17.768 objetos no R2. Isso valida esta cópia do banco; não garante sincronização com alterações posteriores da produção. O app continua sem mudança de conexão. [Relatório dos seis arquivos](copia-seis-arquivos-20261008.json).
