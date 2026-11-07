import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useGlobalLoading } from '@/contexts/LoadingContext'
import { cartaoService, categoriaService } from '@/services/sap'
import { Input } from '@/components/ui/input'
import {
  faturaImportacaoService,
  FaturaImportacaoRegistro,
  FaturaImportacaoLinhaRegistro,
} from '@/services/faturaImportacaoService'
import {
  extrairTextoPdf,
  calcularHashArquivo,
  PasswordRequiredError,
  InvalidPasswordError,
  PdfExtractionOutput,
} from '@/services/pdf/pdfReader'
import { executarParserFatura } from '@/services/pdf/faturaParserRouter'
import { ModalSenhaPdf } from '@/components/ModalSenhaPdf'
import { ModalEdicaoEmMassaFatura } from '@/components/ModalEdicaoEmMassaFatura'
import { ModalSessaoExistenteCartao } from '@/components/ModalSessaoExistenteCartao'
import { ModalDescarteNavegacao } from '@/components/ModalDescarteNavegacao'
import { ModalVisualizarFaturasEmProcessamento } from '@/components/ModalVisualizarFaturasEmProcessamento'
import { LinhaRevisaoFaturaItem } from '@/components/LinhaRevisaoFaturaItem'
import { PainelTextoExtraido } from '@/components/PainelTextoExtraido'
import { ParserResult } from '@/types/faturaPdf'
import { Cartao, Categoria, Subcategoria } from '@/types/sap'
import { formatMoneyBRL } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Filter,
  CheckSquare,
  Square,
  Sparkles,
  RefreshCw,
  CreditCard,
  Clock,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'

