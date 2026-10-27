#!/bin/sh
set -eu

: "${GRAFICA_DB_USER:?Usuário da aplicação ausente}"
: "${GRAFICA_DB_PASSWORD:?Senha da aplicação ausente}"

# Identificadores e senha passam como variáveis psql e são citados por format.
# A conta da aplicação não recebe privilégios administrativos do cluster.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=app_user="$GRAFICA_DB_USER" \
  --set=app_password="$GRAFICA_DB_PASSWORD" \
  --set=app_db="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'app_user', :'app_password') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'app_db', :'app_user') \gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'app_db') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'app_db', :'app_user') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'app_user') \gexec
SQL
