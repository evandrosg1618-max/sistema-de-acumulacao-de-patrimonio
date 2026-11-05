import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing supabase credentials in environment' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const workspaceId = 'd44cda7f-3c56-4770-afe0-0f6318302fc9'
    const cartaoMasterC6Id = '1dd20adf-70fa-48b3-a78b-3fc9f9b40a96'
    const contaBradescoId = '58c863b6-432b-4494-b894-2f7e76de84f7'
    const subcatEletrodomesticosId = '2fdd1140-580a-4fc9-a7ee-7b6de2aff055'

    // 0. Obter categoria pai de Eletrodomésticos
    const { data: subcatData } = await supabase
      .from('subcategorias')
      .select('id, categoria_id')
      .eq('id', subcatEletrodomesticosId)
      .single()

    const categoriaId = subcatData?.categoria_id || null

    const resultados: Record<string, any> = {}

    // -------------------------------------------------------------------------
    // TESTE E: Pagamento integral
    // -------------------------------------------------------------------------
    // 1. Inserir despesa única no cartão: "TESTE E Unico 300"
    const { data: lancE, error: errLancE } = await supabase
      .from('lancamentos')
      .insert({
        workspace_id: workspaceId,
        descricao: 'TESTE E Unico 300',
        valor: 300.0,
        valor_proprio: 300.0,
        valor_terceiros: 0.0,
        data: '2026-11-25',
        competencia: '2026-11',
        tipo: 'despesa',
        regime: 'unico',
        modalidade_saida: 'compra_propria',
        cartao_id: cartaoMasterC6Id,
        meio_pagamento_tipo: 'CARTAO',
        categoria_id: categoriaId,
        subcategoria_id: subcatEletrodomesticosId,
        status_pagamento: 'pendente',
        afeta_resultado: true,
        afeta_orcamento: true,
      })
      .select('id')
      .single()

    if (errLancE) throw new Error(`Erro ao inserir lanc E: ${errLancE.message}`)

    // Recalcular fatura 2026-11
    await supabase.rpc('recalcular_fatura_rpc', {
      p_workspace_id: workspaceId,
      p_cartao_id: cartaoMasterC6Id,
      p_competencia: '2026-11',
    })

    // Buscar fatura 2026-11
    const { data: faturaE1 } = await supabase
      .from('faturas')
      .select('id, status, valor_total, valor_pago, saldo_pendente')
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoMasterC6Id)
      .eq('competencia', '2026-11')
      .single()

    // Baseline conta Bradesco e comprometimento pré-pagamento E
    const { data: contaBradescoPreE } = await supabase
      .from('contas')
      .select('saldo_atual')
      .eq('id', contaBradescoId)
      .single()

    const { data: cartoesPreE } = await supabase.rpc('obter_cartoes_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_incluir_inativos: false,
    })
    const comprometimentoPreE = cartoesPreE?.find(
      (c: any) => c.id === cartaoMasterC6Id,
    )?.total_comprometido

    const { data: orcamentoPreE } = await supabase.rpc('obter_orcamento_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_competencia: '2026-11',
    })

    const { data: resultadoPreE } = await supabase.rpc('calcular_regime_competencia_integral_rpc', {
      p_workspace_id: workspaceId,
      p_data_inicio: '2026-11-01',
      p_data_fim: '2026-11-30',
    })

    // Pagar fatura integralmente (valor da fatura = 300 ou v_valor_total)
    const valorPagarE = Number(faturaE1?.valor_total || 300)
    const { data: resPagarE, error: errPagarE } = await supabase.rpc('pagar_fatura_rpc', {
      p_workspace_id: workspaceId,
      p_fatura_id: faturaE1?.id,
      p_conta_id: contaBradescoId,
      p_valor: valorPagarE,
      p_data_pagamento: '2026-11-26',
    })

    // Pós pagamento E
    const { data: faturaE2 } = await supabase
      .from('faturas')
      .select('id, status, valor_total, valor_pago, saldo_pendente')
      .eq('id', faturaE1?.id)
      .single()

    const { data: contaBradescoPosE } = await supabase
      .from('contas')
      .select('saldo_atual')
      .eq('id', contaBradescoId)
      .single()

    const { data: cartoesPosE } = await supabase.rpc('obter_cartoes_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_incluir_inativos: false,
    })
    const comprometimentoPosE = cartoesPosE?.find(
      (c: any) => c.id === cartaoMasterC6Id,
    )?.total_comprometido

    const { data: orcamentoPosE } = await supabase.rpc('obter_orcamento_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_competencia: '2026-11',
    })

    const { data: resultadoPosE } = await supabase.rpc('calcular_regime_competencia_integral_rpc', {
      p_workspace_id: workspaceId,
      p_data_inicio: '2026-11-01',
      p_data_fim: '2026-11-30',
    })

    resultados.testeE = {
      lancamento_e_id: lancE?.id,
      fatura_id: faturaE1?.id,
      res_pagar_fatura: resPagarE,
      fatura_status_antes: faturaE1?.status,
      fatura_status_depois: faturaE2?.status,
      fatura_valor_pago: faturaE2?.valor_pago,
      fatura_saldo_pendente: faturaE2?.saldo_pendente,
      saldo_conta_antes: contaBradescoPreE?.saldo_atual,
      saldo_conta_depois: contaBradescoPosE?.saldo_atual,
      saldo_conta_delta:
        Number(contaBradescoPosE?.saldo_atual) - Number(contaBradescoPreE?.saldo_atual),
      comprometimento_antes: comprometimentoPreE,
      comprometimento_depois: comprometimentoPosE,
      comprometimento_delta: Number(comprometimentoPosE) - Number(comprometimentoPreE),
      resultado_previsto_antes: resultadoPreE?.despesas_previstas,
      resultado_previsto_depois: resultadoPosE?.despesas_previstas,
      resultado_efetivado_antes: resultadoPreE?.despesas_efetivadas,
      resultado_efetivado_depois: resultadoPosE?.despesas_efetivadas,
      orcamento_realizado_antes: orcamentoPreE?.total_realizado,
      orcamento_realizado_depois: orcamentoPosE?.total_realizado,
    }

    // -------------------------------------------------------------------------
    // TESTE G prepara retorno do E para isolar ou limpar E
    // Estornar pagamento de E e soft-delete de lancE para que F use a fatura limpa
    // -------------------------------------------------------------------------
    await supabase.rpc('estornar_fatura_rpc', {
      p_workspace_id: workspaceId,
      p_fatura_id: faturaE1?.id,
    })

    await supabase
      .from('lancamentos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', lancE?.id)

    // -------------------------------------------------------------------------
    // TESTE F & G: Fatura 500 (1e509458-f041-40cb-8b75-725fcea14e6c)
    // -------------------------------------------------------------------------
    await supabase.rpc('recalcular_fatura_rpc', {
      p_workspace_id: workspaceId,
      p_cartao_id: cartaoMasterC6Id,
      p_competencia: '2026-11',
    })

    const { data: faturaF1 } = await supabase
      .from('faturas')
      .select('id, status, valor_total, valor_pago, saldo_pendente')
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoMasterC6Id)
      .eq('competencia', '2026-11')
      .single()

    const { data: contaBradescoPreF } = await supabase
      .from('contas')
      .select('saldo_atual')
      .eq('id', contaBradescoId)
      .single()

    const { data: cartoesPreF } = await supabase.rpc('obter_cartoes_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_incluir_inativos: false,
    })
    const comprometimentoPreF = cartoesPreF?.find(
      (c: any) => c.id === cartaoMasterC6Id,
    )?.total_comprometido

    const { data: resultadoPreF } = await supabase.rpc('calcular_regime_competencia_integral_rpc', {
      p_workspace_id: workspaceId,
      p_data_inicio: '2026-11-01',
      p_data_fim: '2026-11-30',
    })

    const { data: orcamentoPreF } = await supabase.rpc('obter_orcamento_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_competencia: '2026-11',
    })

    // Pagar parcial 200
    const { data: resPagarF, error: errPagarF } = await supabase.rpc('pagar_fatura_rpc', {
      p_workspace_id: workspaceId,
      p_fatura_id: faturaF1?.id,
      p_conta_id: contaBradescoId,
      p_valor: 200.0,
      p_data_pagamento: '2026-11-28',
    })

    const { data: faturaF2 } = await supabase
      .from('faturas')
      .select('id, status, valor_total, valor_pago, saldo_pendente')
      .eq('id', faturaF1?.id)
      .single()

    const { data: contaBradescoPosF } = await supabase
      .from('contas')
      .select('saldo_atual')
      .eq('id', contaBradescoId)
      .single()

    const { data: cartoesPosF } = await supabase.rpc('obter_cartoes_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_incluir_inativos: false,
    })
    const comprometimentoPosF = cartoesPosF?.find(
      (c: any) => c.id === cartaoMasterC6Id,
    )?.total_comprometido

    const { data: resultadoPosF } = await supabase.rpc('calcular_regime_competencia_integral_rpc', {
      p_workspace_id: workspaceId,
      p_data_inicio: '2026-11-01',
      p_data_fim: '2026-11-30',
    })

    const { data: orcamentoPosF } = await supabase.rpc('obter_orcamento_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_competencia: '2026-11',
    })

    // Verificar se lancamentos ou parcelas foram marcados como pagos
    const { data: lancamentosNaoPagosF } = await supabase
      .from('lancamentos')
      .select('id, status_pagamento')
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoMasterC6Id)
      .eq('competencia', '2026-11')
      .eq('status_pagamento', 'pago')

    resultados.testeF = {
      fatura_id: faturaF1?.id,
      res_pagar_rpc: resPagarF,
      status_antes: faturaF1?.status,
      status_depois: faturaF2?.status,
      valor_total: faturaF2?.valor_total,
      valor_pago: faturaF2?.valor_pago,
      saldo_pendente: faturaF2?.saldo_pendente,
      saldo_conta_antes: contaBradescoPreF?.saldo_atual,
      saldo_conta_depois: contaBradescoPosF?.saldo_atual,
      saldo_conta_delta:
        Number(contaBradescoPosF?.saldo_atual) - Number(contaBradescoPreF?.saldo_atual),
      comprometimento_antes: comprometimentoPreF,
      comprometimento_depois: comprometimentoPosF,
      comprometimento_delta: Number(comprometimentoPosF) - Number(comprometimentoPreF),
      lancamentos_marcados_pagos: lancamentosNaoPagosF?.length || 0,
      resultado_previsto_delta:
        Number(resultadoPosF?.despesas_previstas) - Number(resultadoPreF?.despesas_previstas),
      resultado_efetivado_delta:
        Number(resultadoPosF?.despesas_efetivadas) - Number(resultadoPreF?.despesas_efetivadas),
      orcamento_realizado_delta:
        Number(orcamentoPosF?.total_realizado) - Number(orcamentoPreF?.total_realizado),
    }

    // -------------------------------------------------------------------------
    // TESTE G: Estorno do parcial
    // -------------------------------------------------------------------------
    const { data: resEstornoG, error: errEstornoG } = await supabase.rpc('estornar_fatura_rpc', {
      p_workspace_id: workspaceId,
      p_fatura_id: faturaF1?.id,
    })

    const { data: faturaG } = await supabase
      .from('faturas')
      .select('id, status, valor_total, valor_pago, saldo_pendente')
      .eq('id', faturaF1?.id)
      .single()

    const { data: contaBradescoPosG } = await supabase
      .from('contas')
      .select('saldo_atual')
      .eq('id', contaBradescoId)
      .single()

    const { data: cartoesPosG } = await supabase.rpc('obter_cartoes_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_incluir_inativos: false,
    })
    const comprometimentoPosG = cartoesPosG?.find(
      (c: any) => c.id === cartaoMasterC6Id,
    )?.total_comprometido

    const { data: resultadoPosG } = await supabase.rpc('calcular_regime_competencia_integral_rpc', {
      p_workspace_id: workspaceId,
      p_data_inicio: '2026-11-01',
      p_data_fim: '2026-11-30',
    })

    const { data: orcamentoPosG } = await supabase.rpc('obter_orcamento_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_competencia: '2026-11',
    })

    resultados.testeG = {
      res_estorno_rpc: resEstornoG,
      total_estornado: resEstornoG?.total_estornado,
      status_apos_estorno: faturaG?.status,
      valor_pago_apos_estorno: faturaG?.valor_pago,
      saldo_pendente_apos_estorno: faturaG?.saldo_pendente,
      saldo_conta_apos_estorno: contaBradescoPosG?.saldo_atual,
      saldo_conta_restaurado_delta:
        Number(contaBradescoPosG?.saldo_atual) - Number(contaBradescoPosF?.saldo_atual),
      comprometimento_apos_estorno: comprometimentoPosG,
      comprometimento_restaurado_delta: Number(comprometimentoPosG) - Number(comprometimentoPosF),
      resultado_previsto_delta:
        Number(resultadoPosG?.despesas_previstas) - Number(resultadoPreF?.despesas_previstas),
      resultado_efetivado_delta:
        Number(resultadoPosG?.despesas_efetivadas) - Number(resultadoPreF?.despesas_efetivadas),
      orcamento_realizado_delta:
        Number(orcamentoPosG?.total_realizado) - Number(orcamentoPreF?.total_realizado),
    }

    // -------------------------------------------------------------------------
    // TESTE H: Regeneração de compra parcelada
    // Pai b7e10a01-0000-4000-8000-0000000000a6 (TESTE H Parcelada 1200 12x)
    // -------------------------------------------------------------------------
    const paiHId = 'b7e10a01-0000-4000-8000-0000000000a6'

    const { data: paiHAntes } = await supabase
      .from('lancamentos')
      .select('id, descricao, valor, valor_proprio, valor_terceiros, quantidade_parcelas, data')
      .eq('id', paiHId)
      .single()

    const { data: cartoesPreH } = await supabase.rpc('obter_cartoes_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_incluir_inativos: false,
    })
    const comprometimentoPreH = cartoesPreH?.find(
      (c: any) => c.id === cartaoMasterC6Id,
    )?.total_comprometido

    const { data: orcamentoPreH } = await supabase.rpc('obter_orcamento_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_competencia: '2026-11',
    })

    const { data: resultadoPreH } = await supabase.rpc('calcular_regime_competencia_integral_rpc', {
      p_workspace_id: workspaceId,
      p_data_inicio: '2026-11-01',
      p_data_fim: '2026-11-30',
    })

    // Chamar regenerar_parcelas_lancamento com 1080, SEM passar valor_proprio (deve reescalar proporcional)
    const { data: resRegenerarH, error: errRegenerarH } = await supabase.rpc(
      'regenerar_parcelas_lancamento',
      {
        p_workspace_id: workspaceId,
        p_lancamento_id: paiHId,
        p_novo_valor: 1080.0,
        p_nova_data: paiHAntes?.data || '2026-11-07',
        p_nova_quantidade_parcelas: 12,
        p_nova_descricao: 'TESTE H Parcelada 1080 12x',
        p_categoria_id: categoriaId,
        p_subcategoria_id: subcatEletrodomesticosId,
        p_novo_cartao_id: cartaoMasterC6Id,
      },
    )

    const { data: paiHPos } = await supabase
      .from('lancamentos')
      .select('id, descricao, valor, valor_proprio, valor_terceiros, quantidade_parcelas, data')
      .eq('id', paiHId)
      .single()

    const { data: parcelasH } = await supabase
      .from('parcelas')
      .select('id, valor, competencia, numero_parcela')
      .eq('lancamento_id', paiHId)

    const somaParcelasH = parcelasH?.reduce((acc: number, p: any) => acc + Number(p.valor), 0)

    const { data: cartoesPosH } = await supabase.rpc('obter_cartoes_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_incluir_inativos: false,
    })
    const comprometimentoPosH = cartoesPosH?.find(
      (c: any) => c.id === cartaoMasterC6Id,
    )?.total_comprometido

    const { data: orcamentoPosH } = await supabase.rpc('obter_orcamento_consolidado_rpc', {
      p_workspace_id: workspaceId,
      p_competencia: '2026-11',
    })

    const { data: resultadoPosH } = await supabase.rpc('calcular_regime_competencia_integral_rpc', {
      p_workspace_id: workspaceId,
      p_data_inicio: '2026-11-01',
      p_data_fim: '2026-11-30',
    })

    resultados.testeH = {
      pai_antes: paiHAntes,
      res_rpc: resRegenerarH,
      pai_depois: paiHPos,
      quantidade_parcelas: parcelasH?.length,
      soma_parcelas: somaParcelasH,
      comprometimento_antes: comprometimentoPreH,
      comprometimento_depois: comprometimentoPosH,
      comprometimento_delta: Number(comprometimentoPosH) - Number(comprometimentoPreH),
      orcamento_realizado_antes: orcamentoPreH?.total_realizado,
      orcamento_realizado_depois: orcamentoPosH?.total_realizado,
      orcamento_delta:
        Number(orcamentoPosH?.total_realizado) - Number(orcamentoPreH?.total_realizado),
      resultado_previsto_antes: resultadoPreH?.despesas_previstas,
      resultado_previsto_depois: resultadoPosH?.despesas_previstas,
      resultado_previsto_delta:
        Number(resultadoPosH?.despesas_previstas) - Number(resultadoPreH?.despesas_previstas),
      resultado_efetivado_antes: resultadoPreH?.despesas_efetivadas,
      resultado_efetivado_depois: resultadoPosH?.despesas_efetivadas,
      resultado_efetivado_delta:
        Number(resultadoPosH?.despesas_efetivadas) - Number(resultadoPreH?.despesas_efetivadas),
    }

    // -------------------------------------------------------------------------
    // TESTE H REPETIÇÃO: Com pai b7e10a01-0000-4000-8000-0000000000a3 (TESTE C)
    // -------------------------------------------------------------------------
    const paiCId = 'b7e10a01-0000-4000-8000-0000000000a3'
    const { data: paiCAntes } = await supabase
      .from('lancamentos')
      .select('id, descricao, valor, valor_proprio, valor_terceiros, quantidade_parcelas, data')
      .eq('id', paiCId)
      .single()

    // Regenera C para 1200 confirmando ida e volta
    const { data: resRegenerarC } = await supabase.rpc('regenerar_parcelas_lancamento', {
      p_workspace_id: workspaceId,
      p_lancamento_id: paiCId,
      p_novo_valor: 1200.0,
      p_nova_data: paiCAntes?.data || '2026-11-10',
      p_nova_quantidade_parcelas: 12,
      p_nova_descricao: 'TESTE C Parcelada Propria 1200 12x',
      p_categoria_id: categoriaId,
      p_subcategoria_id: subcatEletrodomesticosId,
      p_novo_cartao_id: cartaoMasterC6Id,
    })

    const { data: paiCPos } = await supabase
      .from('lancamentos')
      .select('id, descricao, valor, valor_proprio, valor_terceiros, quantidade_parcelas, data')
      .eq('id', paiCId)
      .single()

    resultados.testeC_regeneracao = {
      pai_antes: paiCAntes,
      res_rpc: resRegenerarC,
      pai_depois: paiCPos,
    }

    // -------------------------------------------------------------------------
    // VERIFICAÇÃO DADO REAL f953b711-4a2a-498f-9a70-1afcb6ae8655
    // -------------------------------------------------------------------------
    const { data: dadoRealF953 } = await supabase
      .from('lancamentos')
      .select('id, descricao, valor, valor_proprio, valor_terceiros, regime, modalidade_saida')
      .eq('id', 'f953b711-4a2a-498f-9a70-1afcb6ae8655')
      .single()

    resultados.dado_real_f953 = dadoRealF953

    // -------------------------------------------------------------------------
    // CONSISTÊNCIA C & D (sem duplicação):
    // TESTE C: 1200 próprio; TESTE D: 1000/10x com próprio 400
    // -------------------------------------------------------------------------
    const { data: parcelasC } = await supabase
      .from('parcelas')
      .select('id, valor, competencia, numero_parcela')
      .eq('lancamento_id', paiCId)

    const paiDId = 'b7e10a01-0000-4000-8000-0000000000a4'
    const { data: paiD } = await supabase
      .from('lancamentos')
      .select('id, descricao, valor, valor_proprio, valor_terceiros, quantidade_parcelas, data')
      .eq('id', paiDId)
      .single()

    const { data: parcelasD } = await supabase
      .from('parcelas')
      .select('id, valor, competencia, numero_parcela')
      .eq('lancamento_id', paiDId)

    resultados.consistencia_CD = {
      paiC: paiCPos,
      parcelasC_count: parcelasC?.length,
      paiD: paiD,
      parcelasD_count: parcelasD?.length,
    }

    // -------------------------------------------------------------------------
    // Registrar na tabela auditoria_operacoes
    // -------------------------------------------------------------------------
    await supabase.from('auditoria_operacoes').insert({
      workspace_id: workspaceId,
      entidade: 'testes_homologacao',
      entidade_id: workspaceId,
      acao: 'bateria_testes_AH',
      estado_anterior: null,
      estado_posterior: resultados,
    })

    return new Response(JSON.stringify({ sucesso: true, resultados }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ sucesso: false, erro: err.message, stack: err.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
