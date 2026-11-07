import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText,
  Upload,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Filter,
  CheckSquare,
  Square,
  CreditCard,
  Clock,
  RefreshCw,
  Info,
  Camera,
  ClipboardPaste,
  Image as ImageIcon,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  Eye,
  Loader2,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useGlobalLoading } from '@/contexts/LoadingContext'
import {
  faturaImportacaoService,
  FaturaImportacaoRegistro,
  FaturaImportacaoLinhaRegistro,
} from '@/services/faturaImportacaoService'
import { cartaoService, categoriaService } from '@/services/sap'
import { Cartao, Categoria, Subcategoria } from '@/types/sap'
import {
  extrairTextoPdf,
  PdfExtractionOutput,
  PasswordRequiredError,
  InvalidPasswordError,
  calcularHashArquivo,
} from '@/services/pdf/pdfReader'
import { executarParserFatura } from '@/services/pdf/faturaParserRouter'
import { ParserResult } from '@/types/faturaPdf'
import { LinhaRevisaoFaturaItem } from '@/components/LinhaRevisaoFaturaItem'
import { ModalEdicaoEmMassaFatura, PatchEdicaoEmMassa } from '@/components/ModalEdicaoEmMassaFatura'
import { ModalSenhaPdf } from '@/components/ModalSenhaPdf'
import { ModalSessaoExistenteCartao } from '@/components/ModalSessaoExistenteCartao'
import { ModalDescarteNavegacao } from '@/components/ModalDescarteNavegacao'
import { ModalVisualizarFaturasEmProcessamento } from '@/components/ModalVisualizarFaturasEmProcessamento'
import { PainelTextoExtraido } from '@/components/PainelTextoExtraido'
import { formatMoneyBRL } from '@/lib/formatters'
import { executarOcrImagem } from '@/services/imageOcr/tesseractService'
import {
  processarLinhasOcrMultiplasImagens,
  ImagemExtraidaDiagnostico,
} from '@/services/imageOcr/ocrLinhasParser'

interface ItemImagemCapturada {
  id: string
  file: File
  previewUrl: string
  nome: string
}

