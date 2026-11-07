#!/usr/bin/env python3
"""
Gera supabase/tests/verificar_estado_banco.sql — consulta SOMENTE LEITURA que diz, para cada
migration do repositório, se os objetos que ela cria existem no banco onde for executada
(completa / parcial / ausente) e se funções e políticas estão na versão do repositório.

Uso (num Postgres DESCARTÁVEL já preparado com run-all.sh ou equivalente):
  PGHOST=... PGPORT=... PGUSER=... TEST_DB=iga_test python3 supabase/tests/local/gerar_verificacao.py

Rode de novo sempre que uma migration nova entrar no repositório.
"""
import os, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MIG = ROOT / "supabase" / "migrations"
OUT = ROOT / "supabase" / "tests" / "verificar_estado_banco.sql"
DB = os.environ.get("TEST_DB", "iga_test")


def psql(sql: str) -> list[list[str]]:
    r = subprocess.run(["psql", "-X", "-At", "-F", "\t", "-d", DB, "-c", sql], capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr)
    return [l.split("\t") for l in r.stdout.splitlines() if l]


def strip_bodies(sql: str) -> str:
    sql = re.sub(r"--[^\n]*", "", sql)
    return re.sub(r"\$([a-zA-Z_]*)\$.*?\$\1\$", "$$ $$", sql, flags=re.S)


