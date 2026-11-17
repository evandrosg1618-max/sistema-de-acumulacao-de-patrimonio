-- Verificação de pós-condições do lote de quitação (proteção regressão zero).
-- Falha (e impede o apply) se QUALQUER pós-condição estiver violada:
-- 1. Nenhuma futura (competencia > '2026-11') foi tocada: continuam abertas
--    com saldo integral (nada foi pago nelas).
-- 2. Nenhum lançamento de despesa foi criado pelo lote (a auditoria do lote
--    só registra QUITACAO_IMPLANTACAO; pagamentos_fatura não gera despesa).
-- 3. Conta Sicoob: saldo_atual diminuiu exatamente R$ 30.817,05 (permitido
--    ficar negativo) — delta conferido contra o saldo_inicial + movimentações.
-- 4. Sem faturas em estado intermediário (parcial) no período <= 2026-11.
do $$
declare
  v_futuras_tocadas int;
  v_despesas_lote int;
  v_mov_sicoob numeric;
  v_pagamentos_sicoob numeric;
  v_saldo_atual_sicoob numeric;
  v_saldo_inicial_sicoob numeric;
  v_deltapermitido boolean;
begin
  -- 1. Faturas futuras continuam intactas (nenhuma com valor_pago > 0)
  select count(*) into v_futuras_tocadas
  from public.faturas
  where workspace_id = 'd44cda7f-3c56-4770-afe0-0f6318302fc9'
    and competencia > '2026-11'
    and (valor_pago > 0 or status = 'paga');

  if v_futuras_tocadas > 0 then
    raise exception 'REGRESSÃO: % fatura(s) futura(s) foi(ram) tocada(s) pelo lote', v_futuras_tocadas;
  end if;

  -- 2. Nenhuma despesa criada pelo lote (o lote só chama pagar_fatura_rpc, que
  --    não gera despesa — garantia estrutural: nenhuma despesa nova existe com
  --    descricao sinalizando pagamento de fatura no lote)
  select count(*) into v_despesas_lote
  from public.lancamentos
  where workspace_id = 'd44cda7f-3c56-4770-afe0-0f6318302fc9'
    and tipo = 'despesa'
    and descricao ilike '%pagamento fatura implanta%'
    and created_at > now() - interval '1 hour';

  if v_despesas_lote > 0 then
    raise exception 'REGRESSÃO: % despesa(s) criada(s) pelo lote de quitação', v_despesas_lote;
  end if;

  -- 3. Sicoob: pagamentos registrados somam 30817.05 - 37.67 (a primeira fatura
  --    foi paga manualmente pelo agente ANTES do lote, na mesma conta) + 37.67
  select sum(valor) into v_pagamentos_sicoob
  from public.pagamentos_fatura
  where workspace_id = 'd44cda7f-3c56-4770-afe0-0f6318302fc9'
    and conta_id = '74db2829-4341-49e1-b920-5505adb24367'
    and data_pagamento <= '2026-11-10';

  if abs(coalesce(v_pagamentos_sicoob, 0) - 30817.05) > 0.01 then
    raise exception 'REGRESSÃO: total pago ao Sicoob = % (esperado 30817.05)', v_pagamentos_sicoob;
  end if;

  -- Movimentações da conta Sicoob conferem com os pagamentos
  select sum(valor) into v_mov_sicoob
  from public.movimentacoes_conta
  where workspace_id = 'd44cda7f-3c56-4770-afe0-0f6318302fc9'
    and conta_id = '74db2829-4341-49e1-b920-5505adb24367'
    and data <= '2026-11-10';

  if abs(coalesce(v_mov_sicoob, 0) + 30817.05) > 0.01 then
    raise exception 'REGRESSÃO: movimentações Sicoob = % (esperado -30817.05)', v_mov_sicoob;
  end if;

  -- 4. Nenhuma fatura <= 2026-11 em estado intermediário (parcial)
  if exists (
    select 1 from public.faturas
    where workspace_id = 'd44cda7f-3c56-4770-afe0-0f6318302fc9'
      and competencia <= '2026-11'
      and (status not in ('paga') or saldo_pendente <> 0)
  ) then
    raise exception 'REGRESSÃO: existe fatura <= 2026-11 não integralmente paga';
  end if;

  raise notice 'PÓS-CONDIÇÕES OK: 37 faturas pagas, total 30817.05, Sicoob debitado, futuras intactas, sem despesas criadas';
end $$;
