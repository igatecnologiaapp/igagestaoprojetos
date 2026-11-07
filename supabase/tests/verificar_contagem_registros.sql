-- =============================================================================
-- CONTAGEM DE REGISTROS — SOMENTE LEITURA (não altera nada)
--
-- Rode no banco de ORIGEM e no de DESTINO de uma migração de dados e compare as duas listas.
-- Cada linha deve bater. Inclui usuários (auth.users), arquivos do Storage por bucket e,
-- para cada tabela pública, a quantidade de linhas e um total de controle das datas de criação.
-- =============================================================================
-- Tabela temporária: existe só nesta sessão e some ao fechar a conexão.
DROP TABLE IF EXISTS _contagem;
CREATE TEMP TABLE _contagem(objeto text, linhas bigint, controle text);

DO $$
DECLARE r record; n bigint; c text;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = r.table_name AND column_name = 'created_at') THEN
      EXECUTE format('SELECT count(*), coalesce(md5(string_agg(created_at::text, '','' ORDER BY created_at)), ''-'') FROM public.%I', r.table_name) INTO n, c;
    ELSE
      EXECUTE format('SELECT count(*), ''-'' FROM public.%I', r.table_name) INTO n, c;
    END IF;
    INSERT INTO _contagem VALUES ('public.' || r.table_name, n, c);
  END LOOP;
  INSERT INTO _contagem SELECT 'auth.users', count(*), md5(string_agg(id::text, ',' ORDER BY id)) FROM auth.users;
  INSERT INTO _contagem SELECT 'storage.objects:' || bucket_id, count(*), md5(string_agg(name, ',' ORDER BY name))
    FROM storage.objects GROUP BY bucket_id;
END $$;

SELECT objeto, linhas, left(controle, 12) AS controle FROM _contagem ORDER BY objeto;
