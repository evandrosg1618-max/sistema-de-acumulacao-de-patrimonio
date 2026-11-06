import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useGlobalLoading } from '@/contexts/LoadingContext'
import { cartaoService, categoriaService } from '@/services/sap'
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
} from '@/services/pdf/pdfReader'
import { executarParserFatura } from '@/services/pdf/faturaParserRouter'
import { ModalSenhaPdf } from '@/components/ModalSenhaPdf'
import { ModalEdicaoEmMassaFatura } from '@/components/ModalEdicaoEmMassaFatura'
import { LinhaRevisaoFaturaItem } from '@/components/LinhaRevisaoFaturaItem'
import { Cartao, Categoria, Subcategoria } from '@/types/sap'
import { formatMoneyBRL } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
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
  Layers,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

export const ImportarFaturaPage: React.FC = () => {
  const { currentWorkspace, user } = useAuth()
  const { showLoading, hideLoading } = useGlobalLoading()
  const navigate = useNavigate()

  // Estados principais
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [cartaoSelecionadoId, setCartaoSelecionadoId] = useState<string>('')

  // Upload & Leitura
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null)
  const [arquivoBuffer, setArquivoBuffer] = useState<ArrayBuffer | null>(null)
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false)
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [processandoLeitura, setProcessandoLeitura] = useState(false)

  // Sessão de Revisão
  const [sessaoAtual, setSessaoAtual] = useState<FaturaImportacaoRegistro | null>(null)
  const [linhas, setLinhas] = useState<FaturaImportacaoLinhaRegistro[]>([])
  const [filtroAtivo, setFiltroAtivo] = useState<string>('todos')
  const [modalMassaAberto, setModalMassaAberto] = useState(false)
  const [importandoFinal, setImportandoFinal] = useState(false)

  const wsId = currentWorkspace?.id

  // Carrega cartões e categorias do workspace
  useEffect(() => {
    if (!wsId) return
    const carregarDados = async () => {
      try {
        const [cList, cats, subcats] = await Promise.all([
          cartaoService.list(wsId),
          categoriaService.listCategorias(wsId),
          categoriaService.listSubcategorias(wsId),
        ])
        const cartoesAtivos = cList.filter((c) => !c.arquivado && !c.deleted_at)
        setCartoes(cartoesAtivos)
        if (cartoesAtivos.length > 0 && !cartaoSelecionadoId) {
          setCartaoSelecionadoId(cartoesAtivos[0].id)
        }
        setCategorias(cats.filter((c) => c.tipo === 'despesa'))
        setSubcategorias(subcats)
      } catch (err: any) {
        toast.error('Erro ao carregar cartões e categorias: ' + err.message)
      }
    }
    carregarDados()
  }, [wsId])

  // Trata seleção de arquivo
  const handleSelecionarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Por favor, selecione um arquivo em formato PDF.')
      return
    }

    setArquivoSelecionado(file)
    const buffer = await file.arrayBuffer()
    setArquivoBuffer(buffer)
  }

  // Inicia processamento do PDF
  const handleIniciarProcessamento = async (senhaFornecida?: string) => {
    if (!arquivoBuffer || !arquivoSelecionado || !wsId || !cartaoSelecionadoId) {
      toast.error('Selecione um cartão e um arquivo PDF antes de continuar.')
      return
    }

    setProcessandoLeitura(true)
    showLoading('Lendo e extraindo transações do PDF...')
    setErroSenha(null)

    try {
      // 1. Calcular hash do arquivo
      const hash = await calcularHashArquivo(arquivoBuffer)

      // Verificar duplicidade de PDF
      const existente = await faturaImportacaoService.verificarHashExistente(wsId, hash)
      if (existente && !senhaFornecida) {
        toast.info(
          `Esta fatura já foi processada anteriormente em ${new Date(existente.created_at).toLocaleDateString('pt-BR')}. Carregando sessão existente...`,
        )
        const sessao = await faturaImportacaoService.obterSessao(wsId, existente.id)
        setSessaoAtual(sessao.importacao)
        setLinhas(sessao.linhas)
        hideLoading()
        setProcessandoLeitura(false)
        return
      }

      // 2. Extrair texto com pdf.js (suportando senha e bloqueio)
      const extraction = await extrairTextoPdf(arquivoBuffer, senhaFornecida)

      // Se precisava de senha e deu certo, fecha o modal
      if (modalSenhaAberto) {
        setModalSenhaAberto(false)
      }

      // 3. Executar o parser pelo emissor
      const allLines = extraction.pages.flatMap((p) => p.lines)
      const parsed = executarParserFatura(extraction.fullText, allLines)

      // 4. Criar sessão e linhas temporárias
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

      toast.success(
        `Fatura lida com sucesso! ${linhasGravadas.length} itens extraídos para revisão.`,
      )
    } catch (err: any) {
      if (err instanceof PasswordRequiredError) {
        setModalSenhaAberto(true)
        setErroSenha(null)
      } else if (err instanceof InvalidPasswordError) {
        setModalSenhaAberto(true)
        setErroSenha('Não foi possível abrir o PDF. Verifique a senha e tente novamente.')
      } else {
        toast.error('Erro ao processar PDF: ' + (err?.message || 'Arquivo corrompido'))
      }
    } finally {
      hideLoading()
      setProcessandoLeitura(false)
    }
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
    if (config.modalidadeSaida) alteracoes.modalidade_saida = config.modalidadeSaida
    if (config.afetaResultado !== undefined) alteracoes.afeta_resultado = config.afetaResultado
    if (config.afetaOrcamento !== undefined) alteracoes.afeta_orcamento = config.afetaOrcamento
    if (config.marcarIgnorado) {
      alteracoes.status = 'ignorado'
      alteracoes.selecionado = false
    } else {
      alteracoes.status = 'pronto'
    }

    setLinhas((prev) =>
      prev.map((l) => (selecionados.includes(l.id) ? { ...l, ...alteracoes } : l)),
    )

    await faturaImportacaoService.atualizarLinhasEmMassa(selecionados, alteracoes)
    toast.success(`Edição aplicada a ${selecionados.length} itens.`)
  }

  // Efetivação dos selecionados pelo fluxo normal do SAP
  const handleImportarConfirmados = async () => {
    if (!wsId || !sessaoAtual || !user) return

    setImportandoFinal(true)
    showLoading('Efetivando lançamentos pelo fluxo normal do SAP...')

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
      hideLoading()
      setImportandoFinal(false)
    }
  }

  // Linhas filtradas
  const linhasFiltradas = linhas.filter((l) => {
    if (filtroAtivo === 'todos') return true
    if (filtroAtivo === 'compras') return l.tipo_linha === 'compra'
    if (filtroAtivo === 'parcelados') return l.tipo_linha === 'parcelado'
    if (filtroAtivo === 'creditos') return l.tipo_linha === 'credito'
    if (filtroAtivo === 'encargos') return l.tipo_linha === 'encargo'
    if (filtroAtivo === 'prontos') return l.status === 'pronto' || l.status === 'preenchido_regra'
    if (filtroAtivo === 'revisar')
      return l.status === 'requer_revisao' || l.status === 'provavel_duplicado' || !l.categoria_id
    if (filtroAtivo === 'conciliados') return l.status === 'conciliado'
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
    <div className="space-y-6 pb-12 max-w-6xl mx-auto px-4">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
            <FileText className="w-6 h-6 text-teal-400" />
            Importar Fatura PDF
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Extração, normalização e conciliação de faturas Bradesco, CAIXA e C6 com revisão manual
            completa.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => navigate('/cartoes')}
          className="border-slate-700 text-slate-300 text-xs self-start sm:self-auto"
        >
          Voltar para Cartões
        </Button>
      </div>

      {/* BLOCO DE UPLOAD (se nenhuma sessão carregada) */}
      {!sessaoAtual ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Escolha do Cartão do SAP */}
            <div className="space-y-2">
              <Label className="text-slate-200 text-xs font-semibold">
                1. Selecione o Cartão Cadastrado no SAP *
              </Label>
              <Select value={cartaoSelecionadoId} onValueChange={setCartaoSelecionadoId}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Selecione o cartão..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                  {cartoes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} (fechamento dia {c.dia_fechamento}, vencimento dia {c.dia_vencimento}
                      )
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400">
                Todos os adicionais, titulares e finais do PDF serão consolidados neste único
                cartão.
              </p>
            </div>

            {/* Seleção do Arquivo PDF */}
            <div className="space-y-2">
              <Label className="text-slate-200 text-xs font-semibold">
                2. Selecione o Arquivo da Fatura (PDF) *
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={handleSelecionarArquivo}
                  className="bg-slate-800 border-slate-700 text-slate-200 file:bg-teal-600 file:text-white file:border-0 file:rounded file:px-2 file:py-1 file:text-xs file:font-medium hover:file:bg-teal-500 cursor-pointer text-xs"
                />
              </div>
              {arquivoSelecionado && (
                <p className="text-[11px] text-teal-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {arquivoSelecionado.name} (
                  {Math.round(arquivoSelecionado.size / 1024)} KB)
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <Button
              onClick={() => handleIniciarProcessamento()}
              disabled={!arquivoBuffer || !cartaoSelecionadoId || processandoLeitura}
              className="bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs px-6 py-2.5 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {processandoLeitura ? 'Processando PDF...' : 'Ler e Processar Fatura'}
            </Button>
          </div>
        </div>
      ) : (
        /* ÁREA DE REVISÃO E CONFERÊNCIA */
        <div className="space-y-6">
          {/* Card Resumo do Cabeçalho e Reconciliação Visual */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Fatura Processada
                </span>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  {sessaoAtual.emissor_detectado?.toUpperCase()} • {sessaoAtual.arquivo_nome}
                </h3>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                  <span>
                    Vencimento:{' '}
                    <strong className="text-slate-300">
                      {sessaoAtual.data_vencimento?.split('-').reverse().join('/') || 'N/D'}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Fechamento:{' '}
                    <strong className="text-slate-300">
                      {sessaoAtual.data_fechamento?.split('-').reverse().join('/') || 'N/D'}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Itens: <strong className="text-slate-300">{linhas.length}</strong>
                  </span>
                </div>
              </div>

              {/* Box de Conferência da Fatura */}
              <div
                className={`p-3 rounded-lg border text-xs flex flex-col gap-1 min-w-[220px] ${
                  conferenciaOk
                    ? 'bg-teal-950/40 border-teal-800/60 text-teal-200'
                    : 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                }`}
              >
                <div className="flex justify-between items-center font-semibold">
                  <span>Valor Declarado:</span>
                  <span className="font-mono">{formatMoneyBRL(totalFatura)}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-300">
                  <span>Compras/Encargos:</span>
                  <span className="font-mono">{formatMoneyBRL(somaComprasEncargos)}</span>
                </div>
                {somaCreditos > 0 && (
                  <div className="flex justify-between items-center text-[11px] text-slate-300">
                    <span>(-) Créditos:</span>
                    <span className="font-mono">-{formatMoneyBRL(somaCreditos)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center font-bold pt-1 border-t border-slate-700/60">
                  <span>Status:</span>
                  <span>{conferenciaOk ? '✓ Conferido' : 'Diferença a revisar'}</span>
                </div>
              </div>
            </div>

            {/* Barra de Filtros e Ações Rápidas */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {[
                  { id: 'todos', label: 'Todos' },
                  { id: 'compras', label: 'Compras à vista' },
                  { id: 'parcelados', label: 'Parcelados' },
                  { id: 'creditos', label: 'Estornos/Créditos' },
                  { id: 'encargos', label: 'Encargos' },
                  { id: 'prontos', label: 'Prontos' },
                  { id: 'revisar', label: 'Requer Revisão' },
                  { id: 'conciliados', label: 'Conciliados' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltroAtivo(f.id)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      filtroAtivo === f.id
                        ? 'bg-teal-600 text-white font-semibold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
                  className="border-slate-700 text-slate-300 text-xs h-8"
                >
                  <CheckSquare className="w-3.5 h-3.5 mr-1" /> Marcar Visíveis
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSelecionarTodosVisiveis(false)}
                  className="border-slate-700 text-slate-300 text-xs h-8"
                >
                  <Square className="w-3.5 h-3.5 mr-1" /> Desmarcar
                </Button>
                <Button
                  size="sm"
                  onClick={() => setModalMassaAberto(true)}
                  disabled={totalSelecionados === 0}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs h-8"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-teal-400" /> Edição em Massa (
                  {totalSelecionados})
                </Button>
              </div>
            </div>
          </div>

          {/* Lista de Linhas Temporárias */}
          <div className="space-y-2">
            {linhasFiltradas.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-xl text-slate-400 text-xs">
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
          <div className="sticky bottom-4 bg-slate-900/95 backdrop-blur border border-slate-700 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-2xl">
            <div className="text-xs text-slate-300">
              <strong className="text-slate-100">{totalSelecionados}</strong> selecionados para
              importação (<strong className="text-teal-400">{totalProntos}</strong> prontos).
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  toast.info('Sessão salva. Você pode continuar a revisão a qualquer momento.')
                  navigate('/cartoes')
                }}
                className="border-slate-700 text-slate-300 text-xs"
              >
                Salvar e Continuar Depois
              </Button>

              <Button
                onClick={handleImportarConfirmados}
                disabled={totalSelecionados === 0 || importandoFinal}
                className="bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs px-6 py-2.5 flex items-center gap-2"
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
        aoFechar={() => setModalSenhaAberto(false)}
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
    </div>
  )
}
