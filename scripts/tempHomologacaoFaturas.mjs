// SCRIPT TEMPORÁRIO DE HOMOLOGAÇÃO — REMOVER após a homologação (não é código do app).
// Extração real (pdfjs-dist) + parsers reais do app empacotados com esbuild.
// Escreve o relatório em scripts/homologacao-saida.txt e sai SEMPRE com código 0.
// Fase 1: roda a homologação e agenda a fase 2 (re-execução de si mesmo).
// Fase 2: limpa artefatos temporários.
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execFileSync } from 'node:child_process'

const SAIDA = path.join(process.cwd(), 'scripts', 'homologacao-saida.txt')
const CONT = path.join(os.tmpdir(), 'sap-homolog-run')
const FASE = parseInt(fs.readFileSync(CONT, 'utf8').toString().trim() || '1', 10)

function saida(texto) {
  fs.appendFileSync(SAIDA, texto + '\n', 'utf8')
}
function faseLog(...args) {
  const line = args.join(' ')
  saida(line)
  console.log(line)
}

async function fase1() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const assets = path.join(process.cwd(), 'src', 'assets')
  const ARQ = {
    caixa: path.join(assets, 'caixa-master-e-caixa-visa-27b80.pdf'),
    c6bradesco: path.join(assets, 'master-c6-e-brasdesco-visa-cab13.pdf'),
  }

  faseLog(
    'HOMOLOGAÇÃO IMPORTAÇÃO DE FATURAS EM PDF — extração real (pdfjs-dist) + parsers reais do app',
  )
  faseLog('Data/hora: ' + new Date().toISOString())
  faseLog('')

  async function extrair(arquivo) {
    const data = new Uint8Array(fs.readFileSync(arquivo))
    const task = pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false })
    let pediuSenha = false
    task.onPassword = (cb) => {
      pediuSenha = true
      cb('')
    }
    try {
      const doc = await task.promise
      const paginas = []
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const tc = await page.getTextContent()
        const items = tc.items
        const buckets = new Map()
        for (const it of items) {
          if (!it.str || !it.str.trim()) continue
          const y = Math.round(it.transform[5])
          const x = it.transform[4]
          let bucket = buckets.get(y)
          if (!bucket) {
            for (const [k, v] of buckets.entries()) {
              if (Math.abs(k - y) <= 2) {
                bucket = v
                break
              }
            }
          }
          if (!bucket) {
            bucket = []
            buckets.set(y, bucket)
          }
          bucket.push({ x, text: it.str })
        }
        const ys = Array.from(buckets.keys()).sort((a, b) => b - a)
        const lines = []
        for (const y of ys) {
          const b = buckets.get(y)
          b.sort((p, q) => p.x - q.x)
          const t = b
            .map((i2) => i2.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
          if (t) lines.push(t)
        }
        paginas.push({ pageNumber: i, lines })
      }
      return { ok: true, protegido: false, numPages: doc.numPages, paginas }
    } catch (err) {
      const nome = err && err.name
      if (nome === 'PasswordException' || pediuSenha) {
        return { ok: false, protegido: true, motivo: 'PDF exigiu senha (PasswordException)' }
      }
      return { ok: false, protegido: false, motivo: 'Erro: ' + (err && err.message) }
    }
  }

  const esbuild = await import('esbuild')
  await esbuild.build({
    entryPoints: [path.join(process.cwd(), 'src/services/pdf/faturaParserRouter.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: path.join(process.cwd(), 'scripts', '.tmp-parser.mjs'),
    logLevel: 'silent',
    alias: { '@': path.join(process.cwd(), 'src') },
  })
  const router = await import(path.join(process.cwd(), 'scripts', '.tmp-parser.mjs'))
  const { detectarEmissorFatura, executarParserFatura } = router

  function fmt(n) {
    return Number(n).toFixed(2).replace('.', ',')
  }

  function resumo(nome, r) {
    faseLog('')
    faseLog('=== ' + nome + ' ===')
    faseLog(
      'emissor: ' +
        r.cabecalho.emissor +
        ' | emissorNome: ' +
        r.cabecalho.emissorNome +
        ' | pdfProtegido: ' +
        r.cabecalho.pdfProtegido,
    )
    faseLog(
      'competencia: ' +
        (r.cabecalho.competencia ?? '-') +
        ' | vencimento: ' +
        (r.cabecalho.vencimento ?? '-') +
        ' | fechamento: ' +
        (r.cabecalho.fechamento ?? '-') +
        ' | valorTotalFatura: ' +
        fmt(r.cabecalho.valorTotalFatura ?? 0),
    )
    faseLog('titulares: ' + r.cabecalho.titulares.join(' / '))
    faseLog('finais: ' + r.cabecalho.finais.join(', '))
    faseLog('quantidadeItens: ' + r.cabecalho.quantidadeItens)
    faseLog(
      'resumoFinanceiro: comprasEncargos=' +
        fmt(r.resumoFinanceiro.comprasEncargosReconhecidos) +
        ' | creditos=' +
        fmt(r.resumoFinanceiro.creditosRelevantes) +
        ' | diferenca=' +
        fmt(r.resumoFinanceiro.diferenca) +
        ' | conferido=' +
        r.resumoFinanceiro.conferido,
    )
    for (const a of r.avisos) faseLog('AVISO: ' + a)
    faseLog('--- linhas extraídas ---')
    for (const l of r.linhas) {
      faseLog(
        [
          String(l.ordem).padStart(3),
          l.data,
          l.tipo.padEnd(10),
          l.tratamento.padEnd(14),
          (l.finalCartao ?? '').padEnd(5),
          (l.titular ?? '').slice(0, 22).padEnd(22),
          fmt(l.valor).padStart(10),
          l.parcelaAtual ? l.parcelaAtual + '/' + l.totalParcelas : '  ',
          l.valorTotalEstimado != null ? 'est:' + fmt(l.valorTotalEstimado) : '',
          l.dataInferidaDeAnoAnterior ? 'ANO_ANT' : '',
          l.descricaoOriginal,
        ].join(' | '),
      )
    }
    const dup = new Map()
    for (const l of r.linhas) {
      const k = l.data + '|' + l.descricaoNormalizada + '|' + fmt(Math.abs(l.valor))
      dup.set(k, (dup.get(k) ?? 0) + 1)
      if (dup.get(k) > 1) {
        faseLog(
          '*** DUPLICIDADE: ' +
            l.descricaoOriginal +
            ' ' +
            l.data +
            ' ' +
            fmt(l.valor) +
            ' (tratamento=' +
            l.tratamento +
            ')',
        )
      }
    }
  }

  function agruparPorEmissor(paginas) {
    const grupos = []
    for (const p of paginas) {
      const em = detectarEmissorFatura(p.lines.join('\n'))
      const ultimo = grupos[grupos.length - 1]
      if (ultimo && (ultimo.emissor === em || em === 'outro')) {
        ultimo.paginas.push(p)
      } else {
        grupos.push({ emissor: em, paginas: [p] })
      }
    }
    return grupos
  }

  // ---------- ARQUIVO 1: CAIXA MASTER + CAIXA VISA ----------
  faseLog('################################################################')
  faseLog('# ARQUIVO 1: caixa-master-e-caixa-visa-27b80.pdf')
  faseLog('################################################################')
  const cx = await extrair(ARQ.caixa)
  if (!cx.ok) {
    faseLog('FALHA NA LEITURA: ' + cx.motivo + ' | protegido=' + cx.protegido)
  } else {
    faseLog('páginas: ' + cx.numPages)
    for (const p of cx.paginas) {
      faseLog(
        '  página ' +
          p.pageNumber +
          ': emissor=' +
          detectarEmissorFatura(p.lines.join('\n')) +
          ' | linhas=' +
          p.lines.length +
          ' | 1ª linha: ' +
          (p.lines[0] ?? '(vazia)').slice(0, 90),
      )
    }
    const grupos = agruparPorEmissor(cx.paginas)
    for (const g of grupos) {
      const lines = g.paginas.flatMap((p) => p.lines)
      const fullText = lines.join('\n')
      if (g.emissor === 'outro') {
        faseLog(
          'GRUPO SEM EMISSOR DETECTADO (páginas ' +
            g.paginas.map((p) => p.pageNumber).join(',') +
            ') — primeiras linhas:',
        )
        for (const l of lines.slice(0, 8)) faseLog('   | ' + l.slice(0, 110))
        continue
      }
      const r = executarParserFatura(fullText, lines, g.emissor)
      resumo(
        g.emissor.toUpperCase() + ' (páginas ' + g.paginas.map((p) => p.pageNumber).join(',') + ')',
        r,
      )
    }
  }

  // ---------- ARQUIVO 2: C6 (protegido) + BRADESCO VISA ----------
  faseLog('')
  faseLog('################################################################')
  faseLog('# ARQUIVO 2: master-c6-e-brasdesco-visa-cab13.pdf')
  faseLog('################################################################')
  const cb = await extrair(ARQ.c6bradesco)
  if (!cb.ok) {
    faseLog('FALHA NA LEITURA: ' + cb.motivo + ' | protegido=' + cb.protegido)
    if (cb.protegido) {
      faseLog('=> PDF PROTEGIDO confirmado: extração do C6 NÃO executada sem a senha.')
      faseLog(
        '=> PENDÊNCIA HONESTA: homologação do C6 só ocorrerá no app, com a senha informada pelo usuário (senha apenas em memória).',
      )
    }
  } else {
    faseLog('páginas: ' + cb.numPages)
    for (const p of cb.paginas) {
      const txt = p.lines.join('\n')
      faseLog(
        '  página ' +
          p.pageNumber +
          ': emissor=' +
          detectarEmissorFatura(txt) +
          ' | linhas=' +
          p.lines.length +
          ' | 1ª linha: ' +
          (p.lines[0] ?? '(vazia)').slice(0, 90),
      )
    }
    const grupos = agruparPorEmissor(cb.paginas)
    for (const g of grupos) {
      const lines = g.paginas.flatMap((p) => p.lines)
      const fullText = lines.join('\n')
      if (g.emissor === 'c6') {
        faseLog(
          'C6: página(s) ' +
            g.paginas.map((p) => p.pageNumber).join(',') +
            ' detectadas como c6. Linhas de texto legíveis: ' +
            lines.length,
        )
        if (lines.length === 0) {
          faseLog(
            'C6: SEM TEXTO EXTRAÍVEL — conteúdo protegido; extração NÃO executada sem a senha (impossível sem senha).',
          )
          faseLog(
            '=> PENDÊNCIA HONESTA: homologação do C6 só ocorrerá no app, com a senha informada pelo usuário (senha apenas em memória).',
          )
        } else {
          faseLog('C6: há texto legível — primeiras 30 linhas para diagnóstico:')
          for (const l of lines.slice(0, 30)) faseLog('   | ' + l.slice(0, 110))
        }
        continue
      }
      if (g.emissor === 'outro') {
        faseLog(
          'GRUPO SEM EMISSOR DETECTADO (páginas ' +
            g.paginas.map((p) => p.pageNumber).join(',') +
            ') — primeiras linhas:',
        )
        for (const l of lines.slice(0, 8)) faseLog('   | ' + l.slice(0, 110))
        continue
      }
      const r = executarParserFatura(fullText, lines, g.emissor)
      resumo(
        g.emissor.toUpperCase() + ' (páginas ' + g.paginas.map((p) => p.pageNumber).join(',') + ')',
        r,
      )
    }
  }

  faseLog('')
  faseLog('FIM DA HOMOLOGAÇÃO')
}

function fase2() {
  try {
    fs.unlinkSync(path.join(process.cwd(), 'scripts', '.tmp-parser.mjs'))
  } catch {}
  try {
    fs.unlinkSync(CONT)
  } catch {}
  saida('')
  saida('RUNNER FINALIZADO (fases 1 e 2 concluídas)')
  console.log('RUNNER FINALIZADO (fases 1 e 2 concluídas)')
}

async function main() {
  // Fase única: roda a homologação e limpa os artefatos temporários no mesmo processo.
  try {
    await fase1()
  } catch (e) {
    saida('ERRO FATAL NA FASE 1: ' + ((e && e.stack) || String(e)))
    console.log('ERRO FATAL NA FASE 1: ' + ((e && e.stack) || String(e)))
  }
  fase2()
}

main()
