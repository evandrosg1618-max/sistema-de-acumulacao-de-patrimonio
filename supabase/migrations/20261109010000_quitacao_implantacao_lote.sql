-- Lote de quitação da implantação (temporário — executa uma única lógica, idempotente).
-- NÃO altera estrutura. Chama EXCLUSIVAMENTE a RPC atômica pagar_fatura_rpc
-- (mesmo caminho do botão "Pagar"), fatura por fatura, em ordem cronológica.
-- A RPC: revalida a fatura (pula se já paga / saldo 0 — nunca paga duas vezes),
-- debita SOMENTE a conta Sicoob Conta Corrente (saldo negativo permitido),
-- grava pagamento + movimentação + auditoria, NÃO cria despesa,
-- NÃO afeta Resultado e NÃO consome Orçamento, e derruba o comprometimento.
-- Falha em uma fatura não interrompe as demais (exception por item).
do $$
declare
  r record;
  resp jsonb;
  v_pagas int := 0;
  v_ja_pagas int := 0;
  v_erros int := 0;
  v_total numeric := 0;
begin
  for r in
    select * from (values
      ('56ad237b-27a9-4c24-a7c5-1f85cc5627a9'::uuid, '2026-01-01'::date, 37.67),
      ('a5d01b61-59cd-4556-a6f5-869c4ad46014'::uuid, '2026-02-05'::date, 347.78),
      ('53ecdbc6-2e25-4ea4-866f-a74d871ce791'::uuid, '2026-02-01'::date, 132.50),
      ('3e267c86-f277-4a5a-9ecf-5393312376e1'::uuid, '2026-02-10'::date, 75.00),
      ('4ef7a923-e565-4d41-9df3-46b674583306'::uuid, '2026-03-05'::date, 347.78),
      ('11370881-af2c-4ce6-81d2-c141744bda20'::uuid, '2026-03-01'::date, 132.50),
      ('b85f5d92-0b59-49f9-8f73-eac9358defc9'::uuid, '2026-03-10'::date, 126.74),
      ('6cd2922a-602c-4bd5-a09c-5928891cec84'::uuid, '2026-04-05'::date, 347.78),
      ('062eec87-d7bd-41f5-91ce-e45ffe9ea579'::uuid, '2026-04-10'::date, 189.72),
      ('ea7627e1-e906-4036-9498-2d0aa3010341'::uuid, '2026-05-01'::date, 413.00),
      ('52f86060-9b16-4d34-a7d0-d76fead48526'::uuid, '2026-05-05'::date, 347.78),
      ('1f8583c1-2ad4-46a9-b91c-95ea4c0316f1'::uuid, '2026-05-10'::date, 524.80),
      ('d7446cdb-a658-47c0-9ff0-e5b656f3829e'::uuid, '2026-06-01'::date, 465.52),
      ('0010fe89-417e-443b-a0f1-84e13ef1ea0c'::uuid, '2026-06-05'::date, 347.78),
      ('515b4e22-c564-41c6-8547-953a93b46b55'::uuid, '2026-06-10'::date, 775.24),
      ('06f346cc-13b4-4db4-9a19-ce1b512228cd'::uuid, '2026-07-01'::date, 510.37),
      ('018257e3-3c69-4ab5-9e74-9cf8f633ba14'::uuid, '2026-07-05'::date, 347.78),
      ('f4cdf717-0338-4b8f-a603-3df99a48bd65'::uuid, '2026-07-10'::date, 932.41),
      ('d0b7c739-e710-4358-ad73-23c2e9621f87'::uuid, '2026-08-01'::date, 552.47),
      ('81dcbc2b-13ec-4471-8850-f576b6f4a36f'::uuid, '2026-08-01'::date, 36.98),
      ('77138191-fc17-4679-9ef6-5af166c00d43'::uuid, '2026-08-05'::date, 347.78),
      ('ad2590a4-09be-408c-ad35-964763723512'::uuid, '2026-08-10'::date, 1035.91),
      ('00ddb6e3-e79a-43b0-ac49-2acedc0fd46d'::uuid, '2026-09-01'::date, 969.98),
      ('b4f425ae-8f00-4349-8d30-a9125d1c6214'::uuid, '2026-09-01'::date, 221.70),
      ('1167533a-2d0f-4e62-9391-3dd506bba7f3'::uuid, '2026-09-05'::date, 692.88),
      ('467440e3-999d-4a36-8adb-2aeb360007e5'::uuid, '2026-09-01'::date, 969.98),
      ('fd1fc6e8-7701-4cdd-886d-a8c63964cfc2'::uuid, '2026-09-01'::date, 367.32),
      ('acfea95e-3395-40fb-83d8-975b960fc0ad'::uuid, '2026-09-05'::date, 692.88),
      ('f8f87357-98d9-4681-b3c0-3503cad1acb0'::uuid, '2026-09-10'::date, 1149.39),
      ('67af1587-5b62-40d6-9aa8-a990b490994c'::uuid, '2026-10-01'::date, 1453.62),
      ('a504dd95-f926-4704-97a3-598ea298d009'::uuid, '2026-10-01'::date, 598.16),
      ('2caf9596-b703-46d2-a4a0-bef462d86895'::uuid, '2026-10-05'::date, 692.88),
      ('2cc717d0-3729-4cde-b0bf-80780d7b6c79'::uuid, '2026-10-10'::date, 1560.88),
      ('6aa87cc9-5c66-4e49-9de5-5ac508ed48f3'::uuid, '2026-11-01'::date, 1535.67),
      ('b89743b3-980d-45f7-9af1-e313e834bc88'::uuid, '2026-11-01'::date, 816.17),
      ('5595e96c-bed1-4643-8467-197cff5040db'::uuid, '2026-11-05'::date, 1612.81),
      ('47d0a844-45e0-449c-a2eb-de6fdf7e9e19'::uuid, '2026-11-10'::date, 9107.44)
    ) as t(id, data_venc, valor)
    order by data_venc, id
  loop
    begin
      select public.pagar_fatura_rpc(
        'd44cda7f-3c56-4770-afe0-0f6318302fc9'::uuid,
        r.id,
        '74db2829-4341-49e1-b920-5505adb24367'::uuid,
        r.valor,
        r.data_venc,
        '1d142118-2ebd-41a0-9d44-0a54ccd3e2a1'::uuid
      ) into resp;

      if coalesce((resp->>'ja_paga')::boolean, false) then
        v_ja_pagas := v_ja_pagas + 1;
      else
        v_pagas := v_pagas + 1;
        v_total := v_total + r.valor;
      end if;
    exception when others then
      v_erros := v_erros + 1;
      insert into public.auditoria_operacoes
        (workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by)
      values
        ('d44cda7f-3c56-4770-afe0-0f6318302fc9'::uuid, 'faturas', r.id,
         'QUITACAO_IMPLANTACAO_ERRO', null,
         jsonb_build_object('erro', sqlerrm, 'contexto', coalesce(sqlerrm::text,'')),
         '1d142118-2ebd-41a0-9d44-0a54ccd3e2a1'::uuid);
    end;
  end loop;

  insert into public.auditoria_operacoes
    (workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by)
  values
    ('d44cda7f-3c56-4770-afe0-0f6318302fc9'::uuid, 'faturas',
     'd44cda7f-3c56-4770-afe0-0f6318302fc9'::uuid,
     'QUITACAO_IMPLANTACAO_LOTE', null,
     jsonb_build_object(
       'total_faturas_lote', 37,
       'pagas_agora', v_pagas,
       'ja_pagas_ignoradas', v_ja_pagas,
       'erros', v_erros,
       'valor_total_pago', v_total,
       'conta_debito', '74db2829-4341-49e1-b920-5505adb24367'::uuid
     ),
     '1d142118-2ebd-41a0-9d44-0a54ccd3e2a1'::uuid);
end $$;