export const ImportarFaturaPage: React.FC = () => {
  const { currentWorkspace, user } = useAuth()
  const { startProcessing, stopProcessing } = useGlobalLoading()
  const navigate = useNavigate()

  // Estados principais
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [cartaoSelecionadoId, setCartaoSelecionadoId] = useState<string>('')
  const [erroCargaCartoes, setErroCargaCartoes] = useState<string | null>(null)
  const [erroCargaCategorias, setErroCargaCategorias] = useState<string | null>(null)

  // Upload & Leitura
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null)
  const [arquivoBuffer, setArquivoBuffer] = useState<ArrayBuffer | null>(null)
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false)
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [processandoLeitura, setProcessandoLeitura] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Sessão de Revisão
  const [sessaoAtual, setSessaoAtual] = useState<FaturaImportacaoRegistro | null>(null)
  const [linhas, setLinhas] = useState<FaturaImportacaoLinhaRegistro[]>([])
  const [filtroAtivo, setFiltroAtivo] = useState<string>('todos')
  const [modalMassaAberto, setModalMassaAberto] = useState(false)
  const [importandoFinal, setImportandoFinal] = useState(false)
  // C4 — Painel "Ver texto extraído" (ferramenta de homologação)
  const [extracaoAtual, setExtracaoAtual] = useState<PdfExtractionOutput | null>(null)
  const [parsedAtual, setParsedAtual] = useState<ParserResult | null>(null)

  // Estados C2, C3, C4, C5 (Ciclo de Vida)
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

  // CORREÇÃO 1 (causa raiz): currentWorkspace é a membership — o id do workspace real
  // está em workspace_id (mesmo padrão usado por Cartões/Lançamentos).
  const wsId = currentWorkspace?.workspace_id

  // Carrega cartões e categorias do workspace em chamadas INDEPENDENTES:
  // uma falha em categorias não pode zerar a lista de cartões.
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

  // Regra C3: Ao selecionar um cartão, verificar se ele já tem sessão ativa em processamento
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

  // Ação C3: Usuário escolhe visualizar a fatura em processamento existente do cartão
  const handleVisualizarSessaoExistente = async () => {
    if (!wsId || !sessaoExistenteCartao) return
    try {
      startProcessing('Carregando fatura em processamento...')
      const sessao = await faturaImportacaoService.obterSessao(wsId, sessaoExistenteCartao.id)
      setSessaoAtual(sessao.importacao)
      setLinhas(sessao.linhas)
      setModalSessaoCartaoAberto(false)
      toast.info('Fatura em processamento carregada para revisão.')
    } catch (err: any) {
      toast.error('Não foi possível carregar a fatura em processamento: ' + err.message)
    } finally {
      stopProcessing()
    }
  }

  // Ação C3: Usuário escolhe importar nova fatura (a nova prevalecerá, descartando a anterior)
  const handleEscolherImportarNova = () => {
    setModalSessaoCartaoAberto(false)
    // Mantém o cartão selecionado pronto para upload e novo processamento
    toast.info('Pronto para importar nova fatura. A nova fatura prevalecerá.')
  }

  // Trata seleção de arquivo
  const handleSelecionarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Por favor, selecione um arquivo em formato PDF.')
      return
    }

    setAvisoHashReimportacao(null)
    setArquivoSelecionado(file)
    const buffer = await file.arrayBuffer()
    setArquivoBuffer(buffer)
  }

  // Inicia processamento do PDF (Regras C1, C2 e C6)
  const handleIniciarProcessamento = async (senhaFornecida?: string) => {
    if (!arquivoBuffer || !arquivoSelecionado || !wsId || !cartaoSelecionadoId) {
      toast.error(
        !wsId || !cartaoSelecionadoId
          ? 'Selecione um cartão cadastrado antes de continuar.'
          : 'Selecione um arquivo PDF antes de continuar.',
      )
      return
    }

    // Cancela requisição anterior se houver
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const ac = new AbortController()
    abortControllerRef.current = ac

    setProcessandoLeitura(true)
    startProcessing('Lendo e extraindo transações do PDF...')
    setErroSenha(null)

    try {
      // 1. Calcular hash do arquivo (mantido como METADADO/auditoria, nunca bloqueante - Regra C1)
      const hash = await calcularHashArquivo(arquivoBuffer)

      const existente = await faturaImportacaoService.verificarHashExistente(wsId, hash)
      if (existente) {
        const dataFmt = new Date(existente.created_at).toLocaleDateString('pt-BR')
        const aviso = `Este PDF já foi importado em ${dataFmt} — a nova fatura prevalece.`
        setAvisoHashReimportacao(aviso)
        toast.info(aviso)
      }

      // 2. Extrair texto com pdf.js (suportando senha e bloqueio) com cópia segura de buffer
      // REGRA C6: Se foi passada senha mas o arquivo for na verdade desprotegido,
      // extrairTextoPdf lida graciosamente.
      let extraction
      try {
        extraction = await extrairTextoPdf(arquivoBuffer, senhaFornecida, ac.signal)
      } catch (tentativaErr: any) {
        // Se falhou com senha fornecida em um PDF que talvez não seja criptografado com senha padrão
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

      // Se precisava de senha e deu certo, fecha o modal
      if (modalSenhaAberto) {
        setModalSenhaAberto(false)
      }

      // 3. Determinar se o cartão selecionado induz um emissor específico
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

      // Executar o parser pelo emissor do cartão ou detectado no texto
      const allLines = extraction.pages.flatMap((p) => p.lines)
      const parsed = executarParserFatura(extraction.fullText, allLines, emissorForcadoPorCartao)

      // 4. Criar sessão e linhas temporárias (Regra C2: descarta sessão em_revisao anterior do cartão)
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
        // REGRA C6: Erro orientado específico sem engolir detalhes
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
  }
  // Alteração de linha individual
  const handleAlterarLinha = async (
    linhaId: string,
    dados: Partial<FaturaImportacaoLinhaRegistro>,
  ) => {
    setLinhas((prev) => prev.map((l) => (l.id === linhaId ? { ...l, ...dados } : l)))
    await faturaImportacaoService.atualizarLinha(linhaId, dados)
  }

  // Alternar seleção
  const handleAlternarSelecao = async (linhaId: string, selecionado: boolean) => {
    setLinhas((prev) => prev.map((l) => (l.id === linhaId ? { ...l, selecionado } : l)))
    await faturaImportacaoService.atualizarLinha(linhaId, { selecionado })
  }

  // Selecionar todos / desmarcar todos do filtro
  const handleSelecionarTodosVisiveis = async (selecionar: boolean) => {
    const idsVisiveis = linhasFiltradas.map((l) => l.id)
    setLinhas((prev) =>
      prev.map((l) => (idsVisiveis.includes(l.id) ? { ...l, selecionado: selecionar } : l)),
    )
    await faturaImportacaoService.atualizarLinhasEmMassa(idsVisiveis, { selecionado: selecionar })
  }

  // Ação Rápida: Confirmar todos como Compra Própria
  const handleConfirmarTodasCompraPropria = async () => {
    const ids = linhasFiltradas.filter((l) => l.status !== 'ignorado').map((l) => l.id)
    if (ids.length === 0) return
    setLinhas((prev) =>
      prev.map((l) =>
        ids.includes(l.id)
          ? {
              ...l,
              modalidade_saida: 'compra_propria',
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

  // Aplicação da edição em massa
  const handleAplicarEdicaoEmMassa = async (config: {
    categoriaId?: string
    subcategoriaId?: string
    modalidadeSaida?: string
    afetaResultado?: boolean
    afetaOrcamento?: boolean
    marcarIgnorado?: boolean
  }) => {
    const selecionados = linhas.filter((l) => l.selecionado).map((l) => l.id)
    if (selecionados.length === 0) return

    const alteracoes: any = {}
    if (config.categoriaId) alteracoes.categoria_id = config.categoriaId
    if (config.subcategoriaId) alteracoes.subcategoria_id = config.subcategoriaId
    if (config.modalidadeSaida) {
      alteracoes.modalidade_saida = config.modalidadeSaida
      if (config.modalidadeSaida === 'compra_propria') {
        // atualiza proporções para próprio = total, terceiros = 0
      }
    }
    if (config.afetaResultado !== undefined) alteracoes.afeta_resultado = config.afetaResultado
    if (config.afetaOrcamento !== undefined) alteracoes.afeta_orcamento = config.afetaOrcamento
    if (config.marcarIgnorado) {
      alteracoes.status = 'ignorado'
      alteracoes.selecionado = false
    } else {
      alteracoes.status = 'pronto'
    }

    setLinhas((prev) =>
      prev.map((l) => {
        if (!selecionados.includes(l.id)) return l
        const novo = { ...l, ...alteracoes }
        if (config.modalidadeSaida === 'compra_propria') {
          novo.valor_proprio = l.valor
          novo.valor_terceiros = 0
        }
        return novo
      }),
    )

    await faturaImportacaoService.atualizarLinhasEmMassa(selecionados, alteracoes)
    toast.success(`Edição aplicada a ${selecionados.length} itens.`)
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

  // Regra C4: Guarda de saída da tela quando há fatura processada com lançamentos não importados
  const temLancamentosNaoImportados =
    !!sessaoAtual &&
    linhas.some((l) => l.selecionado && l.status !== 'importado') &&
    !salvouContinuarDepois

  // Interceptador beforeunload do navegador
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

  // Tentativa de navegação interna interceptada
  const solicitarNavegacao = (caminho: string) => {
    if (temLancamentosNaoImportados) {
      setCaminhoNavegacaoPendente(caminho)
      setModalDescarteAberto(true)
    } else {
      navigate(caminho)
    }
  }

  // Ação de Salvar e Continuar Depois do modal de saída ou do botão fixo
  const handleSalvarEContinuarDepois = () => {
    setSalvouContinuarDepois(true)
    setModalDescarteAberto(false)
    toast.info('Fatura salva para continuar depois. Os lançamentos pendentes foram preservados.')
    navigate(caminhoNavegacaoPendente || '/cartoes')
  }

  // Ação de Descartar do modal de saída
  const handleConfirmarDescarteSessao = async () => {
    if (sessaoAtual && wsId) {
      try {
        await faturaImportacaoService.descartarSessao(wsId, sessaoAtual.id)
        toast.info('Fatura processada foi descartada. Nenhum lançamento foi criado no SAP.')
      } catch (err: any) {
        console.warn('Erro ao marcar descarte:', err)
      }
    }
    setModalDescarteAberto(false)
    setSessaoAtual(null)
    setLinhas([])
    setExtracaoAtual(null)
    setParsedAtual(null)
    setArquivoSelecionado(null)
    setArquivoBuffer(null)
    navigate(caminhoNavegacaoPendente || '/cartoes')
  }

  // Regra C5: Abertura e manipulação do modal "Visualizar faturas em processamento"
  const handleAbrirFaturasEmProcessamento = async () => {
    if (!wsId) return
    setCarregandoFaturasProcessamento(true)
    setModalFaturasProcessamentoAberto(true)
    try {
      const ativas = await faturaImportacaoService.listarSessoesEmProcessamento(wsId)
      setFaturasEmProcessamento(ativas)
    } catch (err: any) {
      toast.error('Erro ao listar faturas em processamento: ' + err.message)
    } finally {
      setCarregandoFaturasProcessamento(false)
    }
  }

  const handleRetomarSessao = async (sessaoId: string) => {
    if (!wsId) return
    try {
      startProcessing('Carregando fatura...')
      const sessao = await faturaImportacaoService.obterSessao(wsId, sessaoId)
      setSessaoAtual(sessao.importacao)
      setLinhas(sessao.linhas)
      if (sessao.importacao.cartao_id) {
        setCartaoSelecionadoId(sessao.importacao.cartao_id)
      }
      setSalvouContinuarDepois(false)
      setModalFaturasProcessamentoAberto(false)
      toast.success('Fatura carregada para revisão.')
    } catch (err: any) {
      toast.error('Erro ao retomar fatura: ' + err.message)
    } finally {
      stopProcessing()
    }
  }

  const handleDescartarSessaoDaLista = async (sessaoId: string) => {
    if (!wsId) return
    try {
      await faturaImportacaoService.descartarSessao(wsId, sessaoId)
      setFaturasEmProcessamento((prev) => prev.filter((s) => s.id !== sessaoId))
      toast.info('Fatura descartada com sucesso.')
    } catch (err: any) {
      toast.error('Erro ao descartar: ' + err.message)
    }
  }

  // Filtros avançados por texto, titular e final
  const [buscaTexto, setBuscaTexto] = useState('')
  const [filtroTitular, setFiltroTitular] = useState('todos')
  const [filtroFinal, setFiltroFinal] = useState('todos')

  // Listas únicas de titulares e finais para filtros rápidos
  const listaTitulares = Array.from(
    new Set(linhas.map((l) => l.titular).filter(Boolean)),
  ) as string[]
  const listaFinais = Array.from(
    new Set(linhas.map((l) => l.final_cartao).filter(Boolean)),
  ) as string[]

  // Linhas filtradas
  const linhasFiltradas = linhas.filter((l) => {
    // Filtro por tipo/status
    let passaTipo = true
    if (filtroAtivo === 'todos') passaTipo = true
    else if (filtroAtivo === 'compras') passaTipo = l.tipo_linha === 'compra'
    else if (filtroAtivo === 'parcelados') passaTipo = l.tipo_linha === 'parcelado'
    else if (filtroAtivo === 'creditos') passaTipo = l.tipo_linha === 'credito'
    else if (filtroAtivo === 'encargos') passaTipo = l.tipo_linha === 'encargo'
    else if (filtroAtivo === 'prontos')
      passaTipo = (l.status === 'pronto' || l.status === 'preenchido_regra') && !!l.categoria_id
    else if (filtroAtivo === 'nao_classificados')
      passaTipo = !l.categoria_id && l.status !== 'ignorado'
    else if (filtroAtivo === 'revisar')
      passaTipo =
        l.status === 'requer_revisao' || l.status === 'provavel_duplicado' || !l.categoria_id
    else if (filtroAtivo === 'conciliados') passaTipo = l.status === 'conciliado'
    else if (filtroAtivo === 'duplicados')
      passaTipo = l.status === 'provavel_duplicado' || l.status === 'duplicado'
    else if (filtroAtivo === 'ignorados') passaTipo = l.status === 'ignorado'

    if (!passaTipo) return false

    // Filtro por titular
    if (filtroTitular !== 'todos' && l.titular !== filtroTitular) return false

    // Filtro por final do cartão
    if (filtroFinal !== 'todos' && l.final_cartao !== filtroFinal) return false

    // Filtro por busca de texto (estabelecimento / descrição original)
    if (buscaTexto.trim()) {
      const q = buscaTexto.toLowerCase()
      const matchDesc = (l.descricao_editavel || '').toLowerCase().includes(q)
      const matchOrig = (l.descricao_original || '').toLowerCase().includes(q)
      const matchTit = (l.titular || '').toLowerCase().includes(q)
      if (!matchDesc && !matchOrig && !matchTit) return false
    }

    return true
  })

  // Totais da conferência visual (BLOCO 26)
  const totalFatura = sessaoAtual?.valor_total_fatura || 0
  const somaComprasEncargos = linhas
    .filter((l) => l.tipo_linha !== 'credito' && l.status !== 'ignorado')
    .reduce((acc, l) => acc + l.valor, 0)
  const somaCreditos = linhas
    .filter((l) => l.tipo_linha === 'credito' && l.status !== 'ignorado')
    .reduce((acc, l) => acc + l.valor, 0)
  const diferencaConferencia = Math.abs(totalFatura - (somaComprasEncargos - somaCreditos))
  const conferenciaOk = diferencaConferencia < 0.05

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
            Importar Fatura PDF
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Extração, normalização e conciliação de faturas Bradesco, CAIXA e C6 com revisão manual
            completa.
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

      {/* BLOCO DE UPLOAD (se nenhuma sessão carregada) */}
      {!sessaoAtual ? (
        <Card className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-6">
          {avisoHashReimportacao && (
            <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{avisoHashReimportacao}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Escolha do Cartão do SAP */}
            <div className="space-y-2">
              <Label className="text-slate-700 text-xs font-semibold">
                1. Selecione o Cartão Cadastrado no SAP *
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
                    <CreditCard className="w-3.5 h-3.5" /> Nenhum cartão cadastrado — cadastre em
                    Meus Cartões.
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
                        {c.nome} (fechamento dia {c.dia_fechamento}, vencimento dia{' '}
                        {c.dia_vencimento})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-[11px] text-slate-500">
                Todos os adicionais, titulares e finais do PDF serão consolidados neste único
                cartão.
              </p>
            </div>

            {/* Seleção do Arquivo PDF */}
            <div className="space-y-2">
              <Label className="text-slate-700 text-xs font-semibold">
                2. Selecione o Arquivo da Fatura (PDF) *
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={handleSelecionarArquivo}
                  className="bg-white border-slate-200 text-slate-900 file:bg-emerald-600 file:text-white file:border-0 file:rounded file:px-2 file:py-1 file:text-xs file:font-medium hover:file:bg-emerald-700 cursor-pointer text-xs"
                />
              </div>
              {arquivoSelecionado && (
                <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {arquivoSelecionado.name} (
                  {Math.round(arquivoSelecionado.size / 1024)} KB)
                </p>
              )}
              {erroCargaCategorias && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  As categorias não carregaram ({erroCargaCategorias}). Você pode processar o PDF,
                  mas a classificação ficará limitada — use “Tentar novamente” no cartão para
                  recarregar.
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-wrap justify-between items-center gap-3">
            {!cartaoSelecionadoId && (
              <p className="text-xs text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Selecione um cartão e um arquivo PDF para
                habilitar o processamento.
              </p>
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
              <Button
                onClick={() => handleIniciarProcessamento()}
                disabled={!arquivoBuffer || !cartaoSelecionadoId || processandoLeitura}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-6 py-2.5 flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {processandoLeitura ? 'Processando PDF...' : 'Ler e Processar Fatura'}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        /* ÁREA DE REVISÃO E CONFERÊNCIA */
        <div className="space-y-6">
          {/* Card Resumo do Cabeçalho e Reconciliação Visual */}
          <Card className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  Fatura Processada
                </span>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  {sessaoAtual.emissor_detectado?.toUpperCase()} • {sessaoAtual.arquivo_nome}
                </h3>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                  <span>
                    Vencimento:{' '}
                    <strong className="text-slate-700">
                      {sessaoAtual.data_vencimento?.split('-').reverse().join('/') || 'N/D'}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Fechamento:{' '}
                    <strong className="text-slate-700">
                      {sessaoAtual.data_fechamento?.split('-').reverse().join('/') || 'N/D'}
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
                className={`p-3 rounded-lg border text-xs flex flex-col gap-1 min-w-[240px] ${
                  conferenciaOk
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
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

          {/* C4 — Painel de Homologação / Diagnóstico: Ver texto extraído */}
          <PainelTextoExtraido extraction={extracaoAtual} parsed={parsedAtual} />

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

      {/* Modal de Senha do PDF (BLOCO C) */}
      <ModalSenhaPdf
        aberto={modalSenhaAberto}
        aoFechar={handleCancelarProcessamento}
        aoConfirmar={(senha) => handleIniciarProcessamento(senha)}
        carregando={processandoLeitura}
        erroMensagem={erroSenha}
      />

      {/* Modal de Edição em Massa */}
      <ModalEdicaoEmMassaFatura
        aberto={modalMassaAberto}
        aoFechar={() => setModalMassaAberto(false)}
        totalSelecionados={totalSelecionados}
        categorias={categorias}
        subcategorias={subcategorias}
        aoAplicar={handleAplicarEdicaoEmMassa}
      />

      {/* Modal C3: Cartão possui fatura processada */}
      <ModalSessaoExistenteCartao
        aberto={modalSessaoCartaoAberto}
        aoFechar={() => setModalSessaoCartaoAberto(false)}
        nomeCartao={cartoes.find((c) => c.id === cartaoSelecionadoId)?.nome}
        sessaoExistente={sessaoExistenteCartao}
        aoVisualizarExistente={handleVisualizarSessaoExistente}
        aoImportarNova={handleEscolherImportarNova}
      />

      {/* Modal C4: Descarte de fatura processada ao sair sem salvar */}
      <ModalDescarteNavegacao
        aberto={modalDescarteAberto}
        aoFechar={() => setModalDescarteAberto(false)}
        aoSalvarEContinuar={handleSalvarEContinuarDepois}
        aoDescartar={handleConfirmarDescarteSessao}
      />

      {/* Modal C5: Visualizar faturas salvas em processamento */}
      <ModalVisualizarFaturasEmProcessamento
        aberto={modalFaturasProcessamentoAberto}
        aoFechar={() => setModalFaturasProcessamentoAberto(false)}
        faturas={faturasEmProcessamento}
        cartoes={cartoes}
        carregando={carregandoFaturasProcessamento}
        aoRetomarSessao={handleRetomarSessao}
        aoDescartarSessao={handleDescartarSessaoDaLista}
      />
    </div>
  )
}
