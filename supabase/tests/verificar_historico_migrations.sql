-- =============================================================================
-- HISTÓRICO DE MIGRATIONS — SOMENTE LEITURA (não altera nada)
-- Gerado por supabase/tests/local/gerar_verificacao.py (42 migrations no repositório).
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
    ('20260506171717', '20260506171717_f14b3bc3-93f9-4f4c-9d84-f88229f827b3.sql'),
    ('20260506171750', '20260506171750_64fa79a0-2857-4706-ba8e-e46d2fd2c7c4.sql'),
    ('20260506171804', '20260506171804_9f428e12-85a5-4bd1-b2e1-58b0f70e2b1d.sql'),
    ('20260506174049', '20260506174049_49ccadaa-8a20-4ee1-be3c-4823f16faa52.sql'),
    ('20260506175054', '20260506175054_0f3884f2-ed4c-433f-b8bf-6c3b6e3d7355.sql'),
    ('20260506182004', '20260506182004_3b058e23-96b0-4220-af87-ec99d08a63f3.sql'),
    ('20260506182755', '20260506182755_fc26b633-bc03-43dc-b88d-594a14767498.sql'),
    ('20260506190557', '20260506190557_97bdeea1-cfbd-41f5-ba41-54b037543713.sql'),
    ('20260818011830', '20260818011830_db46508d-ec5a-4203-9c98-b81e6d0f02bb.sql'),
    ('20260820004346', '20260820004346_a674899d-2c26-4d0a-af8f-cf30c7f1f49c.sql'),
    ('20260821081832', '20260821081832_9551f668-7029-4838-8a12-8ec32941b8b8.sql'),
    ('20260822003028', '20260822003028_88467573-2c86-475a-855c-d752515163d3.sql'),
    ('20260822003746', '20260822003746_a5cb049a-052e-4d9b-a597-1fe00b72a839.sql'),
    ('20260822003808', '20260822003808_8119c562-d9f7-405e-b078-b5c824459c4f.sql'),
    ('20260822003821', '20260822003821_db819166-9133-4b4d-9e35-6179bbd76a4a.sql'),
    ('20260823120645', '20260823120645_81d5b157-d9cb-41a8-a531-86c71549445c.sql'),
    ('20260823120712', '20260823120712_b5d8541a-7254-4f5a-aa23-579423b9a55f.sql'),
    ('20260823120938', '20260823120938_e0040154-8434-4a3e-a748-8710ed1ec4ce.sql'),
    ('20260823121001', '20260823121001_14b7be07-8d79-481a-8574-45be9c2da585.sql'),
    ('20260826171609', '20260826171609_85357e4b-a579-43d6-8a87-e9b217f07dd9.sql'),
    ('20260829232756', '20260829232756_fb9d4683-a541-4f07-8956-7813d0c3bb03.sql'),
    ('20260829233201', '20260829233201_c690c0bc-ce9e-485e-ac41-1eef1f931242.sql'),
    ('20260830000337', '20260830000337_88f2e462-1935-4fc6-b524-176395bfa507.sql'),
    ('20260830000402', '20260830000402_35a628c8-4fb1-415e-99f2-ec16a91f4305.sql'),
    ('20260830000535', '20260830000535_382c9817-e003-4aaf-bba8-7473fe2f6bdf.sql'),
    ('20260830001531', '20260830001531_1f2a6f31-d0a3-4ac5-a61b-b1e579221439.sql'),
    ('20260830005108', '20260830005108_6673c9a9-860c-49c6-aace-2298d8a7e1d6.sql'),
    ('20260830010454', '20260830010454_3f151783-4545-4237-97e2-614e25cab2a5.sql'),
    ('20260830021211', '20260830021211_6b64d31b-6fef-4c60-89c9-b2de9f240983.sql'),
    ('20260902025710', '20260902025710_41395cfb-b3d6-465b-a127-05213bb970f4.sql'),
    ('20260903091510', '20260903091510_e1f4bf57-8a99-41c0-91b8-901bb9f165fc.sql'),
    ('20260907112541', '20260907112541_ee60af90-a624-4c08-9b97-2ff04d65ad80.sql'),
    ('20260907113924', '20260907113924_e9c39387-558b-4a86-acff-4223f4ed5748.sql'),
    ('20260907113950', '20260907113950_0c07209b-c51a-4d47-a8e9-de1cc4e51a7b.sql'),
    ('20260911010406', '20260911010406_c3005867-e46b-4552-b383-069bc4032832.sql'),
    ('20260915020809', '20260915020809_037f1bad-c268-4495-a99f-4cbea5ebcf3e.sql'),
    ('20260915025110', '20260915025110_979e00f3-b96b-4ad3-8680-6241c7e73ffa.sql'),
    ('20261106150000', '20261106150000_fase1_documentos_projeto.sql'),
    ('20261107090000', '20261107090000_fase2a_despesas_fixas_automaticas.sql'),
    ('20261107120000', '20261107120000_fase2b_consumo_rateio.sql'),
    ('20261107150000', '20261107150000_fase2c_receitas_resultado.sql'),
    ('20261108090000', '20261108090000_fase4_participantes_portal_cliente.sql')
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
