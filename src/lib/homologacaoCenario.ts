import { calcularSimulacao, compararParcelamentos } from './calculadoraDecisao'

/**
 * Script de homologação exata conforme especificação:
 * Preço Pix: R$ 4.800
 * Preço Cartão: R$ 5.000
 * Parcelas: 10
 * Compra: 06/11/2026
 * Fechamento: dia 4
 * Vencimento: dia 10
 * Pontuação: 0
 * CDB: 100% CDI
 * Taxa CDI: 13,65% a.a. (BCB SGS 4389 / referência do mercado atual)
 */
export function executarHomologacaoObrigatoria(cdiAnual = 0.1365) {
  const params = {
    precoPix: 4800,
    precoCartao: 5000,
    numeroParcelas: 10,
    dataCompra: '2026-11-06',
    diaFechamentoCartao: 4,
    diaVencimentoCartao: 10,
    pontosPorDolar: 0,
    cotacaoDolar: 5.3,
    valorMilheiro: 20,
    percentualCDI: 100,
    cdiAnual,
  }

  const res = calcularSimulacao(params)
  const comparacao = compararParcelamentos(params)

  return {
    parametros: params,
    resultado: res,
    comparacao,
  }
}
