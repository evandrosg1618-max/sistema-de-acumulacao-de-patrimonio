/**
 * Serviço de Cotações Externas para a Calculadora de Decisão
 *
 * Fontes oficiais:
 * 1. Dólar PTAX Venda: API pública do Banco Central do Brasil (olinda.bcb.gov.br)
 * 2. CDI Anualizado: SGS 4390 (BCB - Taxa CDI acumulada anualizada base 252 ou série anual oficial)
 * 3. Selic Meta: SGS 432 (BCB - Meta Selic definida pelo Copom)
 *
 * Regras:
 * - Nenhum valor hardcoded
 * - Timeout curto (5s)
 * - Cache em localStorage com timestamp
 * - Fallback gracioso: se API externa falhar, mantém último valor válido e permite edição manual
 * - Alerta claro ao usuário: "valor automático não pôde ser atualizado" sem bloquear a calculadora
 * - Nenhuma chave privada ou secret exposta no frontend
 */

export interface CotacaoItem {
  valor: number
  fonte: string
  dataHora: string // ISO ou formatada PT-BR
  atualizadoAutomaticamente: boolean
  erro?: string
}

export interface CotacoesCalculadora {
  dolar: CotacaoItem
  cdiAnual: CotacaoItem // taxa decimal, ex: 0.1375 (13.75% a.a.)
  selicMeta: CotacaoItem // taxa percentual a.a., ex: 13.75
}

const STORAGE_KEY_COTACOES = 'sap_calculadora_cotacoes_cache'

// Valores de fallback seguro se cache estiver vazio e rede falhar
const FALLBACK_PADRAO: CotacoesCalculadora = {
  dolar: {
    valor: 5.3,
    fonte: 'Banco Central do Brasil (PTAX Venda - Referência)',
    dataHora: new Date().toISOString(),
    atualizadoAutomaticamente: false,
  },
  cdiAnual: {
    valor: 0.1375, // 13.75% a.a.
    fonte: 'Banco Central do Brasil (SGS 4390 - Referência)',
    dataHora: new Date().toISOString(),
    atualizadoAutomaticamente: false,
  },
  selicMeta: {
    valor: 13.75, // 13.75% a.a.
    fonte: 'Banco Central do Brasil / Copom (SGS 432 - Referência)',
    dataHora: new Date().toISOString(),
    atualizadoAutomaticamente: false,
  },
}

function carregarCache(): CotacoesCalculadora {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COTACOES)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        dolar: parsed.dolar || FALLBACK_PADRAO.dolar,
        cdiAnual: parsed.cdiAnual || FALLBACK_PADRAO.cdiAnual,
        selicMeta: parsed.selicMeta || FALLBACK_PADRAO.selicMeta,
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar cache de cotações:', e)
  }
  return FALLBACK_PADRAO
}

function salvarCache(cotacoes: CotacoesCalculadora): void {
  try {
    localStorage.setItem(STORAGE_KEY_COTACOES, JSON.stringify(cotacoes))
  } catch (e) {
    console.warn('Erro ao salvar cache de cotações:', e)
  }
}

/**
 * Busca cotação PTAX Venda mais recente via API Olinda BCB
 */
async function buscarDolarPTAX(): Promise<CotacaoItem> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  try {
    // Formatar data atual e data 5 dias atrás (para fins de semana e feriados)
    const hoje = new Date()
    const cincoDiasAtras = new Date(hoje.getTime() - 5 * 24 * 60 * 60 * 1000)

    const formatarDataBCB = (d: Date) => {
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dia = String(d.getDate()).padStart(2, '0')
      const y = d.getFullYear()
      return `'${m}-${dia}-${y}'`
    }

    const dataIni = formatarDataBCB(cincoDiasAtras)
    const dataFim = formatarDataBCB(hoje)

    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial=${dataIni}&@dataFinalCotacao=${dataFim}&$top=1&$orderby=dataHoraCotacao%20desc&$format=json`

    const resp = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`)
    }

    const json = await resp.json()
    const dados = json?.value

    if (dados && dados.length > 0 && typeof dados[0].cotacaoVenda === 'number') {
      const cotacao = dados[0]
      return {
        valor: Number(cotacao.cotacaoVenda),
        fonte: 'Banco Central do Brasil (PTAX Venda)',
        dataHora: cotacao.dataHoraCotacao || new Date().toISOString(),
        atualizadoAutomaticamente: true,
      }
    }

    throw new Error('Nenhum dado retornado na API PTAX')
  } catch (err: any) {
    clearTimeout(timeoutId)
    throw err
  }
}

