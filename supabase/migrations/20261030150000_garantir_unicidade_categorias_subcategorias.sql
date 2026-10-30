-- Migração: Garantir unicidade de categorias e subcategorias por workspace
-- Objetivo:
-- 1. Deduplicação preventiva segura (caso existam duplicatas em algum workspace)
-- 2. Constraints UNIQUE para impedir duplicidade de carga ou de cadastro:
--    - categorias: UNIQUE(workspace_id, nome)
--    - subcategorias: UNIQUE(workspace_id, categoria_id, nome)

DO $$
DECLARE
  r RECORD;
  r_sub RECORD;
  v_keep_id UUID;
  v_remove_id UUID;
  v_keep_sub_id UUID;
  v_remove_sub_id UUID;
  i INT;
  j INT;
BEGIN
  -- 1. Deduplicação preventiva em categorias (mesmo workspace_id e nome)
  FOR r IN
    SELECT workspace_id, nome, array_agg(id ORDER BY created_at ASC) as ids, count(*) as cnt
    FROM public.categorias
    GROUP BY workspace_id, nome
    HAVING count(*) > 1
  LOOP
    v_keep_id := r.ids[1];
    FOR i IN 2..array_length(r.ids, 1) LOOP
      v_remove_id := r.ids[i];

      -- Relincar subcategorias
      UPDATE public.subcategorias
      SET categoria_id = v_keep_id
      WHERE categoria_id = v_remove_id;

      -- Relincar orcamentos
      UPDATE public.orcamentos
      SET categoria_id = v_keep_id
      WHERE categoria_id = v_remove_id;

      -- Relincar lancamentos
      UPDATE public.lancamentos
      SET categoria_id = v_keep_id
      WHERE categoria_id = v_remove_id;

      -- Relincar series_lancamentos
      UPDATE public.series_lancamentos
      SET categoria_id = v_keep_id
      WHERE categoria_id = v_remove_id;

      -- Excluir categoria duplicada
      DELETE FROM public.categorias WHERE id = v_remove_id;
    END LOOP;
  END LOOP;

  -- 2. Deduplicação preventiva em subcategorias (mesmo workspace_id, categoria_id e nome)
  FOR r_sub IN
    SELECT workspace_id, categoria_id, nome, array_agg(id ORDER BY created_at ASC) as ids, count(*) as cnt
    FROM public.subcategorias
    GROUP BY workspace_id, categoria_id, nome
    HAVING count(*) > 1
  LOOP
    v_keep_sub_id := r_sub.ids[1];
    FOR j IN 2..array_length(r_sub.ids, 1) LOOP
      v_remove_sub_id := r_sub.ids[j];

      -- Relincar orcamento_limites
      UPDATE public.orcamento_limites
      SET subcategoria_id = v_keep_sub_id
      WHERE subcategoria_id = v_remove_sub_id;

      -- Relincar lancamentos
      UPDATE public.lancamentos
      SET subcategoria_id = v_keep_sub_id
      WHERE subcategoria_id = v_remove_sub_id;

      -- Relincar series_lancamentos
      UPDATE public.series_lancamentos
      SET subcategoria_id = v_keep_sub_id
      WHERE subcategoria_id = v_remove_sub_id;

      -- Excluir subcategoria duplicada
      DELETE FROM public.subcategorias WHERE id = v_remove_sub_id;
    END LOOP;
  END LOOP;

END $$;

-- 3. Adicionar constraint UNIQUE em categorias (workspace_id, nome)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_categorias_workspace_nome'
  ) THEN
    ALTER TABLE public.categorias
      ADD CONSTRAINT uq_categorias_workspace_nome UNIQUE (workspace_id, nome);
  END IF;
END $$;

-- 4. Adicionar constraint UNIQUE em subcategorias (workspace_id, categoria_id, nome)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_subcategorias_workspace_categoria_nome'
  ) THEN
    ALTER TABLE public.subcategorias
      ADD CONSTRAINT uq_subcategorias_workspace_categoria_nome UNIQUE (workspace_id, categoria_id, nome);
  END IF;
END $$;
