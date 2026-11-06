// Script Node STANDALONE de homologação — extrai texto dos PDFs reais com a MESMA
// lib que o app usa (pdfjs-dist) e executa os parsers reais do app transpilados
// na hora (strip de tipos + reescrita do alias '@/').
// Uso único: node scripts/homolog-faturas.mjs — removido após a homologação.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transformSync } from 'oxc-transform'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const SRC = path.resolve('src')
const ASSETS = path.resolve('src/assets')

// Resolve imports '@/x' para o arquivo real dentro de src/ e compila TS -> JS em memória
const cacheModulos = new Map()
async function carregarModulo(caminhoAbsoluto) {
  if (cacheModulos.has(caminhoAbsoluto)) return cacheModulos.get(caminhoAbsoluto)
  const fonte = fs.readFileSync(caminhoAbsoluto, 'utf8')
  const { code, errors } = transformSync(caminhoAbsoluto, fonte, { lang: 'ts' })
  if (errors && errors.length) {
    throw new Error(`oxc-transform falhou em ${caminhoAbsoluto}: ${JSON.stringify(errors)}`)
  }
  const js = code.replace(/from '(@\/[^']+)'/g, (_m, alias) => {
    const rel = alias.slice(2)
    const tentativa = ['ts', 'tsx'].map((e) => path.resolve(SRC, rel + '.' + e))
    const arquivo = tentativa.find((t) => fs.existsSync(t))
    if (!arquivo) throw new Error(`Alias não resolvido: ${alias}`)
    return `from ${JSON.stringify(pathToFileURL(arquivo).href)}`
  })
  const modulo = await import(
    'data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64')
  )
  cacheModulos.set(caminhoAbsoluto, modulo)
  return modulo
}

// pdfjs-dist legacy build funciona em Node sem worker
const pdfjsLib = await import(
  pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
)

async function extrairTextoPdf(arquivo) {
  const data = new Uint8Array(fs.readFileSync(arquivo))
  const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true, disableFontFace: true })

  let passwordRequired = false
  loadingTask.onPassword = (callback) => {
    passwordRequired = true
    callback('')
  }

  let pdfDoc
  try {
    pdfDoc = await loadingTask.promise
  } catch (err) {
    if (err?.name === 'PasswordException' || passwordRequired) {
      return { protegido: true, paginas: [] }
    }
    throw err
  }

  const paginas = []
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const textContent = await page.getTextContent()
    const items = textContent.items.filter((it) => it.str && it.str.trim() !== '')

    // Agrupar por coordenada Y (mesma lógica de src/services/pdf/pdfReader.ts)
    const buckets = new Map()
    for (const item of items) {
      const y = Math.round(item.transform[5])
      const x = item.transform[4]
      let key = y
      if (!buckets.has(key)) {
        for (const k of buckets.keys()) {
          if (Math.abs(k - y) <= 2) {
            key = k
            break
          }
        }
      }
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push({ x, text: item.str })
    }

    const linhas = []
    for (const y of Array.from(buckets.keys()).sort((a, b) => b - a)) {
      const linha = buckets
        .get(y)
        .sort((a, b) => a.x - b.x)
        .map((b) => b.text)
        .join(' ')
        .trim()
      if (linha) linhas.push(linha)
    }
    paginas.push({ numero: i, linhas })
  }
  return { protegido: false, paginas }
}

function resumoParser(resultado) {
  const compras = resultado.linhas.filter((l) => !l.isCredito).reduce((s, l) => s + l.valor, 0)
  const creditos = resultado.linhas.filter((l) => l.isCredito).reduce((s, l) => s + l.valor, 0)
  return {
    emissor: resultado.cabecalho.emissor,
    competencia: resultado.cabecalho.competencia,
    vencimento: resultado.cabecalho.vencimento,
    titulares: resultado.cabecalho.titulares,
    finais: resultado.cabecalho.finais,
    valorTotalFatura: resultado.resumoFinanceiro.valorTotalFatura,
    comprasEncargos: Math.round(compras * 100) / 100,
    creditos: Math.round(creditos * 100) / 100,
    diferenca: resultado.resumoFinanceiro.diferenca,
    conferido: resultado.resumoFinanceiro.conferido,
    quantidadeItens: resultado.linhas.length,
  }
}

