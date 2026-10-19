-- Migration: Ajuste estrutural de parcelas de cartão
-- 1. Garante colunas de status e vínculo na tabela parcelas
ALTER TABLE public.parcelas 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS cartao_id uuid REFERENCES public.cartoes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- 2. Migração dos dados existentes:
-- Para compras parceladas já registradas, garantir que o lançamento pai tenha o valor total da compra
-- e que a tabela parcelas tenha todas as parcelas referenciando o lancamento_id original (pai).
DO $$
DECLARE
  v_pai RECORD;
  v_filho RECORD;
  v_soma numeric;
BEGIN
  -- Percorre todos os lançamentos que são pais de compras parceladas no cartão
  FOR v_pai IN
    SELECT l.id, l.workspace_id, l.cartao_id, l.quantidade_parcelas, l.total_parcelas, l.data, l.competencia, l.descricao
    FROM public.lancamentos l
    WHERE l.meio_pagamento_tipo = 'CARTAO'
      AND (l.quantidade_parcelas > 1 OR l.total_parcelas > 1)
      AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
      AND l.deleted_at IS NULL
  LOOP
    -- Calcula a soma de todas as parcelas geradas dessa série
    SELECT COALESCE(SUM(valor), 0) INTO v_soma
    FROM public.lancamentos
    WHERE (id = v_pai.id OR lancamento_pai_id = v_pai.id)
      AND deleted_at IS NULL;

    -- Se a soma for maior que 0 e diferente do valor atual do pai (que antes guardava apenas 1 parcela)
    IF v_soma > 0 THEN
      -- Atualiza o lançamento original com o valor TOTAL da compra parcelada
      UPDATE public.lancamentos
      SET valor = v_soma,
          regime = 'parcelado',
          total_parcelas = COALESCE(v_pai.quantidade_parcelas, v_pai.total_parcelas, 1),
          quantidade_parcelas = COALESCE(v_pai.quantidade_parcelas, v_pai.total_parcelas, 1),
          lancamento_pai_id = v_pai.id
      WHERE id = v_pai.id;

      -- Limpa parcelas anteriores deste pai para regenerar limpas e consistentes
      DELETE FROM public.parcelas WHERE lancamento_id = v_pai.id;

      -- Insere cada parcela vinculada diretamente ao lançamento original (pai)
      FOR v_filho IN
        SELECT lf.numero_parcela, lf.total_parcelas, lf.valor, lf.competencia, lf.data
        FROM public.lancamentos lf
        WHERE (lf.id = v_pai.id OR lf.lancamento_pai_id = v_pai.id)
          AND lf.deleted_at IS NULL
        ORDER BY lf.numero_parcela ASC
      LOOP
        INSERT INTO public.parcelas (
          workspace_id,
          lancamento_id,
          numero_parcela,
          total_parcelas,
          valor,
          competencia,
          data_vencimento,
          cartao_id,
          status
        ) VALUES (
          v_pai.workspace_id,
          v_pai.id,
          v_filho.numero_parcela,
          COALESCE(v_pai.quantidade_parcelas, v_pai.total_parcelas, 1),
          v_filho.valor,
          v_filho.competencia,
          v_filho.data,
          v_pai.cartao_id,
          'pendente'
        )
        ON CONFLICT (lancamento_id, numero_parcela)
        DO UPDATE SET
          valor = EXCLUDED.valor,
          competencia = EXCLUDED.competencia,
          cartao_id = EXCLUDED.cartao_id;
      END LOOP;
    END IF;
  END LOOP;
END $$;
