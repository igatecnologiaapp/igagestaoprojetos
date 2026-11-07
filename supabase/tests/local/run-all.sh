#!/usr/bin/env bash
# Roda TODAS as suítes de teste do banco num Postgres DESCARTÁVEL.
#
# Nunca aponte para o Supabase de homologação ou produção: o script apaga e recria o banco.
#
# Uso (Postgres 15+ local ou em contêiner):
#   docker run -d --name iga-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgres:16
#   PGHOST=localhost PGPORT=54329 PGUSER=postgres PGPASSWORD=postgres bash supabase/tests/local/run-all.sh
#
# Variáveis: PGHOST, PGPORT, PGUSER, PGPASSWORD (padrão do psql) e TEST_DB (padrão: iga_test).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DB="${TEST_DB:-iga_test}"
case "$DB" in postgres|template0|template1) echo "TEST_DB inválido: $DB"; exit 2;; esac
case "${PGHOST:-localhost}" in *supabase.co*|*supabase.com*|*pooler*) echo "Recusado: PGHOST parece ser um Supabase real."; exit 2;; esac

PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
reset_db() {
  "${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\"" -c "create database \"$DB\"" >/dev/null 2>&1
  "${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/tests/local/supabase_stub.sql" >/dev/null
  for f in "$ROOT"/supabase/migrations/*.sql; do
    "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null 2>/tmp/iga_mig_err.txt || { echo "FALHA ao aplicar $(basename "$f")"; head -5 /tmp/iga_mig_err.txt; exit 1; }
  done
  # No Supabase real o bucket é criado pelo painel/CLI; aqui, direto.
  "${PSQL[@]}" -d "$DB" -c "insert into storage.buckets(id,name,public,file_size_limit) values ('project-files','project-files',false,52428800) on conflict do nothing" >/dev/null
}

# Suítes antigas (anteriores à reformulação) que dependem de dados já existentes no banco
# (ex.: "Nenhum usuário owner disponível") e falham num banco vazio, inclusive no commit
# anterior à Fase 1. Ficam fora por padrão; INCLUDE_LEGACY=1 para rodá-las mesmo assim.
LEGACY="bloco_2a_atividade_auditoria bloco_3a_governanca bloco_4b_fundacao_financeira bloco_4c_custos_rateios bloco_4d_1_menor_privilegio_orcamento bloco_4d_orcamento_previsto_realizado storage_bloco_1_regressao"

total_ok=0; total_fail=0
for t in "$ROOT"/supabase/tests/*.sql; do
  name="$(basename "$t" .sql)"
  case "$name" in verificar_*) continue;; esac   # consultas de verificação não são suítes
  if [ "${INCLUDE_LEGACY:-0}" != "1" ] && [[ " $LEGACY " == *" $name "* ]]; then continue; fi
  reset_db
  out="$(psql -X -d "$DB" -f "$t" 2>&1 || true)"
  ok=$(grep -c "APROVADO" <<<"$out" || true); fail=$(grep -cE "FALHOU|ERROR" <<<"$out" || true)
  printf "%-40s %3s aprovados  %s falhas\n" "$(basename "$t" .sql)" "$ok" "$fail"
  [ "$fail" -gt 0 ] && grep -E "FALHOU|ERROR" <<<"$out" | head -5
  total_ok=$((total_ok + ok)); total_fail=$((total_fail + fail))
done
echo "TOTAL: $total_ok aprovados, $total_fail falhas"
[ "$total_fail" -eq 0 ]