// ---- 1. Bradesco Visa (dentro de master-c6-e-brasdesco-visa-cab13.pdf) ----
console.log('='.repeat(70))
console.log('PDF: master-c6-e-brasdesco-visa-cab13.pdf (Bradesco Visa na segunda metade)')
const bradPdf = await extrairTextoPdf(path.join(ASSETS, 'master-c6-e-brasdesco-visa-cab13.pdf'))
if (bradPdf.protegido) {
  console.log('>> PDF PROTEGIDO (não extraído)')
} else {
  const todasLinhas = bradPdf.paginas.flatMap((p) => p.linhas)
  // Localizar início do bloco Bradesco no PDF combinado
  let inicioBrad = todasLinhas.findIndex((l) => /BRADESCO/i.test(l))
  console.log(
    `Total de linhas no PDF: ${todasLinhas.length}; primeira linha "BRADESCO" em índice ${inicioBrad}`,
  )
  const textoCompleto = todasLinhas.join('\n')
  const { detectarEmissorFatura, executarParserFatura } = await carregarModulo(
    path.resolve(SRC, 'services/pdf/faturaParserRouter.ts'),
  )
  const emissor = detectarEmissorFatura(textoCompleto)
  console.log(`Emissor detectado (texto completo): ${emissor}`)

  // Testar o PDF inteiro com o parser Bradesco
  const resultado = executarParserFatura(textoCompleto, todasLinhas, 'bradesco')
  console.log('--- Resultado Bradesco (PDF inteiro) ---')
  console.log(JSON.stringify(resumoParser(resultado), null, 2))

  // Linhas de transação reconhecidas pelo parser (amostra)
  for (const l of resultado.linhas.slice(0, 40)) {
    console.log(
      `  ${l.data} ${l.descricaoOriginal} = ${l.valor.toFixed(2)}${l.totalParcelas ? ` (${l.parcelaAtual}/${l.totalParcelas})` : ''}${l.isCredito ? ' [CRÉDITO]' : ''} final:${l.finalCartao}`,
    )
  }

  // Se houver bloco Bradesco separável, testar também só o bloco dele
  const bradText = textoCompleto.slice(textoCompleto.toUpperCase().indexOf('BRADESCO'))
  if (bradText.length > 50) {
    const linhasBrad = todasLinhas.filter((l) => true).slice(Math.max(0, inicioBrad - 1))
    const r2 = executarParserFatura(bradText, linhasBrad, 'bradesco')
    console.log('--- Resultado Bradesco (bloco Bradesco somente) ---')
    console.log(JSON.stringify(resumoParser(r2), null, 2))
    for (const l of r2.linhas.slice(0, 40)) {
      console.log(
        `  ${l.data} ${l.descricaoOriginal} = ${l.valor.toFixed(2)}${l.totalParcelas ? ` (${l.parcelaAtual}/${l.totalParcelas})` : ''}${l.isCredito ? ' [CRÉDITO]' : ''} final:${l.finalCartao}`,
      )
    }
  }

  // Procurar C6 no mesmo PDF (protegido?) — apenas verificar presença
  const temC6 = /C6\s*BANK|BANCO\s*C6/i.test(textoCompleto)
  console.log(`PDF também menciona C6 Bank: ${temC6}`)
}

// ---- 2. CAIXA Master + CAIXA Visa (caixa-master-e-caixa-visa-27b80.pdf) ----
console.log('='.repeat(70))
console.log('PDF: caixa-master-e-caixa-visa-27b80.pdf')
const caixaPdf = await extrairTextoPdf(path.join(ASSETS, 'caixa-master-e-caixa-visa-27b80.pdf'))
if (caixaPdf.protegido) {
  console.log('>> PDF PROTEGIDO (não extraído)')
} else {
  const todasLinhas = caixaPdf.paginas.flatMap((p) => p.linhas)
  const textoCompleto = todasLinhas.join('\n')
  const { detectarEmissorFatura, executarParserFatura } = await carregarModulo(
    path.resolve(SRC, 'services/pdf/faturaParserRouter.ts'),
  )
  const emissor = detectarEmissorFatura(textoCompleto)
  console.log(`Emissor detectado (texto completo): ${emissor}`)
  console.log(`Total de linhas: ${todasLinhas.length}`)

  // Separar blocos: cada fatura CAIXA repete "Demonstrativo" — dividir por página
  // contendo a palavra-chave de cada bandeira
  const idxMaster = todasLinhas.findIndex((l) => /MASTERCARD|5530/i.test(l))
  console.log(`Primeira linha com MASTERCARD/5530: índice ${idxMaster}`)

  // Extrair a data do vencimento e o valor total de cada bloco via regex bruta
  const mVenc = textoCompleto.match(/VENCIMENTO\s*(\d{2}\/\d{2}\/\d{4})/gi)
  console.log(`Vencimentos encontrados: ${JSON.stringify(mVenc)}`)
  const mTot = textoCompleto.match(/VALOR\s+TOTAL\s+DESTA\s+FATURA[\s\S]{0,40}?([\d.]+,\d{2})/gi)
  console.log(`Totais encontrados: ${JSON.stringify(mTot)}`)

  const resultado = executarParserFatura(textoCompleto, todasLinhas, 'caixa_master')
  console.log('--- Resultado CAIXA (PDF inteiro, forçado caixa_master) ---')
  console.log(JSON.stringify(resumoParser(resultado), null, 2))
  for (const l of resultado.linhas.slice(0, 60)) {
    console.log(
      `  ${l.data} ${l.descricaoOriginal} = ${l.valor.toFixed(2)}${l.totalParcelas ? ` (${l.parcelaAtual}/${l.totalParcelas})` : ''}${l.isCredito ? ' [CRÉDITO]' : ''} final:${l.finalCartao}`,
    )
  }

  // Visa: rodar com emissorForcado caixa_visa para comparar
  const rVisa = executarParserFatura(textoCompleto, todasLinhas, 'caixa_visa')
  console.log('--- Resultado CAIXA (PDF inteiro, forçado caixa_visa) ---')
  console.log(JSON.stringify(resumoParser(rVisa), null, 2))
}