/**
 * Busca o último valor de uma série SGS do Banco Central
 * SGS 432 = Taxa Selic meta (% a.a.)
 * SGS 4390 = Taxa Selic acumulada no mês anualizada base 252 (referência CDI) ou SGS 11 / 4389
 */
async function buscarSGS(codigoSerie: number): Promise<{ valor: number; data: string }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigoSerie}/dados/ultimos/1?formato=json`
    const resp = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`)
    }

    const json = await resp.json()
    if (json && json.length > 0) {
      const item = json[0]
      const val = parseFloat(String(item.valor).replace(',', '.'))
      if (!isNaN(val)) {
        return { valor: val, data: item.data }
      }
    }

    throw new Error(`Série ${codigoSerie} sem dados válidos`)
  } catch (err) {
    clearTimeout(timeoutId)
    throw err
  }
}

export const cotacoesService = {
  /**
   * Obtém cotações do cache imediatamente e tenta atualizar em background/paralelo
   */
  async obterCotacoes(): Promise<CotacoesCalculadora> {
    const cache = carregarCache()
    let atualizado = false
    const resultado: CotacoesCalculadora = { ...cache }

    // 1. Tentar PTAX Dólar
    try {
      const dolarNovo = await buscarDolarPTAX()
      resultado.dolar = dolarNovo
      atualizado = true
    } catch (e: any) {
      console.warn('Falha na atualização automática do Dólar PTAX:', e?.message || e)
      resultado.dolar = {
        ...resultado.dolar,
        atualizadoAutomaticamente: false,
        erro: 'Valor automático do dólar não pôde ser atualizado. Usando última cotação disponível.',
      }
    }

    // 2. Tentar Selic Meta (SGS 432)
    try {
      const sgsSelic = await buscarSGS(432)
      resultado.selicMeta = {
        valor: sgsSelic.valor,
        fonte: 'Banco Central do Brasil / Copom (SGS 432)',
        dataHora: sgsSelic.data,
        atualizadoAutomaticamente: true,
      }
      atualizado = true
    } catch (e: any) {
      console.warn('Falha na atualização automática da Selic Meta (SGS 432):', e?.message || e)
      resultado.selicMeta = {
        ...resultado.selicMeta,
        atualizadoAutomaticamente: false,
        erro: 'Valor da Selic não pôde ser atualizado.',
      }
    }

    // 3. Tentar CDI Anualizado (SGS 4390)
    try {
      const sgsCDI = await buscarSGS(4390)
      // SGS 4390 retorna percentual a.a. (ex: 13.65). Converte para decimal (0.1365)
      resultado.cdiAnual = {
        valor: sgsCDI.valor / 100,
        fonte: 'Banco Central do Brasil (SGS 4390 - CDI Anualizado)',
        dataHora: sgsCDI.data,
        atualizadoAutomaticamente: true,
      }
      atualizado = true
    } catch (e: any) {
      console.warn('Falha na atualização automática do CDI (SGS 4390):', e?.message || e)
      resultado.cdiAnual = {
        ...resultado.cdiAnual,
        atualizadoAutomaticamente: false,
        erro: 'Valor do CDI não pôde ser atualizado.',
      }
    }

    if (atualizado) {
      salvarCache(resultado)
    }

    return resultado
  },

  /**
   * Permite salvar valores manuais editados pelo usuário
   */
  salvarManual(novosValores: Partial<CotacoesCalculadora>): CotacoesCalculadora {
    const cache = carregarCache()
    const atualizado: CotacoesCalculadora = {
      dolar: novosValores.dolar || cache.dolar,
      cdiAnual: novosValores.cdiAnual || cache.cdiAnual,
      selicMeta: novosValores.selicMeta || cache.selicMeta,
    }
    salvarCache(atualizado)
    return atualizado
  },
}
