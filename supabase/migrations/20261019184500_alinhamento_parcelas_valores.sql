-- Migration: Correção e alinhamento dos registros de parcelas com o lançamento original
-- Garante que todas as parcelas pertencem unicamente ao lançamento pai/original
-- e que a parcela 1 tem o valor da sua cota (ex: R$100,00) em vez do valor cheio da compra.

DO $$
DECLARE
  v_pai RECORD;
  v_qtd int;
  v_valor_total numeric;
  v_valor_base numeric;
  v_dif_centavos numeric;
  v_data_base date;
  v_comp_base text;
  v_cartao_id uuid;
  v_ws_id uuid;
  v_i int;
  v_comp text;
  v_valor_parcela numeric;
  v_ano int;
  v_mes int;
BEGIN
  -- 1. Remove qualquer parcela órfã ou associada a lançamento filho (numero_parcela > 1)
  DELETE FROM public.parcelas p
  USING public.lancamentos l
  WHERE p.lancamento_id = l.id
    AND l.numero_parcela > 1;

  -- 2. Para cada lançamento pai de cartão parcelado:
  FOR v_pai IN
    SELECT l.id, l.workspace_id, l.cartao_id, l.valor, l.quantidade_parcelas, l.total_parcelas, l.data, l.competencia
    FROM public.lancamentos l
    WHERE l.meio_pagamento_tipo = 'CARTAO'
      AND (l.quantidade_parcelas > 1 OR l.total_parcelas > 1)
      AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
      AND l.deleted_at IS NULL
  LOOP
    v_ws_id := v_pai.workspace_id;
    v_cartao_id := v_pai.cartao_id;
    v_data_base := v_pai.data;
    v_comp_base := v_pai.competencia;
    v_qtd := COALESCE(v_pai.quantidade_parcelas, v_pai.total_parcelas, 1);
    v_valor_total := v_pai.valor;

    IF v_qtd > 1 AND v_valor_total > 0 THEN
      v_valor_base := trunc((v_valor_total / v_qtd), 2);
      v_dif_centavos := round((v_valor_total - (v_valor_base * v_qtd)), 2);

      -- Limpa parcelas do pai para reinserir com os valores unitários exatos
      DELETE FROM public.parcelas WHERE lancamento_id = v_pai.id;

      -- Extrai ano e mês da competência base (YYYY-MM)
      v_ano := CAST(SPLIT_PART(v_comp_base, '-', 1) AS int);
      v_mes := CAST(SPLIT_PART(v_comp_base, '-', 2) AS int);

      FOR v_i IN 1..v_qtd LOOP
        -- Calcula competência da parcela
        DECLARE
          m_calc int := v_mes + (v_i - 1);
          a_calc int := v_ano;
        BEGIN
          WHILE m_calc > 12 LOOP
            m_calc := m_calc - 12;
            a_calc := a_calc + 1;
          END LOOP;
          v_comp := a_calc || '-' || LPAD(m_calc::text, 2, '0');
        END;

        IF v_i = v_qtd THEN
          v_valor_parcela := v_valor_base + v_dif_centavos;
        ELSE
          v_valor_parcela := v_valor_base;
        END IF;

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
          v_ws_id,
          v_pai.id,
          v_i,
          v_qtd,
          v_valor_parcela,
          v_comp,
          v_data_base,
          v_cartao_id,
          'pendente'
        );
      END LOOP;
    END IF;
  END LOOP;
END $$;
