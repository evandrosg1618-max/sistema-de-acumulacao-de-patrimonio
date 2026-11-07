import {
  extrairDataInicial,
  extrairParcelamento,
  extrairValorMonetario,
  interpretarLinhaOcr,
} from './ocrLinhasParser'

// Testes para validação e documentação dos formatos homologados e CAIXA OCR
export function testarOcrParserLinhas() {
  const casosSucesso = [
    // Homologados C6
    {
      linha: 'OD 22set IRMAOSGONCALVES F35 247,00',
      dataEsperada: '22/09',
      valorEsperado: 247,
      parcelaEsperada: undefined,
    },
    {
      linha: '01/10 DROGASIL 3529 VILHENA R$ 121,07',
      dataEsperada: '01/10',
      valorEsperado: 121.07,
      parcelaEsperada: undefined,
    },
    {
      linha: '01/10 HAVAN VILHENA 01/02 R$ 77,49',
      dataEsperada: '01/10',
      valorEsperado: 77.49,
      parcelaEsperada: { p: 1, t: 2 },
    },
    // CAIXA OCR
    {
      linha: 'EB 25/08 HAVANVILHENA 02DE0S BRUSQUE 93,360',
      dataEsperada: '25/08',
      valorEsperado: 93.36,
      parcelaEsperada: { p: 2, t: 5 },
    },
    {
      linha: 'EB 2508 REUSEBRECHO - 02DEO2 VILHENA 100.000',
      dataEsperada: '25/08',
      valorEsperado: 100,
      parcelaEsperada: { p: 2, t: 2 },
    },
    {
      linha: 'EB 2608 MAGOCALCADOS - O02DEOS VILHENA 37,900',
      dataEsperada: '26/08',
      valorEsperado: 37.9,
      parcelaEsperada: { p: 2, t: 5 },
    },
    {
      linha: 'EB 2608 RIMAPPYVILHENARO 02DE04 VILHENA 62.900',
      dataEsperada: '26/08',
      valorEsperado: 62.9,
      parcelaEsperada: { p: 2, t: 4 },
    },
    {
      linha: 'EB 29/08 AMERICANA MANIPULACAO 02DE03 Vilhena 67,330',
      dataEsperada: '29/08',
      valorEsperado: 67.33,
      parcelaEsperada: { p: 2, t: 3 },
    },
    {
      linha: 'EB 0209 VILHENACALCADOS 02DE02 Vihena 114.800',
      dataEsperada: '02/09',
      valorEsperado: 114.8,
      parcelaEsperada: { p: 2, t: 2 },
    },
    {
      linha: '1902 MarcenaiMadeias O8DEOS VILHENA 280500',
      dataEsperada: '19/02',
      valorEsperado: 280.5,
      parcelaEsperada: { p: 8, t: 5 },
    },
    {
      linha: '2006 JKAUTOPECAS O4DE10 CACOAL 296.000',
      dataEsperada: '20/06',
      valorEsperado: 296,
      parcelaEsperada: { p: 4, t: 10 },
    },
    {
      linha: 'mM 2011 EC *FACLPERSIANA 11DE12 CAMPINAS 3767D',
      dataEsperada: '20/11',
      valorEsperado: 37.67,
      parcelaEsperada: { p: 11, t: 12 },
    },
    {
      linha: 'BD 2912 AdaptaOrg 10DE 12 Sao Paulo 94,830',
      dataEsperada: '29/12',
      valorEsperado: 94.83,
      parcelaEsperada: { p: 10, t: 12 },
    },
    {
      linha: '17/03 AMAZONMKTPLCPROLIFESU 07 DE0S BELO HORIZONT 52,520',
      dataEsperada: '17/03',
      valorEsperado: 52.52,
      parcelaEsperada: { p: 7, t: 5 },
    },
    {
      linha: 'M 17/04 AMAZONMKTPLCLIFESMARK 06DEO6 SAO PAULO 44,850',
      dataEsperada: '17/04',
      valorEsperado: 44.85,
      parcelaEsperada: { p: 6, t: 6 },
    },
    {
      linha: '18/05 AMAZONMKTPLCLIFESMARK 0SDEO6 SAO PAULO 42,100',
      dataEsperada: '18/05',
      valorEsperado: 42.1,
      parcelaEsperada: { p: 5, t: 6 },
    },
    {
      linha: '7 25/06 MERCADOLIVRE MERCADOL 04DE07 LOUVEIRA s357D',
      dataEsperada: '25/06',
      valorEsperado: 35.7,
      parcelaEsperada: { p: 4, t: 7 },
    },
    {
      linha: 'm 25/06 AMAZONMKTPLCRAIZVERDE 04DE06 SERRA 32,630',
      dataEsperada: '25/06',
      valorEsperado: 32.63,
      parcelaEsperada: { p: 4, t: 6 },
    },
    {
      linha: '1 25/06 AMAZONMKTPLCDAVIFLORE 04DE06 RIOCLARO 33310',
      dataEsperada: '25/06',
      valorEsperado: 33.31,
      parcelaEsperada: { p: 4, t: 6 },
    },
    // Bradesco Visa (linhas sem título)
    {
      linha: '01/10 IRMAOS GONCALVES F35 VILHENA 250,38',
      dataEsperada: '01/10',
      valorEsperado: 250.38,
      parcelaEsperada: undefined,
    },
    {
      linha: '26/11 ELECTROLUX elect 11/21 Curitiba 271,75',
      dataEsperada: '26/11',
      valorEsperado: 271.75,
      parcelaEsperada: { p: 11, t: 21 },
    },
  ]

  const erros: string[] = []

  casosSucesso.forEach((c) => {
    const res = interpretarLinhaOcr(c.linha, 0, 1, 2026)
    if (!res) {
      erros.push(`Falhou ao interpretar: ${c.linha}`)
      return
    }
    if (res.diaMes !== c.dataEsperada) {
      erros.push(`Data errada para "${c.linha}": esperado ${c.dataEsperada}, obtido ${res.diaMes}`)
    }
    if (Math.abs(res.valor - c.valorEsperado) > 0.01) {
      erros.push(`Valor errado para "${c.linha}": esperado ${c.valorEsperado}, obtido ${res.valor}`)
    }
    if (c.parcelaEsperada) {
      if (res.parcelaAtual !== c.parcelaEsperada.p || res.totalParcelas !== c.parcelaEsperada.t) {
        erros.push(
          `Parcela errada para "${c.linha}": esperado ${c.parcelaEsperada.p}/${c.parcelaEsperada.t}, obtido ${res.parcelaAtual}/${res.totalParcelas}`,
        )
      }
    }
  })

  // Linhas que NUNCA devem virar lançamentos
  const descartes = [
    'Total COMPRAS PARCELADAS 483,66D',
    'Total final cartão 7965 483,66D',
    'Total COMPRAS s2,030',
    'Total final cartão 0445 578,50',
    'EVANDRO DA SILVA GUEDES íCartão 0443',
    'COMPRAS PARCELADAS Cartão 7965',
    'Data Descrição Cidade/Pais Valor US$ Crédito Débito',
  ]

  descartes.forEach((d) => {
    const res = interpretarLinhaOcr(d, 0, 1, 2026)
    if (res) {
      erros.push(`Linha deveria ser descartada mas gerou item: ${d}`)
    }
  })

  if (erros.length > 0) {
    throw new Error(`Erros nos testes do OCR: \n${erros.join('\n')}`)
  }

  return true
}

export const __noop = true
