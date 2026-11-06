import {
  calcularSimulacao,
  calcularSimulacaoSimplificada,
  compararParcelamentos,
  calcularProjetarVencimentos,
  calcularDataVencimentoPrimeiraParcela,
  encontrarPrecoPixEquilibrio,
} from './calculadoraDecisao'

export function executarBateriaTestesCalculadora() {
  const resultados: Record<string, any> = {}

  // Teste 0: Validação da Engenharia (Complemento Seção 2)
  // Pix 4800, Cartão 5000, 10x500, taxa ref 13.75%, IR 22.5%
  const t0 = calcularSimulacaoSimplificada({
    precoPix: 4800,
    precoCartao: 5000,
    numeroParcelas: 10,
    taxaAnualReferencia: 0.1375,
    irSimplificado: 0.225,
  })
  resultados['Teste 0'] = {
    descricao: 'Validação da Engenharia (Complemento Seção 2: Pix 4.800 / Cartão 5.000 / 10x500)',
    rendimentoLiquidoAcumulado: t0.rendimentoLiquidoAcumulado,
    saldoFinal: t0.saldoFinal,
    vantagemCartao: t0.vantagemCartao,
    fechouEsperado: Math.abs(t0.saldoFinal - 27.58) <= 0.05,
    detalhesPeriodos: t0.periodos.map((p) => ({
      parcela: p.parcela,
      rendimento: p.rendimentoPeriodo,
      saldoApos: p.saldoAposParcela,
    })),
  }

  // Baseline padrão para os testes com datas reais:
  // Data compra: 2026-11-05, Fechamento dia 10, Vencimento dia 20 (compra antes do fechamento)
  // CDI 13.75%, 100% CDI, Dólar 5.30, Milheiro 20.00
  const baseParams = {
    precoPix: 5000,
    precoCartao: 5000,
    numeroParcelas: 1,
    dataCompra: '2026-11-05',
    diaFechamentoCartao: 10,
    diaVencimentoCartao: 20,
    pontosPorDolar: 0,
    cotacaoDolar: 5.3,
    valorMilheiro: 20,
    percentualCDI: 100,
    cdiAnual: 0.1375,
  }

  // Teste 1: Pix = Cartão (R$ 5.000), 1x, 0 pontos (impacto somente do prazo até vencimento)
  const t1 = calcularSimulacao({
    ...baseParams,
    precoPix: 5000,
    precoCartao: 5000,
    numeroParcelas: 1,
  })
  resultados['Teste 1'] = {
    descricao: 'Pix = Cartão (R$ 5.000), 1x, 0 pontos — impacto somente do prazo até vencimento',
    prazoDias: t1.memoria[0]?.diasPeriodo,
    rendimentoLiquido: t1.rendimentoLiquidoAcumulado,
    saldoFinal: t1.saldoFinal,
    vantagemFinal: t1.vantagemLiquidaFinal,
    vencedor: t1.vencedor,
    magnitude: t1.magnitude,
  }

  // Teste 2: Pix = Cartão (R$ 5.000), 12x, 0 pontos (parcelamento captura benefício do dinheiro aplicado)
  const t2 = calcularSimulacao({
    ...baseParams,
    precoPix: 5000,
    precoCartao: 5000,
    numeroParcelas: 12,
  })
  resultados['Teste 2'] = {
    descricao: 'Pix = Cartão (R$ 5.000), 12x, 0 pontos — benefício do dinheiro aplicado',
    rendimentoLiquido: t2.rendimentoLiquidoAcumulado,
    saldoFinal: t2.saldoFinal,
    vantagemFinal: t2.vantagemLiquidaFinal,
    vencedor: t2.vencedor,
    magnitude: t2.magnitude,
  }

  // Teste 3: Mesmo cenário anterior com cartão pontuando (ex: 2.5 pts/US$)
  const t3 = calcularSimulacao({
    ...baseParams,
    precoPix: 5000,
    precoCartao: 5000,
    numeroParcelas: 12,
    pontosPorDolar: 2.5,
  })
  resultados['Teste 3'] = {
    descricao: 'Pix = Cartão 12x com cartão pontuando 2.5 pts/US$ — valor adicional milhas',
    rendimentoLiquido: t3.rendimentoLiquidoAcumulado,
    pontosEstimados: t3.pontosEstimados,
    valorEconomicoMilhas: t3.valorEconomicoMilhas,
    saldoFinal: t3.saldoFinal,
    vantagemFinal: t3.vantagemLiquidaFinal,
    vencedor: t3.vencedor,
  }

  // Teste 4: Pix com desconto suficiente para superar o cartão (ex: Pix R$ 4.200 vs Cartão R$ 5.000 em 12x)
  const t4 = calcularSimulacao({
    ...baseParams,
    precoPix: 4200,
    precoCartao: 5000,
    numeroParcelas: 12,
    pontosPorDolar: 2.5,
  })
  resultados['Teste 4'] = {
    descricao: 'Pix com desconto de 16% (R$ 4.200 vs R$ 5.000) — Pix supera cartão',
    precoPix: t4.precoPix,
    precoCartao: t4.precoCartao,
    saldoFinal: t4.saldoFinal,
    vantagemFinal: t4.vantagemLiquidaFinal,
    vencedor: t4.vencedor,
    magnitude: t4.magnitude,
  }

  // Teste 5: Alterar milheiro (R$ 10 -> R$ 20 -> R$ 30)
  const t5_10 = calcularSimulacao({
    ...baseParams,
    precoPix: 4800,
    precoCartao: 5000,
    numeroParcelas: 10,
    pontosPorDolar: 2.0,
    valorMilheiro: 10,
  })
  const t5_20 = calcularSimulacao({
    ...baseParams,
    precoPix: 4800,
    precoCartao: 5000,
    numeroParcelas: 10,
    pontosPorDolar: 2.0,
    valorMilheiro: 20,
  })
  const t5_30 = calcularSimulacao({
    ...baseParams,
    precoPix: 4800,
    precoCartao: 5000,
    numeroParcelas: 10,
    pontosPorDolar: 2.0,
    valorMilheiro: 30,
  })
  resultados['Teste 5'] = {
    descricao: 'Sensibilidade ao valor do milheiro (R$ 10 -> R$ 20 -> R$ 30)',
    milheiro10: { milhas: t5_10.valorEconomicoMilhas, vantagemFinal: t5_10.vantagemLiquidaFinal },
    milheiro20: { milhas: t5_20.valorEconomicoMilhas, vantagemFinal: t5_20.vantagemLiquidaFinal },
    milheiro30: { milhas: t5_30.valorEconomicoMilhas, vantagemFinal: t5_30.vantagemLiquidaFinal },
  }

  // Teste 6: Alterar % CDI (100% CDI -> 90% CDI reduz benefício)
  const t6_100 = calcularSimulacao({
    ...baseParams,
    precoPix: 4800,
    precoCartao: 5000,
    numeroParcelas: 10,
    percentualCDI: 100,
  })
  const t6_90 = calcularSimulacao({
    ...baseParams,
    precoPix: 4800,
    precoCartao: 5000,
    numeroParcelas: 10,
    percentualCDI: 90,
  })
  resultados['Teste 6'] = {
    descricao: 'Redução de 100% CDI para 90% CDI',
    rendimento100CDI: t6_100.rendimentoLiquidoAcumulado,
    rendimento90CDI: t6_90.rendimentoLiquidoAcumulado,
    diferencaRendimento: t6_100.rendimentoLiquidoAcumulado - t6_90.rendimentoLiquidoAcumulado,
  }

  // Teste 7: Compra antes do fechamento (Compra 05/11/2026, Fechamento 10, Vencimento 20)
  // 1ª parcela vence em 20/11/2026 (15 dias de aplicação)
  const t7 = calcularSimulacao({
    ...baseParams,
    dataCompra: '2026-11-05',
    diaFechamentoCartao: 10,
    diaVencimentoCartao: 20,
    numeroParcelas: 6,
  })
  resultados['Teste 7'] = {
    descricao: 'Compra antes do fechamento (05/11, corte 10, venc 20)',
    vencimentoPrimeiraParcela: t7.memoria[0]?.dataVencimento,
    diasPrimeiraParcela: t7.memoria[0]?.diasPeriodo,
    rendimentoPrimeiraParcela: t7.memoria[0]?.rendimentoLiquido,
  }

  // Teste 8: Mesma compra depois do fechamento (Compra 12/11/2026, Fechamento 10, Vencimento 20)
  // 1ª parcela vence em 20/12/2026 (38 dias de aplicação)
  const t8 = calcularSimulacao({
    ...baseParams,
    dataCompra: '2026-11-12',
    diaFechamentoCartao: 10,
    diaVencimentoCartao: 20,
    numeroParcelas: 6,
  })
  resultados['Teste 8'] = {
    descricao: 'Compra após o fechamento (12/11, corte 10, venc 20)',
    vencimentoPrimeiraParcela: t8.memoria[0]?.dataVencimento,
    diasPrimeiraParcela: t8.memoria[0]?.diasPeriodo,
    rendimentoPrimeiraParcela: t8.memoria[0]?.rendimentoLiquido,
    diferencaDiasEmRelacaoT7: (t8.memoria[0]?.diasPeriodo || 0) - (t7.memoria[0]?.diasPeriodo || 0),
  }

  // Teste 9: Compra parcelada atravessando ano/calendário (Compra 15/11/2026, 6x, corte 10, venc 20)
  // Vencimentos: 20/12/2026, 20/01/2027, 20/02/2027, 20/03/2027, 20/04/2027, 20/05/2027
  const t9 = calcularSimulacao({
    ...baseParams,
    dataCompra: '2026-11-15',
    diaFechamentoCartao: 10,
    diaVencimentoCartao: 20,
    numeroParcelas: 6,
  })
  resultados['Teste 9'] = {
    descricao: 'Compra atravessando virada de ano e fevereiro (corte 10, venc 20)',
    datasVencimento: t9.memoria.map((m) => m.dataVencimento),
    viradaAnoConfirmada: t9.memoria[1]?.dataVencimento.startsWith('2027'),
  }

  // Teste 10: Alterar cartão mantendo demais dados (pontuação, fechamento, vencimento)
  const t10_c1 = calcularSimulacao({
    ...baseParams,
    diaFechamentoCartao: 5,
    diaVencimentoCartao: 15,
    pontosPorDolar: 1.0,
    numeroParcelas: 6,
  })
  const t10_c2 = calcularSimulacao({
    ...baseParams,
    diaFechamentoCartao: 20,
    diaVencimentoCartao: 30,
    pontosPorDolar: 2.5,
    numeroParcelas: 6,
  })
  resultados['Teste 10'] = {
    descricao: 'Alteração de cartão (Corte 5/Venc 15 / 1pt vs Corte 20/Venc 30 / 2.5pts)',
    cartao1: {
      vencimentoP1: t10_c1.memoria[0]?.dataVencimento,
      milhas: t10_c1.valorEconomicoMilhas,
      vantagemFinal: t10_c1.vantagemLiquidaFinal,
    },
    cartao2: {
      vencimentoP1: t10_c2.memoria[0]?.dataVencimento,
      milhas: t10_c2.valorEconomicoMilhas,
      vantagemFinal: t10_c2.vantagemLiquidaFinal,
    },
    diferencaVantagem: t10_c2.vantagemLiquidaFinal - t10_c1.vantagemLiquidaFinal,
  }

  // Teste 11: Simulação longa alcançando faixas distintas de IR (24x parcelas)
  // Alíquotas esperadas: 22.5% <= 180d, 20% 181-360d, 17.5% 361-720d, 15% > 720d
  const t11 = calcularSimulacao({
    ...baseParams,
    precoPix: 24000,
    precoCartao: 24000,
    numeroParcelas: 24,
  })
  const aliquotasEncontradas = Array.from(new Set(t11.memoria.map((m) => m.aliquotaIR)))
  resultados['Teste 11'] = {
    descricao: 'Simulação longa (24x) com faixas regressivas de IR',
    totalParcelas: t11.memoria.length,
    aliquotasDistintas: aliquotasEncontradas,
    faixaPrimeiraParcela: t11.memoria[0]?.aliquotaIR,
    faixaParcelaMeio: t11.memoria[11]?.aliquotaIR,
    faixaUltimaParcela: t11.memoria[23]?.aliquotaIR,
  }

  // Teste 12: Falha na cotação com valor manual
  // O motor aceita qualquer cotação manual passada pelo usuário sem travar
  const t12 = calcularSimulacao({
    ...baseParams,
    precoPix: 5000,
    precoCartao: 5000,
    cotacaoDolar: 6.0,
    pontosPorDolar: 2.0,
    numeroParcelas: 10,
  })
  resultados['Teste 12'] = {
    descricao: 'Simulação com valor manual de dólar (R$ 6,00) simulando fallback',
    cotacaoUsada: 6.0,
    pontosGerados: t12.pontosEstimados,
    milhasReais: t12.valorEconomicoMilhas,
    sucessoSemBloqueio: true,
  }

  // Teste 13: Desconto de equilíbrio do Pix
  // Ajustar o preço Pix para o valor exato de equilíbrio zera a vantagem final
  const t13_inicial = calcularSimulacao({
    ...baseParams,
    precoPix: 4800,
    precoCartao: 5000,
    numeroParcelas: 10,
    pontosPorDolar: 2.0,
  })
  const pixEquilibrio = t13_inicial.pixEquilibrioValor
  const t13_equilibrado = calcularSimulacao({
    ...baseParams,
    precoPix: pixEquilibrio,
    precoCartao: 5000,
    numeroParcelas: 10,
    pontosPorDolar: 2.0,
  })
  resultados['Teste 13'] = {
    descricao: 'Desconto de Equilíbrio do Pix (busca binária exata)',
    pixEquilibrioCalculado: pixEquilibrio,
    descontoEquilibrioPercent: t13_inicial.descontoEquilibrioPixPercent,
    vantagemFinalComPixEquilibrio: t13_equilibrado.vantagemLiquidaFinal,
    equilibradoComMargemCentavos: Math.abs(t13_equilibrado.vantagemLiquidaFinal) <= 0.15,
  }

  // Teste 14: Memória de cálculo somando exatamente o consolidado
  const somaBruto = t13_inicial.memoria.reduce((acc, m) => acc + m.rendimentoBruto, 0)
  const somaIR = t13_inicial.memoria.reduce((acc, m) => acc + m.valorIR, 0)
  const somaLiquido = t13_inicial.memoria.reduce((acc, m) => acc + m.rendimentoLiquido, 0)
  resultados['Teste 14'] = {
    descricao: 'Conferência exata de soma da memória de cálculo',
    somaBrutoPeriodos: Math.round(somaBruto * 100) / 100,
    totalBrutoConsolidado: t13_inicial.totais.rendimentoBrutoAcumulado,
    somaIRPeriodos: Math.round(somaIR * 100) / 100,
    totalIRConsolidado: t13_inicial.totais.irEstimadoAcumulado,
    somaLiquidoPeriodos: Math.round(somaLiquido * 100) / 100,
    totalLiquidoConsolidado: t13_inicial.totais.rendimentoLiquidoAcumulado,
    diferencaNominal: t13_inicial.totais.diferencaNominalPreco,
    vantagemFinal: t13_inicial.totais.vantagemLiquidaFinal,
    somasBatemExatamente:
      Math.abs(somaLiquido - t13_inicial.totais.rendimentoLiquidoAcumulado) < 0.01 &&
      Math.abs(somaIR - t13_inicial.totais.irEstimadoAcumulado) < 0.01,
  }

  return resultados
}