export function ImportarFaturaPage() {
  const navigate = useNavigate()
  const { user, currentWorkspace } = useAuth()
  const { startProcessing, stopProcessing } = useGlobalLoading()

  // Estados de dados fundamentais
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [cartaoSelecionadoId, setCartaoSelecionadoId] = useState<string>('')
  const [erroCargaCartoes, setErroCargaCartoes] = useState<string | null>(null)
  const [erroCargaCategorias, setErroCargaCategorias] = useState<string | null>(null)

  // Fonte de entrada: 'imagem' ou 'pdf'
  const [metodoEntrada, setMetodoEntrada] = useState<'imagem' | 'pdf'>('imagem')

  // Estado para PDF
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null)
  const [arquivoBuffer, setArquivoBuffer] = useState<ArrayBuffer | null>(null)

  // Estado para Imagens múltiplas
  const [imagensCapturadas, setImagensCapturadas] = useState<ItemImagemCapturada[]>([])
  const [imagemPreviewAberto, setImagemPreviewAberto] = useState<string | null>(null)
  const [progressoOcr, setProgressoOcr] = useState<{
    ativo: boolean
    mensagem: string
    imagemAtual: number
    totalImagens: number
  }>({ ativo: false, mensagem: '', imagemAtual: 0, totalImagens: 0 })

  // C5 — Senha do PDF (Regra de proteção contra travamento)
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false)
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [processandoLeitura, setProcessandoLeitura] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Input refs para acionamento invisível
  const fileInputPdfRef = useRef<HTMLInputElement>(null)
  const fileInputImagemRef = useRef<HTMLInputElement>(null)
  const fileInputCameraRef = useRef<HTMLInputElement>(null)

  // Estados da Sessão / Linhas em Revisão
  const [sessaoAtual, setSessaoAtual] = useState<FaturaImportacaoRegistro | null>(null)
  const [linhas, setLinhas] = useState<FaturaImportacaoLinhaRegistro[]>([])
  const [filtroAtivo, setFiltroAtivo] = useState<string>('todos')
  const [modalMassaAberto, setModalMassaAberto] = useState(false)
  const [importandoFinal, setImportandoFinal] = useState(false)

  // C4 / C5 — Diagnóstico ("Ver extração & Diagnóstico")
  const [extracaoAtual, setExtracaoAtual] = useState<PdfExtractionOutput | null>(null)
  const [parsedAtual, setParsedAtual] = useState<ParserResult | null>(null)
  const [origemTipoAtual, setOrigemTipoAtual] = useState<'pdf' | 'imagem'>('pdf')
  const [diagnosticosImagem, setDiagnosticosImagem] = useState<ImagemExtraidaDiagnostico[]>([])

  // C4 — Flag de captura parcial em imagem
  const [capturaParcialImagem, setCapturaParcialImagem] = useState<boolean>(false)

  // Estados do Ciclo de Vida (Sessões anteriores, descarte, etc.)
  const [sessaoExistenteCartao, setSessaoExistenteCartao] =
    useState<FaturaImportacaoRegistro | null>(null)
  const [modalSessaoCartaoAberto, setModalSessaoCartaoAberto] = useState(false)
  const [modalDescarteAberto, setModalDescarteAberto] = useState(false)
  const [caminhoNavegacaoPendente, setCaminhoNavegacaoPendente] = useState<string | null>(null)
  const [salvouContinuarDepois, setSalvouContinuarDepois] = useState(false)
  const [modalFaturasProcessamentoAberto, setModalFaturasProcessamentoAberto] = useState(false)
  const [faturasEmProcessamento, setFaturasEmProcessamento] = useState<FaturaImportacaoRegistro[]>(
    [],
  )
  const [carregandoFaturasProcessamento, setCarregandoFaturasProcessamento] = useState(false)
  const [avisoHashReimportacao, setAvisoHashReimportacao] = useState<string | null>(null)

  // Filtros de revisão
  const [buscaTexto, setBuscaTexto] = useState('')
  const [filtroTitular, setFiltroTitular] = useState('todos')
  const [filtroFinal, setFiltroFinal] = useState('todos')

  const wsId = currentWorkspace?.workspace_id

  // Limpeza de URLs de preview ao desmontar
  useEffect(() => {
    return () => {
      imagensCapturadas.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    }
  }, [imagensCapturadas])

  // Carga independente de cartões e categorias
  const carregarCartoes = async (idWs: string) => {
    setErroCargaCartoes(null)
    try {
      const cList = await cartaoService.list(idWs)
      const cartoesAtivos = cList.filter((c: any) => !c.arquivado && !c.deleted_at)
      setCartoes(cartoesAtivos)
      if (cartoesAtivos.length > 0) {
        setCartaoSelecionadoId((atual) =>
          cartoesAtivos.some((c: Cartao) => c.id === atual) ? atual : cartoesAtivos[0].id,
        )
      }
    } catch (err: any) {
      setCartoes([])
      setErroCargaCartoes(err?.message || 'Falha ao carregar os cartões.')
    }
  }

  const carregarCategorias = async (idWs: string) => {
    setErroCargaCategorias(null)
    try {
      const catsComSubs = await categoriaService.listComSubcategorias(idWs, false)
      const catsDespesa = catsComSubs.filter((c: any) => c.tipo === 'despesa')
      setCategorias(catsDespesa)
      setSubcategorias(catsDespesa.flatMap((c: any) => c.subcategorias || []))
    } catch (err: any) {
      setCategorias([])
      setSubcategorias([])
      setErroCargaCategorias(err?.message || 'Falha ao carregar as categorias.')
    }
  }

  useEffect(() => {
    if (!wsId) return
    carregarCartoes(wsId)
    carregarCategorias(wsId)
  }, [wsId])

  const tentarNovamenteCargas = () => {
    if (!wsId) return
    carregarCartoes(wsId)
    carregarCategorias(wsId)
  }

  // Ao selecionar um cartão, verificar se ele já tem sessão ativa em processamento
  const handleSelecionarCartao = async (novoCartaoId: string) => {
    setCartaoSelecionadoId(novoCartaoId)
    if (!wsId || !novoCartaoId) return

    try {
      const ativa = await faturaImportacaoService.obterSessaoAtivaDoCartao(wsId, novoCartaoId)
      if (ativa) {
        setSessaoExistenteCartao(ativa)
        setModalSessaoCartaoAberto(true)
      }
    } catch (err) {
      console.warn('Erro ao verificar sessão ativa do cartão:', err)
    }
  }

  const handleVisualizarSessaoExistente = async () => {
    if (!wsId || !sessaoExistenteCartao) return
    try {
      startProcessing('Carregando fatura em processamento...')
      const sessao = await faturaImportacaoService.obterSessao(wsId, sessaoExistenteCartao.id)
      setSessaoAtual(sessao.importacao)
      setLinhas(sessao.linhas)
      setOrigemTipoAtual(
        sessao.importacao.arquivo_nome?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'imagem',
      )
      setModalSessaoCartaoAberto(false)
      toast.info('Fatura em processamento carregada para revisão.')
    } catch (err: any) {
      toast.error('Não foi possível carregar a fatura em processamento: ' + err.message)
    } finally {
      stopProcessing()
    }
  }

  const handleEscolherImportarNova = () => {
    setModalSessaoCartaoAberto(false)
    toast.info('Pronto para importar nova fatura. A nova fatura prevalecerá.')
  }

  // =====================================================================================
  // SELEÇÃO / CAPTURA DE IMAGENS (Colar print Ctrl+V, Selecionar, Câmera, Drag & Drop)
  // =====================================================================================

  const adicionarArquivosImagem = (files: FileList | File[]) => {
    const lista = Array.from(files)
    const validas = lista.filter((f) => f.type.startsWith('image/'))

    if (validas.length === 0) {
      toast.error('Nenhum arquivo de imagem válido encontrado.')
      return
    }

    const novosItens: ItemImagemCapturada[] = validas.map((f, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
      nome: f.name || `Captura ${imagensCapturadas.length + idx + 1}`,
    }))

    setImagensCapturadas((prev) => [...prev, ...novosItens])
    setMetodoEntrada('imagem')
    toast.success(
      `${validas.length} imagem(ns) adicionada(s). Total: ${
        imagensCapturadas.length + validas.length
      }.`,
    )
  }

  // Suporte a Ctrl+V no navegador
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return
      }
      if (sessaoAtual) return // já em revisão

      const items = e.clipboardData?.items
      if (!items) return

      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile()
          if (blob) {
            files.push(
              new File(
                [blob],
                `Print-${new Date().toISOString().substring(11, 19).replace(/:/g, '')}.png`,
                { type: blob.type },
              ),
            )
          }
        }
      }

      if (files.length > 0) {
        e.preventDefault()
        adicionarArquivosImagem(files)
        toast.info('Print colado da área de transferência!')
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [sessaoAtual, imagensCapturadas.length])

  // Drag and drop para imagens e PDFs
  const [arrastandoSobre, setArrastandoSobre] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setArrastandoSobre(true)
  }

  const handleDragLeave = () => {
    setArrastandoSobre(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setArrastandoSobre(false)
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const primeiro = e.dataTransfer.files[0]
      if (primeiro.type === 'application/pdf' || primeiro.name.toLowerCase().endsWith('.pdf')) {
        carregarArquivoPdf(primeiro)
      } else {
        adicionarArquivosImagem(e.dataTransfer.files)
      }
    }
  }

  const handleRemoverImagem = (id: string) => {
    setImagensCapturadas((prev) => {
      const item = prev.find((x) => x.id === id)
      if (item) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((x) => x.id !== id)
    })
  }

  const handleMoverImagem = (idx: number, direcao: -1 | 1) => {
    setImagensCapturadas((prev) => {
      const novoIdx = idx + direcao
      if (novoIdx < 0 || novoIdx >= prev.length) return prev
      const copia = [...prev]
      const temp = copia[idx]
      copia[idx] = copia[novoIdx]
      copia[novoIdx] = temp
      return copia
    })
  }

  // =====================================================================================
  // SELEÇÃO DE PDF
  // =====================================================================================

  const carregarArquivoPdf = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Por favor, selecione um arquivo em formato PDF.')
      return
    }

    setArquivoSelecionado(file)
    setMetodoEntrada('pdf')

    try {
      const buffer = await file.arrayBuffer()
      setArquivoBuffer(buffer)

      if (wsId) {
        const hash = await calcularHashArquivo(buffer)
        const reimportacao = await faturaImportacaoService.verificarHashExistente(wsId, hash)
        if (reimportacao) {
          setAvisoHashReimportacao(
            `Aviso informativo: Este arquivo já foi importado anteriormente em ${new Date(
              reimportacao.created_at,
            ).toLocaleDateString(
              'pt-BR',
            )}. Você pode prosseguir normalmente para atualizar os lançamentos.`,
          )
        } else {
          setAvisoHashReimportacao(null)
        }
      }
    } catch {
      toast.error('Não foi possível ler o arquivo selecionado.')
    }
  }

  const handleSelecionarArquivoPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await carregarArquivoPdf(file)
  }

  // =====================================================================================
  // PROCESSAMENTO OCR POR IMAGEM
  // =====================================================================================

  const handleProcessarImagens = async () => {
    if (!cartaoSelecionadoId) {
      toast.error('Selecione o cartão cadastrado antes de processar.')
      return
    }
    if (imagensCapturadas.length === 0) {
      toast.error('Adicione pelo menos uma imagem ou print para processar.')
      return
    }
    if (!wsId) return

    setProcessandoLeitura(true)
    startProcessing('Iniciando reconhecimento de imagem (OCR pt-BR)...')
    setProgressoOcr({
      ativo: true,
      mensagem: 'Carregando motor OCR...',
      imagemAtual: 0,
      totalImagens: imagensCapturadas.length,
    })

    const ac = new AbortController()
    abortControllerRef.current = ac

    try {
      const cartaoAtual = cartoes.find((c) => c.id === cartaoSelecionadoId)
      const nomeCartao = cartaoAtual?.nome || 'Cartão'
      const anoPadrao = new Date().getFullYear()

      const imagensInputOcr: Array<{
        indice: number
        nome: string
        lines: string[]
        linhas: string[]
      }> = []

      // OCR em cada imagem sequencialmente com atualização de progresso
      for (let i = 0; i < imagensCapturadas.length; i++) {
        if (ac.signal.aborted) throw new Error('Processamento cancelado pelo usuário.')

        const img = imagensCapturadas[i]
        setProgressoOcr({
          ativo: true,
          mensagem: `Reconhecendo Imagem ${i + 1} de ${imagensCapturadas.length} (${img.nome})...`,
          imagemAtual: i + 1,
          totalImagens: imagensCapturadas.length,
        })

        const resOcr = await executarOcrImagem(
          img.file,
          (p) => {
            const pct = Math.round(p.progress * 100)
            setProgressoOcr((prev) => ({
              ...prev,
              mensagem: `Imagem ${i + 1} de ${imagensCapturadas.length} — OCR ${p.status} (${pct}%)`,
            }))
          },
          ac.signal,
        )

        imagensInputOcr.push({
          indice: i,
          nome: img.nome,
          lines: resOcr.lines,
          linhas: resOcr.lines,
        })
      }

      setProgressoOcr((prev) => ({
        ...prev,
        mensagem: 'Interpretando e normalizando lançamentos...',
      }))

      // Normaliza para o mesmo formato de ParserResult do PDF
      const resultadoOcr = processarLinhasOcrMultiplasImagens(imagensInputOcr, {
        anoPadrao,
        nomeCartao,
      })

      const parsed = resultadoOcr.parserResult

      if (parsed.linhas.length === 0) {
        toast.warning(
          'Nenhum lançamento foi reconhecido com clareza nas imagens. Verifique se a captura contém data, descrição e valor legíveis.',
        )
      }

      // Hash representativo para a sessão
      const hash = `img-${Date.now()}-${imagensCapturadas.length}`

      // Criar sessão e linhas temporárias usando o MESMO faturaImportacaoService
      const { importacaoId, linhas: linhasGravadas } =
        await faturaImportacaoService.criarSessaoImportacao({
          workspaceId: wsId,
          cartaoId: cartaoSelecionadoId,
          arquivoNome: `Captura por Imagem (${imagensCapturadas.length} print${
            imagensCapturadas.length > 1 ? 's' : ''
          })`,
          arquivoHash: hash,
          parsed,
          userId: user?.id,
        })

      const sessao = await faturaImportacaoService.obterSessao(wsId, importacaoId)
      setSessaoAtual(sessao.importacao)
      setLinhas(linhasGravadas)
      setParsedAtual(parsed)
      setOrigemTipoAtual('imagem')
      setDiagnosticosImagem(resultadoOcr.diagnosticos)
      setCapturaParcialImagem(resultadoOcr.capturaParcial)
      setExtracaoAtual(null)
      setSalvouContinuarDepois(false)

      toast.success(
        `OCR concluído! ${linhasGravadas.length} lançamentos candidatos identificados para revisão.`,
      )
    } catch (err: any) {
      if (err?.message?.includes('cancelado pelo usuário')) {
        toast.info('Processamento de OCR cancelado.')
      } else {
        const detalhe = err?.message || 'Falha no reconhecimento da imagem.'
        toast.error(`Erro ao processar imagem: ${detalhe}`)
      }
    } finally {
      stopProcessing()
      setProcessandoLeitura(false)
      setProgressoOcr({ ativo: false, mensagem: '', imagemAtual: 0, totalImagens: 0 })
    }
  }

  // =====================================================================================
  // PROCESSAMENTO DE PDF (mantido 100% fiel e intocado ao homologado)
  // =====================================================================================

  const handleIniciarProcessamentoPdf = async (senhaFornecida?: string) => {
    if (!arquivoBuffer || !arquivoSelecionado) {
      toast.error('Nenhum arquivo PDF carregado.')
      return
    }
    if (!cartaoSelecionadoId) {
      toast.error('Selecione o cartão cadastrado antes de processar.')
      return
    }
    if (!wsId) return

    setProcessandoLeitura(true)
    startProcessing('Lendo arquivo PDF...')

    const ac = new AbortController()
    abortControllerRef.current = ac

    try {
      const hash = await calcularHashArquivo(arquivoBuffer)

      let extraction
      try {
        extraction = await extrairTextoPdf(arquivoBuffer, senhaFornecida, ac.signal)
      } catch (tentativaErr: any) {
        if (senhaFornecida && !(tentativaErr instanceof InvalidPasswordError)) {
          try {
            extraction = await extrairTextoPdf(arquivoBuffer, undefined, ac.signal)
          } catch {
            throw tentativaErr
          }
        } else {
          throw tentativaErr
        }
      }

      if (modalSenhaAberto) {
        setModalSenhaAberto(false)
      }

      const cartaoAtual = cartoes.find((c) => c.id === cartaoSelecionadoId)
      let emissorForcadoPorCartao: any = undefined
      if (cartaoAtual) {
        const iconeCartao = ((cartaoAtual as any).icone || '').toLowerCase()
        const nomeCartao = (cartaoAtual.nome || '').toLowerCase()
        const bandeiraCartao = ((cartaoAtual as any).bandeira || '').toLowerCase()

        if (iconeCartao.includes('c6') || nomeCartao.includes('c6')) {
          emissorForcadoPorCartao = 'c6'
        } else if (iconeCartao.includes('bradesco') || nomeCartao.includes('bradesco')) {
          emissorForcadoPorCartao = 'bradesco'
        } else if (
          iconeCartao.includes('caixa') ||
          nomeCartao.includes('caixa') ||
          iconeCartao.includes('cef')
        ) {
          if (bandeiraCartao.includes('master') || nomeCartao.includes('master')) {
            emissorForcadoPorCartao = 'caixa_master'
          } else {
            emissorForcadoPorCartao = 'caixa_visa'
          }
        }
      }

      const allLines = extraction.pages.flatMap((p) => p.lines)
      const parsed = executarParserFatura(extraction.fullText, allLines, emissorForcadoPorCartao)

      const { importacaoId, linhas: linhasGravadas } =
        await faturaImportacaoService.criarSessaoImportacao({
          workspaceId: wsId,
          cartaoId: cartaoSelecionadoId,
          arquivoNome: arquivoSelecionado.name,
          arquivoHash: hash,
          parsed,
          userId: user?.id,
        })

      const sessao = await faturaImportacaoService.obterSessao(wsId, importacaoId)
      setSessaoAtual(sessao.importacao)
      setLinhas(linhasGravadas)
      setExtracaoAtual(extraction)
      setParsedAtual(parsed)
      setOrigemTipoAtual('pdf')
      setDiagnosticosImagem([])
      setCapturaParcialImagem(false)
      setSalvouContinuarDepois(false)

      toast.success(
        `Fatura lida com sucesso! ${linhasGravadas.length} itens extraídos para revisão.`,
      )
    } catch (err: any) {
      if (err instanceof PasswordRequiredError) {
        setModalSenhaAberto(true)
        setErroSenha(null)
      } else if (err instanceof InvalidPasswordError) {
        setModalSenhaAberto(true)
        setErroSenha('Senha incorreta para abrir este PDF. Verifique e tente novamente.')
      } else if (err?.message?.includes('cancelado pelo usuário')) {
        toast.info('Processamento cancelado.')
      } else {
        const detalhe = err?.message || 'Arquivo corrompido ou formato não suportado'
        toast.error(`Falha ao ler o PDF: ${detalhe}`)
      }
    } finally {
      stopProcessing()
      setProcessandoLeitura(false)
    }
  }

  const handleCancelarProcessamento = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    stopProcessing()
    setProcessandoLeitura(false)
    setModalSenhaAberto(false)
    setErroSenha(null)
    setProgressoOcr({ ativo: false, mensagem: '', imagemAtual: 0, totalImagens: 0 })
  }

  // =====================================================================================
  // AÇÕES NA TABELA DE REVISÃO (COMPARTILHADA POR IMAGEM E PDF)
  // =====================================================================================

  const handleAlterarLinha = async (
    linhaId: string,
    dados: Partial<FaturaImportacaoLinhaRegistro>,
  ) => {
    setLinhas((prev) => prev.map((l) => (l.id === linhaId ? { ...l, ...dados } : l)))
    await faturaImportacaoService.atualizarLinha(linhaId, dados)
  }

  const handleAlternarSelecao = async (linhaId: string, selecionado: boolean) => {
    setLinhas((prev) => prev.map((l) => (l.id === linhaId ? { ...l, selecionado } : l)))
    await faturaImportacaoService.atualizarLinha(linhaId, { selecionado })
  }

  const handleSelecionarTodosVisiveis = async (selecionar: boolean) => {
    const idsVisiveis = linhasFiltradas.map((l) => l.id)
    if (idsVisiveis.length === 0) return

    setLinhas((prev) =>
      prev.map((l) => (idsVisiveis.includes(l.id) ? { ...l, selecionado: selecionar } : l)),
    )
    await faturaImportacaoService.atualizarLinhasEmMassa(idsVisiveis, { selecionado: selecionar })
    toast.success(
      selecionar
        ? `${idsVisiveis.length} itens marcados.`
        : `${idsVisiveis.length} itens desmarcados.`,
    )
  }

  const handleConfirmarTodasCompraPropria = async () => {
    const ids = linhasFiltradas.map((l) => l.id)
    if (ids.length === 0) return

    setLinhas((prev) =>
      prev.map((l) =>
        ids.includes(l.id)
          ? {
              ...l,
              modalidade_saida: 'compra_propria' as const,
              valor_proprio: l.valor,
              valor_terceiros: 0,
            }
          : l,
      ),
    )
    await faturaImportacaoService.atualizarLinhasEmMassa(ids, {
      modalidade_saida: 'compra_propria',
    })
    toast.success(`${ids.length} itens confirmados como Compra Própria 100%.`)
  }

  // C6 — Aplicação da edição em massa por PATCH de campos seletivos
  const handleAplicarEdicaoEmMassa = async (patch: PatchEdicaoEmMassa) => {
    const selecionados = linhas.filter((l) => l.selecionado).map((l) => l.id)
    if (selecionados.length === 0) return

    const alteracoesDb: Record<string, any> = {}

    if (patch.aplicarDescricao && patch.descricao !== undefined) {
      alteracoesDb.descricao_editavel = patch.descricao
    }
    if (patch.aplicarData && patch.data !== undefined) {
      alteracoesDb.data = patch.data
    }
    if (patch.aplicarCategoria && patch.categoriaId !== undefined) {
      alteracoesDb.categoria_id = patch.categoriaId
    }
    if (patch.aplicarSubcategoria && patch.subcategoriaId !== undefined) {
      alteracoesDb.subcategoria_id = patch.subcategoriaId
    }
    if (patch.aplicarModalidade && patch.modalidadeSaida !== undefined) {
      alteracoesDb.modalidade_saida = patch.modalidadeSaida
    }
    if (patch.aplicarAfetaResultado && patch.afetaResultado !== undefined) {
      alteracoesDb.afeta_resultado = patch.afetaResultado
    }
    if (patch.aplicarAfetaOrcamento && patch.afetaOrcamento !== undefined) {
      alteracoesDb.afeta_orcamento = patch.afetaOrcamento
    }
    if (patch.aplicarObservacao && patch.observacao !== undefined) {
      alteracoesDb.observacao = patch.observacao
    }
    if (patch.marcarIgnorado) {
      alteracoesDb.status = 'ignorado'
      alteracoesDb.selecionado = false
    }

    setLinhas((prev) =>
      prev.map((l) => {
        if (!selecionados.includes(l.id)) return l

        const novo: FaturaImportacaoLinhaRegistro = { ...l }

        if (patch.aplicarDescricao && patch.descricao !== undefined) {
          novo.descricao_editavel = patch.descricao
        }
        if (patch.aplicarData && patch.data !== undefined) {
          novo.data = patch.data
        }
        if (patch.aplicarCategoria && patch.categoriaId !== undefined) {
          novo.categoria_id = patch.categoriaId
        }
        if (patch.aplicarSubcategoria && patch.subcategoriaId !== undefined) {
          novo.subcategoria_id = patch.subcategoriaId
        }
        if (patch.aplicarModalidade && patch.modalidadeSaida !== undefined) {
          novo.modalidade_saida = patch.modalidadeSaida as any
          if (patch.modalidadeSaida === 'compra_propria') {
            novo.valor_proprio = l.valor
            novo.valor_terceiros = 0
          }
        }
        if (patch.aplicarValorProprio && patch.valorProprio !== undefined) {
          novo.valor_proprio = patch.valorProprio
          novo.valor_terceiros = Math.max(0, l.valor - patch.valorProprio)
        }
        if (patch.aplicarAfetaResultado && patch.afetaResultado !== undefined) {
          novo.afeta_resultado = patch.afetaResultado
        }
        if (patch.aplicarAfetaOrcamento && patch.afetaOrcamento !== undefined) {
          novo.afeta_orcamento = patch.afetaOrcamento
        }
        if (patch.aplicarObservacao && patch.observacao !== undefined) {
          novo.observacao = patch.observacao
        }
        if (patch.marcarIgnorado) {
          novo.status = 'ignorado'
          novo.selecionado = false
        } else if (novo.status === 'requer_revisao' && novo.categoria_id) {
          novo.status = 'pronto'
        }

        return novo
      }),
    )

    if (Object.keys(alteracoesDb).length > 0) {
      await faturaImportacaoService.atualizarLinhasEmMassa(selecionados, alteracoesDb)
    }

    toast.success(`Edição aplicada a ${selecionados.length} itens selecionados.`)
  }

  // Efetivação dos selecionados pelo fluxo normal do SAP
  const handleImportarConfirmados = async () => {
    if (!wsId || !sessaoAtual || !user) return

    setImportandoFinal(true)
    startProcessing('Efetivando lançamentos pelo fluxo normal do SAP...')

    try {
      const resultado = await faturaImportacaoService.efetivarImportacao({
        workspaceId: wsId,
        importacaoId: sessaoAtual.id,
        cartaoId: sessaoAtual.cartao_id,
        linhas,
        userId: user.id,
      })

      if (resultado.sucesso) {
        toast.success(
          `Importação concluída com sucesso! ${resultado.importados} lançamentos criados no SAP.`,
        )
        setSalvouContinuarDepois(true)
        navigate('/cartoes')
      } else {
        toast.warning(
          `${resultado.importados} lançamentos criados. Alguns itens tiveram erro:\n` +
            resultado.erros.slice(0, 3).join('\n'),
        )
      }
    } catch (e: any) {
      toast.error('Erro na efetivação: ' + e.message)
    } finally {
      stopProcessing()
      setImportandoFinal(false)
    }
  }

  // Guarda de saída
  const temLancamentosNaoImportados =
    !!sessaoAtual &&
    linhas.some((l) => l.selecionado && l.status !== 'importado') &&
    !salvouContinuarDepois

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (temLancamentosNaoImportados) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [temLancamentosNaoImportados])

  const solicitarNavegacao = (caminho: string) => {
    if (temLancamentosNaoImportados) {
      setCaminhoNavegacaoPendente(caminho)
      setModalDescarteAberto(true)
    } else {
      navigate(caminho)
    }
  }

  const handleSalvarEContinuarDepois = async () => {
    if (!wsId || !sessaoAtual) return
    try {
      setSalvouContinuarDepois(true)
      toast.success(
        'Progresso da fatura salvo! Ela continuará listada em "Faturas em processamento".',
      )
      navigate('/cartoes')
    } catch (err: any) {
      toast.error('Erro ao salvar progresso: ' + err.message)
    }
  }

  const handleConfirmarDescarteENavegar = async () => {
    if (!wsId || !sessaoAtual) {
      setModalDescarteAberto(false)
      if (caminhoNavegacaoPendente) navigate(caminhoNavegacaoPendente)
      return
    }

    try {
      await faturaImportacaoService.descartarSessao(sessaoAtual.id, wsId)
      setModalDescarteAberto(false)
      setSessaoAtual(null)
      setLinhas([])
      toast.info('Sessão em processamento descartada.')
      if (caminhoNavegacaoPendente) navigate(caminhoNavegacaoPendente)
    } catch (err: any) {
      toast.error('Erro ao descartar sessão: ' + err.message)
    }
  }

  const handleAbrirFaturasEmProcessamento = async () => {
    if (!wsId) return
    setCarregandoFaturasProcessamento(true)
    setModalFaturasProcessamentoAberto(true)
    try {
      const lista = await faturaImportacaoService.listarSessoesEmProcessamento(wsId)
      setFaturasEmProcessamento(lista)
    } catch (err: any) {
      toast.error('Erro ao carregar faturas em processamento: ' + err.message)
    } finally {
      setCarregandoFaturasProcessamento(false)
    }
  }

  const handleContinuarFaturaEmProcessamento = async (importacaoId: string) => {
    if (!wsId) return
    try {
      startProcessing('Carregando fatura em processamento...')
      const sessao = await faturaImportacaoService.obterSessao(wsId, importacaoId)
      setSessaoAtual(sessao.importacao)
      setLinhas(sessao.linhas)
      setCartaoSelecionadoId(sessao.importacao.cartao_id)
      setOrigemTipoAtual(
        sessao.importacao.arquivo_nome?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'imagem',
      )
      setModalFaturasProcessamentoAberto(false)
      toast.info(`Fatura ${sessao.importacao.arquivo_nome} carregada para revisão.`)
    } catch (err: any) {
      toast.error('Erro ao carregar sessão: ' + err.message)
    } finally {
      stopProcessing()
    }
  }

  const handleDescartarFaturaEmProcessamento = async (importacaoId: string) => {
    if (!wsId) return
    try {
      await faturaImportacaoService.descartarSessao(importacaoId, wsId)
      setFaturasEmProcessamento((prev) => prev.filter((f) => f.id !== importacaoId))
      toast.success('Fatura em processamento descartada.')
    } catch (err: any) {
      toast.error('Erro ao descartar: ' + err.message)
    }
  }

  // Listas de titulares e finais para filtros
  const listaTitulares = Array.from(
    new Set(linhas.map((l) => l.titular).filter((t): t is string => !!t)),
  )
  const listaFinais = Array.from(
    new Set(linhas.map((l) => l.final_cartao).filter((f): f is string => !!f)),
  )

  // Filtragem das linhas da fatura
  const linhasFiltradas = linhas.filter((l) => {
    let passaTipo = true
    if (filtroAtivo === 'todos') passaTipo = true
    else if (filtroAtivo === 'nao_classificados') passaTipo = !l.categoria_id
    else if (filtroAtivo === 'prontos')
      passaTipo = l.status === 'pronto' || l.status === 'preenchido_regra'
    else if (filtroAtivo === 'compras') passaTipo = l.tipo_linha === 'compra_a_vista'
    else if (filtroAtivo === 'parcelados') passaTipo = l.tipo_linha === 'compra_parcelada'
    else if (filtroAtivo === 'creditos') passaTipo = l.tipo_linha === 'credito'
    else if (filtroAtivo === 'encargos') passaTipo = l.tipo_linha === 'encargo'
    else if (filtroAtivo === 'revisar')
      passaTipo =
        l.status === 'requer_revisao' || l.status === 'provavel_duplicado' || !l.categoria_id
    else if (filtroAtivo === 'conciliados') passaTipo = l.status === 'conciliado'
    else if (filtroAtivo === 'duplicados')
      passaTipo = l.status === 'provavel_duplicado' || l.status === 'duplicado'
    else if (filtroAtivo === 'ignorados') passaTipo = l.status === 'ignorado'

    if (!passaTipo) return false

    if (filtroTitular !== 'todos' && l.titular !== filtroTitular) return false
    if (filtroFinal !== 'todos' && l.final_cartao !== filtroFinal) return false

    if (buscaTexto.trim()) {
      const q = buscaTexto.toLowerCase()
      const matchDesc = (l.descricao_editavel || '').toLowerCase().includes(q)
      const matchOrig = (l.descricao_original || '').toLowerCase().includes(q)
      const matchTit = (l.titular || '').toLowerCase().includes(q)
      if (!matchDesc && !matchOrig && !matchTit) return false
    }

    return true
  })

  // Totais da conferência visual
  const totalFatura = sessaoAtual?.valor_total_fatura || 0
  const somaComprasEncargos = linhas
    .filter((l) => l.tipo_linha !== 'credito' && l.status !== 'ignorado')
    .reduce((acc, l) => acc + l.valor, 0)
  const somaCreditos = linhas
    .filter((l) => l.tipo_linha === 'credito' && l.status !== 'ignorado')
    .reduce((acc, l) => acc + l.valor, 0)
  const diferencaConferencia = Math.abs(totalFatura - (somaComprasEncargos - somaCreditos))
  const conferenciaOk = totalFatura > 0 ? diferencaConferencia < 0.05 : false

  const totalSelecionados = linhas.filter((l) => l.selecionado).length
  const totalProntos = linhas.filter(
    (l) => (l.status === 'pronto' || l.status === 'preenchido_regra') && l.selecionado,
  ).length

  return (
    <div className="space-y-6 pb-12 max-w-6xl mx-auto px-4 text-slate-900">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-600" />
            Importar Fatura
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Extração, normalização e conciliação de faturas com revisão manual completa.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {!sessaoAtual && (
            <Button
              variant="outline"
              onClick={handleAbrirFaturasEmProcessamento}
              className="border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-xs flex items-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5" />
              Visualizar faturas em processamento
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => solicitarNavegacao('/cartoes')}
            className="border-slate-200 text-slate-700 hover:bg-slate-100 text-xs"
          >
            Voltar para Cartões
          </Button>
        </div>
      </div>

      {/* Inputs invisíveis para acionamento nativo */}
      <input
        ref={fileInputPdfRef}
        type="file"
        accept="application/pdf"
        onChange={handleSelecionarArquivoPdf}
        className="hidden"
      />
      <input
        ref={fileInputImagemRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => e.target.files && adicionarArquivosImagem(e.target.files)}
        className="hidden"
      />
      <input
        ref={fileInputCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => e.target.files && adicionarArquivosImagem(e.target.files)}
        className="hidden"
      />

      {/* BLOCO DE ENTRADA / UPLOAD (se nenhuma sessão carregada) */}
      {!sessaoAtual ? (
        <Card className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-6">
          {avisoHashReimportacao && (
            <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{avisoHashReimportacao}</span>
            </div>
          )}

          {/* 1. Seleção do Cartão */}
          <div className="space-y-2 max-w-xl">
            <Label className="text-slate-700 text-xs font-semibold">
              1. Selecione o cartão cadastrado no SAP *
            </Label>
            {erroCargaCartoes ? (
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
                <p className="text-xs text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Não foi possível carregar os cartões.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={tentarNovamenteCargas}
                  className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  <RefreshCw className="w-3 h-3 mr-1" /> Tentar novamente
                </Button>
              </div>
            ) : cartoes.length === 0 ? (
              <div className="border border-slate-200 bg-slate-50 rounded-lg p-3 space-y-2">
                <p className="text-xs text-slate-600 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Nenhum cartão cadastrado — cadastre em Meus
                  Cartões.
                </p>
                <Link
                  to="/cartoes"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  Ir para Meus Cartões <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              <Select value={cartaoSelecionadoId} onValueChange={handleSelecionarCartao}>
                <SelectTrigger className="bg-white border-slate-200 text-slate-900">
                  <SelectValue placeholder="Selecione o cartão..." />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900">
                  {cartoes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} (fechamento dia {c.dia_fechamento}, vencimento dia {c.dia_vencimento}
                      )
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-[11px] text-slate-500">
              Todos os adicionais, titulares e finais serão consolidados neste único cartão.
            </p>
          </div>

          {/* 2. Formas de Entrada (Capturar lançamentos) */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div>
              <Label className="text-slate-800 text-sm font-semibold block">
                2. Como deseja capturar os lançamentos?
              </Label>
              <p className="text-xs text-slate-500 mt-0.5">
                Escolha o método mais prático. Você também pode colar prints com{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono text-slate-700">
                  Ctrl+V
                </kbd>{' '}
                a qualquer momento nesta tela ou arrastar arquivos.
              </p>
            </div>

            {/* Zona com os 4 botões de entrada */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`p-5 rounded-xl border-2 border-dashed transition-colors ${
                arrastandoSobre
                  ? 'border-emerald-500 bg-emerald-50/60'
                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <div className="space-y-4">
                {/* Método recomendado: [Colar Print] [Abrir Câmera] */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 block">
                    Método recomendado
                  </span>
                  <div className="flex flex-wrap gap-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        toast.info(
                          'Pressione Ctrl+V no teclado para colar o print copiado da área de transferência.',
                        )
                      }}
                      className="bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-xs h-9 gap-2 shadow-sm font-medium"
                    >
                      <ClipboardPaste className="w-4 h-4 text-emerald-600" />
                      Colar Print (Ctrl+V)
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputCameraRef.current?.click()}
                      className="bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-xs h-9 gap-2 shadow-sm font-medium"
                    >
                      <Camera className="w-4 h-4 text-emerald-600" />
                      Abrir Câmera
                    </Button>
                  </div>
                </div>

                {/* Outras formas: [Selecionar Imagem] [Importar PDF] */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                    Outras formas
                  </span>
                  <div className="flex flex-wrap gap-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputImagemRef.current?.click()}
                      className="bg-white border-slate-300 text-slate-700 hover:bg-slate-100 text-xs h-9 gap-2"
                    >
                      <ImageIcon className="w-4 h-4 text-slate-500" />
                      Selecionar Imagem
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputPdfRef.current?.click()}
                      className="bg-white border-slate-300 text-slate-700 hover:bg-slate-100 text-xs h-9 gap-2"
                    >
                      <FileText className="w-4 h-4 text-slate-500" />
                      Importar PDF
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Visualização de Seleção de PDF */}
            {metodoEntrada === 'pdf' && arquivoSelecionado && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div>
                    <span className="font-semibold text-emerald-900 block">
                      {arquivoSelecionado.name}
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      PDF pronto para leitura ({Math.round(arquivoSelecionado.size / 1024)} KB)
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setArquivoSelecionado(null)
                    setArquivoBuffer(null)
                  }}
                  className="h-7 text-xs text-slate-500 hover:text-red-600"
                >
                  Remover
                </Button>
              </div>
            )}

            {/* Múltiplas imagens (Lista: Imagem 1..N com visualizar, excluir, reordenar) */}
            {metodoEntrada === 'imagem' && imagensCapturadas.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Capturas adicionadas ({imagensCapturadas.length}):
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputImagemRef.current?.click()}
                      className="h-7 text-xs border-slate-200 text-slate-700 hover:bg-slate-100 gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar imagem
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputCameraRef.current?.click()}
                      className="h-7 text-xs border-slate-200 text-slate-700 hover:bg-slate-100 gap-1"
                    >
                      <Camera className="w-3.5 h-3.5" /> Tirar foto
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {imagensCapturadas.map((img, idx) => (
                    <div
                      key={img.id}
                      className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={img.previewUrl}
                          alt={img.nome}
                          className="w-10 h-10 object-cover rounded border border-slate-200 shrink-0 cursor-pointer"
                          onClick={() => setImagemPreviewAberto(img.previewUrl)}
                          title="Clique para ampliar"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-800 block truncate">
                            Imagem {idx + 1}: {img.nome}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {Math.round(img.file.size / 1024)} KB
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setImagemPreviewAberto(img.previewUrl)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800"
                          title="Visualizar"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={idx === 0}
                          onClick={() => handleMoverImagem(idx, -1)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800 disabled:opacity-30"
                          title="Mover para cima"
                        >
                          <MoveUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={idx === imagensCapturadas.length - 1}
                          onClick={() => handleMoverImagem(idx, 1)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800 disabled:opacity-30"
                          title="Mover para baixo"
                        >
                          <MoveDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoverImagem(img.id)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-red-600"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-500">
                  Dica: Para faturas longas, adicione os prints em sequência. Áreas de sobreposição
                  entre capturas consecutivas serão automaticamente detectadas para evitar
                  duplicidades.
                </p>
              </div>
            )}

            {/* Modal simples de visualização da imagem ampliada */}
            {imagemPreviewAberto && (
              <div
                className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                onClick={() => setImagemPreviewAberto(null)}
              >
                <div
                  className="bg-white rounded-xl p-2 max-w-3xl max-h-[85vh] overflow-auto shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center p-2 border-b border-slate-100">
                    <span className="text-xs font-semibold text-slate-800">Visualizar Captura</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setImagemPreviewAberto(null)}
                      className="h-6 text-xs text-slate-500 hover:text-slate-800"
                    >
                      Fechar
                    </Button>
                  </div>
                  <img
                    src={imagemPreviewAberto}
                    alt="Preview"
                    className="max-h-[75vh] w-auto mx-auto object-contain p-2"
                  />
                </div>
              </div>
            )}

            {/* Aviso sobre OCR em andamento */}
            {progressoOcr.ativo && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2.5 text-xs text-emerald-800">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
                <span>{progressoOcr.mensagem}</span>
              </div>
            )}
          </div>

          {/* Botões de Ação Final do Upload */}
          <div className="pt-4 border-t border-slate-200 flex flex-wrap justify-between items-center gap-3">
            {!cartaoSelecionadoId ? (
              <p className="text-xs text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Selecione o cartão para habilitar o
                processamento.
              </p>
            ) : metodoEntrada === 'imagem' && imagensCapturadas.length === 0 ? (
              <p className="text-xs text-slate-500">
                Cole um print (Ctrl+V), abra a câmera ou selecione uma imagem para processar.
              </p>
            ) : metodoEntrada === 'pdf' && !arquivoBuffer ? (
              <p className="text-xs text-slate-500">
                Selecione um arquivo PDF para prosseguir com a leitura.
              </p>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2 ml-auto">
              {processandoLeitura && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelarProcessamento}
                  className="border-slate-300 text-slate-700 hover:bg-slate-100 text-xs px-4 py-2.5"
                >
                  Cancelar
                </Button>
              )}

              {metodoEntrada === 'imagem' ? (
                <Button
                  onClick={handleProcessarImagens}
                  disabled={
                    imagensCapturadas.length === 0 || !cartaoSelecionadoId || processandoLeitura
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-6 py-2.5 flex items-center gap-2 shadow-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  {processandoLeitura
                    ? 'Reconhecendo lançamentos...'
                    : `Processar ${imagensCapturadas.length} Imagem(ns)`}
                </Button>
              ) : (
                <Button
                  onClick={() => handleIniciarProcessamentoPdf()}
                  disabled={!arquivoBuffer || !cartaoSelecionadoId || processandoLeitura}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-6 py-2.5 flex items-center gap-2 shadow-sm"
                >
                  <Upload className="w-4 h-4" />
                  {processandoLeitura ? 'Processando PDF...' : 'Ler e Processar PDF'}
                </Button>
              )}
            </div>
          </div>
        </Card>
      ) : (
        /* ÁREA DE REVISÃO E CONFERÊNCIA (MESMA tela para Imagem e PDF) */
        <div className="space-y-6">
          {/* Card Resumo do Cabeçalho e Reconciliação Visual */}
          <Card className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  Fatura em Revisão
                </span>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  {sessaoAtual.emissor_detectado?.toUpperCase()} • {sessaoAtual.arquivo_nome}
                </h3>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                  <span>
                    Origem:{' '}
                    <strong className="text-slate-700">
                      {origemTipoAtual === 'imagem' ? 'Captura por Imagem (OCR)' : 'PDF'}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Vencimento:{' '}
                    <strong className="text-slate-700">
                      {sessaoAtual.data_vencimento?.split('-').reverse().join('/') || 'N/D'}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Itens: <strong className="text-slate-700">{linhas.length}</strong>
                  </span>
                </div>
              </div>

              {/* Box de Conferência da Fatura */}
              <div
                className={`p-3 rounded-lg border text-xs flex flex-col gap-1 min-w-[260px] ${
                  capturaParcialImagem && totalFatura === 0
                    ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                    : conferenciaOk
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {capturaParcialImagem && totalFatura === 0 ? (
                  <>
                    <div className="font-semibold flex items-center gap-1.5 text-blue-900">
                      <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Captura parcial por imagem</span>
                    </div>
                    <p className="text-[11px] text-blue-800 leading-tight">
                      Captura parcial: conferência com o total integral da fatura não disponível.
                    </p>
                    <div className="flex justify-between items-center text-[11px] pt-1 border-t border-blue-200">
                      <span>Somatório capturado:</span>
                      <span className="font-mono font-semibold">
                        {formatMoneyBRL(somaComprasEncargos - somaCreditos)}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center font-semibold">
                      <span>Valor Declarado (Fatura):</span>
                      <span className="font-mono">{formatMoneyBRL(totalFatura)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-600">
                      <span>(+) Compras/Encargos:</span>
                      <span className="font-mono">{formatMoneyBRL(somaComprasEncargos)}</span>
                    </div>
                    {somaCreditos > 0 && (
                      <div className="flex justify-between items-center text-[11px] text-slate-600">
                        <span>(-) Créditos/Estornos:</span>
                        <span className="font-mono">-{formatMoneyBRL(somaCreditos)}</span>
                      </div>
                    )}
                    {totalFatura > 0 && !conferenciaOk && (
                      <div className="flex justify-between items-center text-[11px] text-amber-700">
                        <span>Diferença apurada:</span>
                        <span className="font-mono">{formatMoneyBRL(diferencaConferencia)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center font-bold pt-1 border-t border-slate-200">
                      <span>Status da Conferência:</span>
                      <span>{conferenciaOk ? '✓ Conferido' : 'Diferença a revisar'}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Barra de Filtros e Ações Rápidas */}
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {[
                    { id: 'todos', label: 'Todos' },
                    { id: 'nao_classificados', label: 'Não classificados' },
                    { id: 'prontos', label: 'Prontos' },
                    { id: 'compras', label: 'Compras à vista' },
                    { id: 'parcelados', label: 'Parcelados' },
                    { id: 'creditos', label: 'Estornos/Créditos' },
                    { id: 'encargos', label: 'Encargos' },
                    { id: 'revisar', label: 'Requer Revisão' },
                    { id: 'conciliados', label: 'Conciliados' },
                    { id: 'duplicados', label: 'Prováveis Duplicados' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFiltroAtivo(f.id)}
                      className={`px-2.5 py-1 rounded text-xs transition-colors ${
                        filtroAtivo === f.id
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSelecionarTodosVisiveis(true)}
                    className="border-slate-200 text-slate-700 hover:bg-slate-100 text-xs h-8"
                  >
                    <CheckSquare className="w-3.5 h-3.5 mr-1" /> Marcar Visíveis
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSelecionarTodosVisiveis(false)}
                    className="border-slate-200 text-slate-700 hover:bg-slate-100 text-xs h-8"
                  >
                    <Square className="w-3.5 h-3.5 mr-1" /> Desmarcar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleConfirmarTodasCompraPropria}
                    className="border-slate-200 text-slate-700 hover:bg-slate-100 text-xs h-8"
                    title="Define Modalidade como Compra Própria 100% para os itens visíveis"
                  >
                    Definir Compra Própria
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setModalMassaAberto(true)}
                    disabled={totalSelecionados === 0}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs h-8"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Edição em Massa (
                    {totalSelecionados})
                  </Button>
                </div>
              </div>

              {/* Filtros secundários: Busca, Titular e Final */}
              <div className="flex flex-wrap items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <Input
                    placeholder="Filtrar por estabelecimento ou descrição..."
                    value={buscaTexto}
                    onChange={(e) => setBuscaTexto(e.target.value)}
                    className="bg-white border-slate-200 text-slate-900 h-7 text-xs"
                  />
                </div>

                {listaTitulares.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 text-[11px]">Titular:</span>
                    <select
                      value={filtroTitular}
                      onChange={(e) => setFiltroTitular(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-900 rounded px-2 py-1 text-xs"
                    >
                      <option value="todos">Todos ({listaTitulares.length})</option>
                      {listaTitulares.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {listaFinais.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 text-[11px]">Final:</span>
                    <select
                      value={filtroFinal}
                      onChange={(e) => setFiltroFinal(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-900 rounded px-2 py-1 text-xs"
                    >
                      <option value="todos">Todos ({listaFinais.length})</option>
                      {listaFinais.map((f) => (
                        <option key={f} value={f}>
                          •••• {f}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* C5 — Diagnóstico Unificado: Ver extração & Diagnóstico */}
          <PainelTextoExtraido
            extraction={extracaoAtual}
            parsed={parsedAtual}
            origemTipo={origemTipoAtual}
            diagnosticosImagem={diagnosticosImagem}
          />

          {/* Lista de Linhas Temporárias */}
          <div className="space-y-2">
            {linhasFiltradas.length === 0 ? (
              <div className="text-center py-12 bg-white border border-slate-200 rounded-xl text-slate-500 text-xs">
                Nenhuma linha encontrada para este filtro.
              </div>
            ) : (
              linhasFiltradas.map((linha) => (
                <LinhaRevisaoFaturaItem
                  key={linha.id}
                  linha={linha}
                  categorias={categorias}
                  subcategorias={subcategorias}
                  aoAlterar={handleAlterarLinha}
                  aoAlternarSelecao={handleAlternarSelecao}
                />
              ))
            )}
          </div>

          {/* Rodapé Fixo de Ação */}
          <div className="sticky bottom-4 bg-white/95 backdrop-blur border border-slate-200 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-lg">
            <div className="text-xs text-slate-600">
              <strong className="text-slate-900">{totalSelecionados}</strong> selecionados para
              importação (<strong className="text-emerald-600">{totalProntos}</strong> prontos).
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleSalvarEContinuarDepois}
                className="border-slate-200 text-slate-700 hover:bg-slate-100 text-xs"
              >
                Salvar e Continuar Depois
              </Button>

              <Button
                onClick={handleImportarConfirmados}
                disabled={totalSelecionados === 0 || importandoFinal}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-6 py-2.5 flex items-center gap-2"
              >
                <span>Importar Selecionados ({totalSelecionados})</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modais existentes preservados */}
      <ModalEdicaoEmMassaFatura
        aberto={modalMassaAberto}
        totalSelecionados={totalSelecionados}
        categorias={categorias}
        subcategorias={subcategorias}
        cartoes={cartoes}
        aoFechar={() => setModalMassaAberto(false)}
        aoAplicar={handleAplicarEdicaoEmMassa}
      />

      <ModalSenhaPdf
        aberto={modalSenhaAberto}
        erroMensagem={erroSenha}
        aoConfirmar={(senha) => handleIniciarProcessamentoPdf(senha)}
        aoFechar={handleCancelarProcessamento}
      />

      <ModalSessaoExistenteCartao
        aberto={modalSessaoCartaoAberto}
        sessaoExistente={sessaoExistenteCartao}
        aoFechar={() => setModalSessaoCartaoAberto(false)}
        aoVisualizarExistente={handleVisualizarSessaoExistente}
        aoImportarNova={handleEscolherImportarNova}
      />

      <ModalDescarteNavegacao
        aberto={modalDescarteAberto}
        onCancelar={() => setModalDescarteAberto(false)}
        aoSalvarEContinuar={handleSalvarEContinuarDepois}
        aoDescartar={handleConfirmarDescarteENavegar}
      />

      <ModalVisualizarFaturasEmProcessamento
        aberto={modalFaturasProcessamentoAberto}
        faturas={faturasEmProcessamento}
        cartoes={cartoes}
        carregando={carregandoFaturasProcessamento}
        aoFechar={() => setModalFaturasProcessamentoAberto(false)}
        aoRetomarSessao={handleContinuarFaturaEmProcessamento}
        aoDescartarSessao={handleDescartarFaturaEmProcessamento}
      />
    </div>
  )
}