ident = r'"?([A-Za-z_][A-Za-z0-9_]*)"?'
objects: dict[tuple, str] = {}  # (kind, schema, table, name) -> última migration que define
for f in sorted(MIG.glob("*.sql")):
    raw = f.read_text()
    sql = strip_bodies(raw)
    for m in re.finditer(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)" + ident, sql, re.I):
        objects[("table", "public", "", m.group(1).lower())] = f.name
    for m in re.finditer(r"CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?public\." + ident, sql, re.I):
        objects[("view", "public", "", m.group(1).lower())] = f.name
    for m in re.finditer(r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\." + ident, sql, re.I):
        objects[("function", "public", "", m.group(1).lower())] = f.name
    # Nome da política com ou sem aspas (sem aspas o Postgres guarda em minúsculas).
    for m in re.finditer(r'CREATE\s+POLICY\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))\s+ON\s+(?:(public|storage)\.)?' + ident, sql, re.I):
        pname = m.group(1) if m.group(1) is not None else m.group(2).lower()
        objects[("policy", (m.group(3) or "public").lower(), m.group(4).lower(), pname)] = f.name
    for m in re.finditer(r"CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+" + ident + r"[^;]*?\sON\s+(?:(public|storage|auth)\.)?" + ident, sql, re.I | re.S):
        objects[("trigger", (m.group(2) or "public").lower(), m.group(3).lower(), m.group(1).lower())] = f.name
    for stmt in sql.split(";"):
        m = re.match(r"\s*ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?public\." + ident + r"(.*)", stmt, re.I | re.S)
        if not m:
            continue
        for c in re.finditer(r"ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?" + ident, m.group(2), re.I):
            objects[("column", "public", m.group(1).lower(), c.group(1).lower())] = f.name

# Impressões digitais do banco de referência (repositório aplicado do zero).
funcs = {r[0]: r[1] for r in psql("""
  select p.proname, md5(string_agg(pg_get_functiondef(p.oid), '|' order by pg_get_function_identity_arguments(p.oid)))
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' group by p.proname""")}
pols = {(r[0], r[1], r[2]): r[3] for r in psql("""
  select schemaname, tablename, policyname,
         md5(permissive || '|' || array_to_string(array(select unnest(roles) order by 1), ',') || '|' || cmd || '|' || coalesce(qual,'') || '|' || coalesce(with_check,''))
  from pg_policies where schemaname in ('public','storage')""")}
tables = {r[0] for r in psql("select table_name from information_schema.tables where table_schema='public'")}
cols = {(r[0], r[1]) for r in psql("select table_name, column_name from information_schema.columns where table_schema='public'")}
trigs = {(r[0], r[1], r[2]) for r in psql("""
  select n.nspname, c.relname, t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal""")}

# Políticas e gatilhos criados dinamicamente (laços com EXECUTE format) não aparecem no texto:
# atribui-os à migration que criou a tabela, para que também sejam verificados.
table_mig = {k[3]: v for k, v in objects.items() if k[0] == "table"}
for (sch, tbl, name) in pols:
    if ("policy", sch, tbl, name) not in objects and sch == "public" and tbl in table_mig:
        objects[("policy", sch, tbl, name)] = table_mig[tbl]
for (sch, tbl, name) in trigs:
    if ("trigger", sch, tbl, name) not in objects and sch == "public" and tbl in table_mig:
        objects[("trigger", sch, tbl, name)] = table_mig[tbl]

rows = []
for (kind, sch, tbl, name), mig in sorted(objects.items(), key=lambda kv: (kv[1], kv[0])):
    exp = ""
    if kind in ("table", "view"):
        if name not in tables: continue
    elif kind == "column":
        if (tbl, name) not in cols: continue
    elif kind == "function":
        if name not in funcs: continue
        exp = funcs[name]
    elif kind == "policy":
        if (sch, tbl, name) not in pols: continue
        exp = pols[(sch, tbl, name)]
    elif kind == "trigger":
        if (sch, tbl, name) not in trigs: continue
    q = lambda s: "'" + s.replace("'", "''") + "'"
    rows.append(f"    ({q(mig)}, {q(kind)}, {q(sch)}, {q(tbl)}, {q(name)}, {q(exp) if exp else 'NULL'})")

header = f"""-- =============================================================================
-- VERIFICAÇÃO DO ESTADO DO BANCO — SOMENTE LEITURA (não altera nada)
-- Gerado por supabase/tests/local/gerar_verificacao.py a partir das {len(list(MIG.glob('*.sql')))} migrations do repositório.
--
-- Rode no SQL Editor do Supabase (homologação ou produção) ANTES de decidir qualquer aplicação.
--
-- O QUE ESTA CONSULTA FAZ: verifica se os OBJETOS que cada migration cria existem (tabelas, colunas,
-- visões, funções, políticas, gatilhos) e compara a definição de funções e políticas (inclusive papéis
-- e tipo da política) com a versão do repositório.
-- O QUE ELA NÃO FAZ: não prova que a migration foi executada, não confere GRANTs/REVOKEs, comentários,
-- índices, CHECKs, dados de carga (ex.: permissões cadastradas) nem buckets do Storage.
-- Por isso NÃO aplique nada só com base nela: cruze com verificar_historico_migrations.sql e analise.
--
-- Resultado (resumo por migration):
--   completa   = todos os objetos existem e funções/políticas conferem com o repositório
--   divergente = objetos existem, mas alguma função/política tem definição diferente
--   parcial    = parte dos objetos existe
--   ausente    = nenhum objeto existe (indício de que não foi aplicada — confirmar no histórico)
-- Objetos redefinidos por migrations posteriores contam só na ÚLTIMA migration que os define.
-- "divergente" pode ser só formatação de outra versão do Postgres: veja o detalhe (fim do arquivo).
-- =============================================================================
"""
body = """WITH esperado(migration, tipo, esquema, tabela, nome, assinatura) AS (
  VALUES
""" + ",\n".join(rows) + """
),
situacao AS (
  SELECT e.*,
    CASE e.tipo
      WHEN 'table' THEN EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema='public' AND t.table_name=e.nome)
      WHEN 'view' THEN EXISTS (SELECT 1 FROM information_schema.views v WHERE v.table_schema='public' AND v.table_name=e.nome)
      WHEN 'column' THEN EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=e.tabela AND c.column_name=e.nome)
      WHEN 'function' THEN EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=e.nome)
      WHEN 'policy' THEN EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname=e.esquema AND p.tablename=e.tabela AND p.policyname=e.nome)
      WHEN 'trigger' THEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                                  WHERE n.nspname=e.esquema AND c.relname=e.tabela AND t.tgname=e.nome)
    END AS existe,
    CASE e.tipo
      WHEN 'function' THEN (SELECT md5(string_agg(pg_get_functiondef(p.oid), '|' ORDER BY pg_get_function_identity_arguments(p.oid)))
                              FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=e.nome AND p.prokind='f')
      WHEN 'policy' THEN (SELECT md5(p.permissive || '|' || array_to_string(array(SELECT unnest(p.roles) ORDER BY 1), ',') || '|' || p.cmd || '|' || coalesce(p.qual,'') || '|' || coalesce(p.with_check,''))
                            FROM pg_policies p WHERE p.schemaname=e.esquema AND p.tablename=e.tabela AND p.policyname=e.nome)
    END AS assinatura_atual
  FROM esperado e
)
SELECT migration,
       count(*) AS objetos,
       count(*) FILTER (WHERE existe) AS presentes,
       count(*) FILTER (WHERE existe AND assinatura IS NOT NULL AND assinatura_atual IS DISTINCT FROM assinatura) AS divergentes,
       CASE
         WHEN count(*) FILTER (WHERE existe) = 0 THEN 'ausente'
         WHEN count(*) FILTER (WHERE existe) < count(*) THEN 'parcial'
         WHEN count(*) FILTER (WHERE assinatura IS NOT NULL AND assinatura_atual IS DISTINCT FROM assinatura) > 0 THEN 'divergente'
         ELSE 'completa'
       END AS situacao
  FROM situacao
 GROUP BY migration
 ORDER BY migration;

-- Detalhe: rode esta segunda consulta para ver exatamente o que falta ou difere.
-- (Copie o bloco WITH ... situacao AS (...) acima e troque o SELECT final por este.)
-- SELECT migration, tipo, esquema, tabela, nome,
--        CASE WHEN NOT existe THEN 'ausente' ELSE 'definição diferente' END AS problema
--   FROM situacao
--  WHERE NOT existe OR (assinatura IS NOT NULL AND assinatura_atual IS DISTINCT FROM assinatura)
--  ORDER BY migration, tipo, nome;
"""
OUT.write_text(header + body)
print(f"{OUT.relative_to(ROOT)}: {len(rows)} objetos de {len(set(objects.values()))} migrations")

# Consulta de histórico: cruza os arquivos do repositório com o registro de migrations do Supabase.
HIST = ROOT / "supabase" / "tests" / "verificar_historico_migrations.sql"
repo = [f.name for f in sorted(MIG.glob("*.sql"))]
vals = ",\n".join(f"    ('{n.split('_', 1)[0]}', '{n}')" for n in repo)
HIST.write_text(f"""-- =============================================================================
-- HISTÓRICO DE MIGRATIONS — SOMENTE LEITURA (não altera nada)
-- Gerado por supabase/tests/local/gerar_verificacao.py ({len(repo)} migrations no repositório).
--
-- Cruza cada arquivo de supabase/migrations com o registro do Supabase
-- (supabase_migrations.schema_migrations), preenchido quando migrations são aplicadas pela
-- Supabase CLI (db push) ou pelo painel de migrations. SQL colado no SQL Editor NÃO entra nesse registro.
--   registrada   = consta no histórico do banco
--   sem registro = não consta (pode ter sido aplicada à mão: confira em verificar_estado_banco.sql)
--   só no banco  = consta no banco mas não existe no repositório (investigar antes de qualquer push)
-- Se a primeira linha disser que o histórico não existe, use verificar_estado_banco.sql e análise manual.
-- =============================================================================
WITH repo(version, arquivo) AS (
  VALUES
{vals}
),
hist AS (
  SELECT x.version, x.name
    FROM xmltable('/table/row' PASSING query_to_xml(
      CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
           THEN 'SELECT NULL::text AS version, NULL::text AS name WHERE false'
           ELSE 'SELECT version::text AS version, name::text AS name FROM supabase_migrations.schema_migrations'
      END, false, false, '')
      COLUMNS version text PATH 'version', name text PATH 'name') x
)
SELECT '(histórico)' AS version,
       CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
            THEN 'supabase_migrations.schema_migrations NÃO existe neste banco'
            ELSE 'supabase_migrations.schema_migrations existe: ' || (SELECT count(*) FROM hist) || ' registros' END AS arquivo,
       '' AS situacao
UNION ALL
SELECT * FROM (
  SELECT coalesce(r.version, h.version), coalesce(r.arquivo, h.name),
         CASE WHEN r.version IS NULL THEN 'só no banco'
              WHEN h.version IS NULL THEN 'sem registro'
              ELSE 'registrada' END
    FROM repo r FULL JOIN hist h ON h.version = r.version
   ORDER BY 1
) t;
""")
print(f"{HIST.relative_to(ROOT)}: {len(repo)} migrations do repositório")
