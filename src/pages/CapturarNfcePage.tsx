/**
 * Página Capturar NFC-e / Cupom Fiscal — SAP v0.0.98 (BLOCO 1)
 * Mobile-first (Samsung S20 FE / Chrome Android, 320 a 430 px).
 *
 * Duas TRILHAS com perfis distintos:
 *  • PAPEL: foto do cupom fiscal (câmera traseira / seleção / colar).
 *  • DIGITAL: captura de tela da página da NFC-e (colar prioritário).
 *
 * Fluxo: trilha → capturas na bandeja (recorte antes de processar) →
 * processar (OCR → candidatos) → revisão editável → importar (services
 * existentes; NUNCA cria lançamento sem confirmação).
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CapturaCamera } from '@/services/captura/CapturaCamera'
import { EditorRecorte } from '@/services/captura/EditorRecorte'
import { ModalLoteCaptura } from '@/components/captura/ModalLoteCaptura'
import { ModalAgruparCaptura } from '@/components/captura/ModalAgruparCaptura'
import { CapturaNfceErrorBoundary } from '@/components/captura/CapturaNfceErrorBoundary'
import {
  capturaService,
  rotuloStatusSessao,
  rotuloTipoDocumento,
  LIMITE_SESSOES_RECENTES,
  type CapturaSessao,
  type CapturaSessaoImagem,
} from '@/services/captura/capturaService'
import { processarCapturasNfce } from '@/services/captura/processarCapturas'
import type { TrilhaCaptura } from '@/services/captura/nfceParser'
import { lancamentoService, meioPagamentoService, categoriaService } from '@/services/sap'
import { formatMoneyBRL, getTodayDateString } from '@/lib/formatters'
import { ModalDetalheSessaoCaptura } from '@/components/captura/ModalDetalheSessaoCaptura'
import { LinhaRevisaoCaptura } from '@/components/captura/LinhaRevisaoCaptura'
import {
  CapturaItemRevisao,
  PatchLoteCaptura,
  candidatoDeItem,
  candidatoEstaCompleto,
  itemDbParaRevisao,
  revisaoParaItemDb,
  aplicarPatchLote,
} from '@/components/captura/tiposRevisao'
import type { Categoria, Subcategoria } from '@/types/sap'
import { contaService, cartaoService } from '@/services/sap'
import { ModalDetalheItemCaptura } from '@/components/captura/ModalDetalheItemCaptura'
import {
  Camera,
  ClipboardPaste,
  ImagePlus,
  Sparkles,
  Plus,
  CheckSquare,
  Trash2,
  Eye,
  Scissors,
  History,
  Loader2,
  ClipboardList,
  Layers,
} from 'lucide-react'

type Etapa = 'trilha' | 'capturando' | 'revisao'

function CapturarNfceConteudo() {
  const navigate = useNavigate()
  const { user, profile, currentWorkspace } = useAuth() as any

  const [etapa, setEtapa] = useState<Etapa>('trilha')
  const [trilha, setTrilha] = useState<TrilhaCaptura>('papel')
  const [sessao, setSessao] = useState<CapturaSessao | null>(null)
  const [imagens, setImagens] = useState<Array<CapturaSessaoImagem & { url: string }>>([])
  const [itens, setItens] = useState<CapturaItemRevisao[]>([])
  const [historico, setHistorico] = useState<CapturaSessao[]>([])
  const [meios, setMeios] = useState<any[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [totalDocumento, setTotalDocumento] = useState<number | null>(null)
  const [sessaoDetalhe, setSessaoDetalhe] = useState<CapturaSessao | null>(null)
  // T1 — Valor total da NFC-e informado/EDITÁVEL pelo usuário (texto cru,
  // vírgula ou ponto). Pré-preenchido com o total do OCR quando reconhecido;
  // null = usuário ainda não tocou no campo (dif. usa o total do OCR).
  const [valorNfceTexto, setValorNfceTexto] = useState<string>('')
  const [valorNfceInformado, setValorNfceInformado] = useState<number | null>(null)

  const [cameraAberta, setCameraAberta] = useState(false)
  const [imagemRecorte, setImagemRecorte] = useState<string | null>(null)
  const [recorteOrigem, setRecorteOrigem] = useState<'nova' | 'bandeja'>('nova')
  const [imagemEmBandeja, setImagemEmBandeja] = useState<
    (CapturaSessaoImagem & { url: string }) | null
  >(null)
  const [processando, setProcessando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [importando, setImportando] = useState(false)
  const [loteAberto, setLoteAberto] = useState(false)
  const [agruparAberto, setAgruparAberto] = useState(false)
  const [itemManualAberto, setItemManualAberto] = useState(false)

  const [descManual, setDescManual] = useState('')
  const [valManual, setValManual] = useState('')
  const inputArquivoRef = useRef<HTMLInputElement | null>(null)
  // R6 — Detalhes = ModalLancamento em MODO CAPTURA (uma instância na página)
  const [itemDetalheId, setItemDetalheId] = useState<string | null>(null)
  // R6 — listas para o ModalLancamento em modo captura (Pago com real)
  const [contas, setContas] = useState<any[]>([])
  const [cartoes, setCartoes] = useState<any[]>([])
  const [carregandoContasCartoes, setCarregandoContasCartoes] = useState(true)
  const [importadosAbertos, setImportadosAbertos] = useState(false)
  // T2 — filtro da lista de revisão (Todos | A Revisar | Prontos para importar)
  const [filtroRevisao, setFiltroRevisao] = useState<'todos' | 'revisar' | 'prontos'>('todos')
  // T7 — confirmação antes de importar: 'confirmar' (todos Prontos) ou 'bloqueado'
  const [avisoImportar, setAvisoImportar] = useState<'confirmar' | 'bloqueado' | null>(null)
  const workspaceId = currentWorkspace?.workspace_id || currentWorkspace?.id || ''

  const carregarHistorico = useCallback(async () => {
    if (!workspaceId) return
    try {
      // T8 — regra de permanência: sessão com TODOS os itens importados SAI de
      // "Capturas recentes" (mantidas as últimas 5; lançamentos nunca excluídos).
      // Busca um pouco além do limite para o filtro não encurtar a lista.
      const lista = await capturaService.listarRecentes(workspaceId, LIMITE_SESSOES_RECENTES + 5)
      setHistorico(lista.filter((s) => s.status !== 'importada').slice(0, LIMITE_SESSOES_RECENTES))
    } catch {
      /* histórico é secundário — falha não bloqueia o fluxo */
    }
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    carregarHistorico()
    meioPagamentoService
      .list(workspaceId)
      .then((ms) => setMeios(ms || []))
      .catch(() => setMeios([]))
    // R6 — listas para o ModalLancamento em modo captura (Pago com real)
    contaService
      .list(workspaceId)
      .then((cs) => setContas(cs || []))
      .catch(() => setContas([]))
    cartaoService
      .list(workspaceId)
      .then((ks) => setCartoes(ks || []))
      .catch(() => setCartoes([]))
      .finally(() => setCarregandoContasCartoes(false))
    categoriaService
      .listComSubcategorias(workspaceId, false)
      .then((lista) => {
        const despesa = (lista || []).filter((c: any) => c.tipo === 'despesa')
        setCategorias(despesa)
        setSubcategorias(despesa.flatMap((c: any) => c.subcategorias || []))
      })
      .catch(() => {
        setCategorias([])
        setSubcategorias([])
      })
  }, [workspaceId, carregarHistorico])

  // ─────────────────────── Bandeja / imagens ───────────────────────

  const recarregarImagens = useCallback(async (s: CapturaSessao) => {
    const lista = await capturaService.listarImagens(s.id, s.workspace_id)
    const comUrls: Array<CapturaSessaoImagem & { url: string }> = []
    for (const im of lista) {
      try {
        const url = await capturaService.urlAssinada(im.storage_path, 300)
        comUrls.push({ ...im, url })
      } catch {
        /* pula imagem inacessível */
      }
    }
    setImagens(comUrls)
  }, [])

  const iniciarSessao = async (t: TrilhaCaptura) => {
    if (!workspaceId) {
      toast({
        title: 'Workspace não identificado',
        description: 'Reentre no SAP.',
        variant: 'destructive',
      })
      return
    }
    try {
      const meioPadrao = meios.find((m) => m.ativo) || null
      const s = await capturaService.criarSessao(workspaceId, {
        tipo_documento: 'nfce',
        trilha: t,
        meio_pagamento_id: meioPadrao?.id || null,
        meio_pagamento_tipo: meioPadrao?.tipo || null,
        meio_pagamento_nome: meioPadrao?.nome || null,
        data_documento: getTodayDateString(),
        created_by: user?.id || profile?.id || null,
      })
      setTrilha(t)
      setSessao(s)
      setItens([])
      setImagens([])
      setEtapa('capturando')
      await capturaService.limparSessoesAntigas(workspaceId)
      await capturaService.registrarAuditoria(
        workspaceId,
        s.id,
        'criar_sessao',
        { trilha: t },
        user?.id,
      )
      carregarHistorico()
    } catch (e: any) {
      toast({
        title: 'Erro ao iniciar captura',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const abrirCamera = () => setCameraAberta(true)

  const abrirSelecionarArquivo = () => inputArquivoRef.current?.click()

  const aoEscolherArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImagemRecorte(String(reader.result))
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    const handler = (ev: ClipboardEvent) => {
      const item = Array.from(ev.clipboardData?.items || []).find((i) =>
        i.type.startsWith('image/'),
      )
      if (!item) return
      const file = item.getAsFile()
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        setImagemRecorte(String(reader.result))
        setRecorteOrigem('nova')
      }
      reader.readAsDataURL(file)
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [])

  const adicionarCaptura = async (
    dataUrl: string,
    recorte?: { x: number; y: number; w: number; h: number } | null,
  ) => {
    if (!sessao) return
    setProcessando(true)
    setProgresso('Salvando captura…')
    try {
      const { blob } = await (async () => {
        const mod = await import('@/services/captura/imagemUtils')
        return mod.comprimirImagem(dataUrl, 1600, 0.8)
      })()
      const ordem = imagens.length
      const path = await capturaService.uploadImagem(sessao.workspace_id, sessao.id, blob, ordem)
      await capturaService.inserirImagem(
        sessao.id,
        sessao.workspace_id,
        path,
        ordem,
        trilha,
        recorte || null,
      )
      await capturaService.registrarAuditoria(
        sessao.workspace_id,
        sessao.id,
        'adicionar_captura',
        { ordem },
        user?.id,
      )
      await recarregarImagens(sessao)
      toast({
        title: '✓ Captura adicionada',
        description: `Imagem ${ordem + 1} na bandeja desta NFC-e.`,
      })
      setImagemRecorte(null)
      setImagemEmBandeja(null)
    } catch (e: any) {
      toast({
        title: 'Erro ao salvar captura',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setProcessando(false)
      setProgresso('')
    }
  }

  // O EditorRecorte devolve a região recortada já como imagem (data URL JPEG).
  const confirmarRecorteNova = async (recorteDataUrl: string) => {
    if (!imagemRecorte) return
    await adicionarCaptura(recorteDataUrl, null)
  }

  const confirmarRecorteBandeja = async (recorteDataUrl: string) => {
    if (!imagemEmBandeja || !sessao) return
    await capturaService.excluirImagem(imagemEmBandeja.id, sessao.id, sessao.workspace_id)
    await adicionarCaptura(recorteDataUrl, null)
  }

  const moverImagem = async (idx: number, direcao: -1 | 1) => {
    if (!sessao) return
    const alvo = idx + direcao
    if (alvo < 0 || alvo >= imagens.length) return
    const nova = [...imagens]
    ;[nova[idx], nova[alvo]] = [nova[alvo], nova[idx]]
    setImagens(nova)
    await capturaService.reordenarImagens(
      sessao.id,
      sessao.workspace_id,
      nova.map((n) => n.id),
    )
    recarregarImagens(sessao)
  }

  const excluirImagemBandeja = async (im: CapturaSessaoImagem) => {
    if (!sessao) return
    try {
      await capturaService.excluirImagem(im.id, sessao.id, sessao.workspace_id)
      await recarregarImagens(sessao)
      toast({ title: 'Captura removida da bandeja' })
    } catch (e: any) {
      toast({ title: 'Erro ao remover', description: e?.message || '', variant: 'destructive' })
    }
  }

  const visualizarImagem = (im: CapturaSessaoImagem & { url: string }) => {
    window.open(im.url, '_blank')
  }

  // ─────────────────────── Processamento (OCR) ───────────────────────

  const processar = async () => {
    if (!sessao || imagens.length === 0 || processando) return
    setProcessando(true)
    setImportando(false)
    setProgresso('Preparando OCR…')
    try {
      await capturaService.atualizarSessao(sessao.id, sessao.workspace_id, {
        status: 'processando',
      })
      const urls = imagens.map((i) => i.url)
      const resultado = await processarCapturasNfce(urls, trilha, (p) => {
        setProgresso(`Captura ${p.imagemIndex + 1}/${p.total} — ${p.status}`)
      })
      const dataSugerida =
        resultado.dataConfianca === 'alta' ? resultado.dataDocumento : getTodayDateString()
      setTotalDocumento(resultado.totalDocumento ?? null)
      // T1 — pré-preenche o campo editável com o total reconhecido pelo OCR
      setValorNfceInformado(resultado.totalDocumento ?? null)
      setValorNfceTexto(
        resultado.totalDocumento != null && resultado.totalDocumento > 0
          ? resultado.totalDocumento.toFixed(2).replace('.', ',')
          : '',
      )
      const meioSessao = meios.find((m) => m.id === sessao.meio_pagamento_id)
      const candidatos: CapturaItemRevisao[] = resultado.itens.map((it) => {
        const c = candidatoDeItem(it, dataSugerida || getTodayDateString())
        return {
          ...c,
          meio_pagamento_id: sessao.meio_pagamento_id,
          meio_pagamento_tipo: sessao.meio_pagamento_tipo,
          meio_pagamento_nome: sessao.meio_pagamento_nome || meioSessao?.nome || null,
        }
      })
      setItens(candidatos)
      const linhasDb = await capturaService.substituirItens(
        sessao.id,
        sessao.workspace_id,
        candidatos.map((c) => revisaoParaItemDb(c)),
      )
      // Recria a lista a partir dos registros do banco para obter os IDs reais
      // (necessários para vincularLancamento / marcarErroItem na importação).
      setItens(
        linhasDb.map((row, idx) => ({
          ...itemDbParaRevisao(row),
          selecionado: candidatos[idx]?.selecionado ?? true,
        })),
      )
      await capturaService.atualizarSessao(sessao.id, sessao.workspace_id, {
        status: 'revisao',
        data_documento: dataSugerida,
        valor_total_documento: resultado.totalDocumento,
        quantidade_itens: candidatos.length,
      })
      setEtapa('revisao')
      toast({
        title: `${candidatos.length} item(ns) reconhecido(s)`,
        description: 'Revise antes de importar — nada é lançado sem sua confirmação.',
      })
      await capturaService.registrarAuditoria(
        sessao.workspace_id,
        sessao.id,
        'processar',
        { itens: candidatos.length },
        user?.id,
      )
      carregarHistorico()
    } catch (e: any) {
      toast({
        title: 'Erro no processamento',
        description:
          e?.message || 'Não foi possível reconhecer os itens. Tente capturas mais nítidas.',
        variant: 'destructive',
      })
      if (sessao) {
        await capturaService.atualizarSessao(sessao.id, sessao.workspace_id, { status: 'erro' })
      }
    } finally {
      setProcessando(false)
      setProgresso('')
    }
  }

  // ─────────────────────── Revisão / importação ───────────────────────

  const atualizarItem = (id: string, patch: Partial<CapturaItemRevisao>) =>
    setItens((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  // T1 — digitação do Valor total da NFC-e sem travar (estado local de texto)
  const aoDigitarValorNfce = (texto: string) => {
    setValorNfceTexto(texto)
    const limpo = texto.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
    const n = Number(limpo)
    setValorNfceInformado(texto.trim() === '' || !isFinite(n) ? null : n)
  }

  // T5 — Continuar Revisão: recarrega do banco sessão + imagens + itens da
  // sessão escolhida e cai na etapa de revisão (itens importados voltam
  // marcados como importados e NUNCA são reimportados).
  const continuarRevisao = async (s: CapturaSessao) => {
    try {
      const sDb = (await capturaService.getSessao(s.id, s.workspace_id)) || s
      const listaItens = await capturaService.listarItens(s.id, s.workspace_id)
      setTrilha((sDb.trilha || 'papel') as TrilhaCaptura)
      setSessao(sDb)
      setItens(listaItens.map((row) => itemDbParaRevisao(row)))
      setTotalDocumento(sDb.valor_total_documento ?? null)
      setValorNfceInformado(sDb.valor_total_documento ?? null)
      setValorNfceTexto(
        sDb.valor_total_documento != null && sDb.valor_total_documento > 0
          ? sDb.valor_total_documento.toFixed(2).replace('.', ',')
          : '',
      )
      try {
        await recarregarImagens(sDb)
      } catch {
        setImagens([])
      }
      setEtapa('revisao')
    } catch (e: any) {
      toast({
        title: 'Não foi possível abrir a revisão',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  // R6 — Detalhes: abre a janela do Novo Lançamento em MODO CAPTURA
  const abrirDetalhes = (item: CapturaItemRevisao) => setItemDetalheId(item.id)
  const itemDetalhe = itens.find((i) => i.id === itemDetalheId) || null

  // R5 — seleção em massa atua SOMENTE nos itens ainda não importados
  const selecionarTodos = (v: boolean) =>
    setItens((prev) => prev.map((i) => (i.status !== 'importado' ? { ...i, selecionado: v } : i)))

  const aplicarLote = (patch: PatchLoteCaptura) => {
    const ids = itens.filter((i) => i.selecionado).map((i) => i.id)
    setItens((prev) => aplicarPatchLote(prev, ids, patch))
    toast({ title: 'Lote aplicado', description: 'Somente os campos marcados foram alterados.' })
    setLoteAberto(false)
  }

  const agrupar = (descricao: string, valor: number) => {
    const selecionados = itens.filter((i) => i.selecionado)
    if (selecionados.length === 0) return
    const primeiro = selecionados[0]
    const grupo: CapturaItemRevisao = {
      id: `grupo_${Date.now()}`,
      selecionado: true,
      descricao,
      valor,
      status: 'pronto',
      confianca: 'alta',
      agrupado: true,
      idsOriginais: selecionados.map((i) => i.id),
      data: primeiro.data,
      meio_pagamento_id: primeiro.meio_pagamento_id,
      meio_pagamento_tipo: primeiro.meio_pagamento_tipo,
      meio_pagamento_nome: primeiro.meio_pagamento_nome,
      categoria_id: primeiro.categoria_id,
      subcategoria_id: primeiro.subcategoria_id,
      modalidade_saida: primeiro.modalidade_saida || 'compra_propria',
      valor_proprio: valor,
      valor_terceiros: 0,
      afeta_resultado: primeiro.afeta_resultado,
      afeta_orcamento: primeiro.afeta_orcamento,
      observacao: null,
    }
    // Exclusivo: remove os individuais agrupados (do estado e, quando já
    // persistidos, do banco) e mantém apenas o candidato do grupo.
    for (const s of selecionados) {
      if (sessao && !s.id.startsWith('manual_') && !s.id.startsWith('grupo_')) {
        capturaService.excluirItem(s.id, sessao.id, sessao.workspace_id).catch(() => undefined)
      }
    }
    setItens((prev) => [...prev.filter((i) => !i.selecionado), grupo])
    setAgruparAberto(false)
    toast({
      title: 'Itens agrupados',
      description: `${selecionados.length} item(ns) agora formam 1 candidato.`,
    })
  }

  const addItemManual = () => {
    const valor = Number(valManual.replace(/\./g, '').replace(',', '.'))
    if (!descManual.trim() || !(valor > 0)) {
      toast({ title: 'Preencha descrição e valor', variant: 'destructive' })
      return
    }
    const meio = meios.find((m) => m.id === sessao?.meio_pagamento_id)
    setItens((prev) => [
      ...prev,
      {
        id: `manual_${Date.now()}`,
        selecionado: true,
        descricao: descManual.trim(),
        valor,
        status: 'pronto',
        confianca: 'alta',
        data: sessao?.data_documento || getTodayDateString(),
        meio_pagamento_id: sessao?.meio_pagamento_id || null,
        meio_pagamento_tipo: sessao?.meio_pagamento_tipo || null,
        meio_pagamento_nome: sessao?.meio_pagamento_nome || meio?.nome || null,
        categoria_id: null,
        subcategoria_id: null,
        modalidade_saida: 'compra_propria',
        valor_proprio: valor,
        valor_terceiros: 0,
        afeta_resultado: true,
        afeta_orcamento: true,
        observacao: null,
      },
    ])
    setDescManual('')
    setValManual('')
    setItemManualAberto(false)
  }

  const importar = async () => {
    if (!sessao || importando) return
    const paraImportar = itens.filter((i) => i.selecionado && i.status !== 'importado')
    if (paraImportar.length === 0) {
      toast({ title: 'Selecione itens para importar' })
      return
    }
    // R4 — "Importar selecionados" valida os obrigatórios ANTES de criar
    // qualquer lançamento; item incompleto fica bloqueado ("Revisar").
    const incompletos = paraImportar.filter((i) => !candidatoEstaCompleto(i))
    if (incompletos.length > 0) {
      toast({
        title: 'Itens incompletos selecionados',
        description:
          'Complete descrição, valor, data, Pago com e subcategoria (quando exigida) nos Detalhes antes de importar.',
        variant: 'destructive',
      })
      return
    }
    const semMeio = paraImportar.find((i) => !i.meio_pagamento_id)
    if (semMeio) {
      toast({ title: 'Defina o "Pago com" dos itens selecionados', variant: 'destructive' })
      return
    }
    const semData = paraImportar.find((i) => !i.data)
    if (semData) {
      toast({ title: 'Defina a data de todos os itens selecionados', variant: 'destructive' })
      return
    }
    setImportando(true)
    let ok = 0
    let falhas = 0
    for (const item of paraImportar) {
      try {
       const tipoMeio = (item.meio_pagamento_tipo || 'DINHEIRO') as 'CONTA' | 'CARTAO' | 'DINHEIRO'
       const criado = await lancamentoService.create({
        // T4 — created_by é OBRIGATÓRIO (insert + auditoriaService.registrar):
        // sem ele a criação falha e o item vira tarja vermelha de erro.
        created_by: user?.id || profile?.id || null,
         workspace_id: workspaceId,
          tipo: 'despesa',
          regime: 'unico',
          data: item.data || getTodayDateString(),
          descricao: item.descricao,
          valor: item.valor,
          meio_pagamento_tipo: tipoMeio,
          conta_origem_id: tipoMeio === 'CONTA' ? item.meio_pagamento_id : null,
          cartao_id: tipoMeio === 'CARTAO' ? item.meio_pagamento_id : null,
          status_pagamento: 'pago',
          data_pagamento: getTodayDateString(),
          subcategoria_id: item.subcategoria_id || null,
          modalidade_saida: (item.modalidade_saida || 'compra_propria') as any,
          valor_proprio:
            item.modalidade_saida === 'compra_compartilhada'
              ? (item.valor_proprio ?? item.valor)
              : undefined,
          valor_terceiros:
            item.modalidade_saida === 'compra_compartilhada'
              ? (item.valor_terceiros ?? 0)
              : undefined,
          afeta_resultado: item.afeta_resultado,
          afeta_orcamento: item.afeta_orcamento,
          observacao: item.observacao || null,
        })
        await capturaService.vincularLancamento(
          item.id,
          sessao.id,
          sessao.workspace_id,
          (criado as any)?.id || '',
        )
        setItens((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: 'importado', selecionado: false } : i,
          ),
        )
        ok++
      } catch (e: any) {
        falhas++
        try {
          await capturaService.marcarErroItem(
            item.id,
            sessao.id,
            sessao.workspace_id,
            e?.message || 'Erro ao importar',
          )
        } catch {
          /* item manual/agrupado não existe no banco — segue */
        }
        setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'erro' } : i)))
      }
    }
    setImportando(false)
    // R5 — a sessão só vira 'importada' quando NÃO restar item pendente;
    // 'parcial' mantém o comportamento atual.
    const restamPendentesApos = itens.some(
      (i) => i.status !== 'importado' && !paraImportar.some((p) => p.id === i.id),
    )
    const statusSessao =
      ok > 0 && falhas === 0 && !restamPendentesApos ? 'importada' : ok > 0 ? 'parcial' : 'revisao'
    if (sessao) {
      await capturaService.atualizarSessao(sessao.id, sessao.workspace_id, {
        status: statusSessao as any,
      })
      await capturaService.registrarAuditoria(
        sessao.workspace_id,
        sessao.id,
        'importar',
        { ok, falhas },
        user?.id,
      )
    }
    toast({
      title: falhas === 0 ? `${ok} lançamento(s) criado(s)` : `${ok} criado(s), ${falhas} com erro`,
      description:
        falhas > 0
          ? 'Itens com erro ficam marcados para nova tentativa.'
          : 'Confira na tela Lançamentos.',
      variant: falhas > 0 ? 'destructive' : 'default',
    })
    carregarHistorico()
  }

  // ─────────────────────── Renderização ───────────────────────

  const selecionados = itens.filter((i) => i.selecionado)
  const somaSelecionados = selecionados.reduce((s, i) => s + i.valor, 0)
  const pendentes = itens.filter((i) => i.status !== 'importado')
  const somaItens = pendentes.reduce((s, i) => s + i.valor, 0)
  // R5 — itens já importados ficam numa seção recolhida; a revisão mostra só pendentes
  const importados = itens.filter((i) => i.status === 'importado')
  // T2 — Pronto = candidato completo (candidatoEstaCompleto é a fonte da verdade);
  // demais pendentes = A Revisar. Badge continua NÃO clicável.
  const itensParaRevisar = pendentes.filter((i) => {
    if (filtroRevisao === 'revisar') return !candidatoEstaCompleto(i)
    if (filtroRevisao === 'prontos') return candidatoEstaCompleto(i)
    return true
  })
  const restamPendentes = pendentes.length > 0
  // T1 — Diferença = Soma dos itens − (valor informado ?? total do OCR)
  const baseDiferenca =
    valorNfceInformado ?? (totalDocumento != null ? totalDocumento : null)
  const diferenca =
    baseDiferenca != null ? Number((somaItens - baseDiferenca).toFixed(2)) : null
  const botaoImportarLabel = restamPendentes
    ? `Importar selecionados (${selecionados.filter((i) => i.status !== 'importado').length})`
    : 'Importar selecionados'

  return (
    <div className="px-4 py-4 max-w-2xl mx-auto pb-24">
      {/* ETAPA 1 — escolha da trilha */}
      {etapa === 'trilha' && (
        <div className="space-y-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Capturar NFC-e / Cupom Fiscal</h1>
            <p className="text-xs text-slate-500 mt-0.5">Escolha a trilha do documento:</p>
          </div>
          {[
            {
              t: 'papel' as TrilhaCaptura,
              rotulo: 'Cupom fiscal em papel (foto)',
              dica: 'Cupom plano e reto, preenchendo o quadro, sem sombra nem reflexo. Cupom longo: várias fotos sequenciais.',
            },
            {
              t: 'digital' as TrilhaCaptura,
              rotulo: 'NFC-e digital (captura de tela)',
              dica: 'Capture a página com o BLOCO DE ITENS visível (texto azul). Role e capture de novo; não fotografe a tela do aparelho — use o screenshot.',
            },
          ].map((op) => (
            <Card key={op.t} className="border-slate-200">
              <CardContent className="p-4 space-y-2.5">
                <p className="font-semibold text-slate-900 text-sm">{op.rotulo}</p>
                <p className="text-xs text-slate-500">{op.dica}</p>
                <Button
                  onClick={() => iniciarSessao(op.t)}
                  className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-sm"
                >
                  Usar esta trilha
                </Button>
              </CardContent>
            </Card>
          ))}
          {historico.length > 0 && (
            <HistoricoCapturas historico={historico} onVer={(s) => setSessaoDetalhe(s)} />
          )}
        </div>
      )}

      {/* ETAPA 2 — capturando: bandeja de capturas */}
      {etapa === 'capturando' && sessao && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-slate-900">Bandeja de capturas</h1>
            <Badge variant="outline" className="text-[10px]">
              {trilha === 'papel' ? 'Papel (foto)' : 'Digital (tela)'}
            </Badge>
          </div>

          {imagens.length === 0 && (
            <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              {trilha === 'papel'
                ? 'Foto do cupom: plano, reto, preenchendo o quadro, sem sombra/reflexo. Cupom longo? Várias fotos sequenciais.'
                : 'Cole (Ctrl+V) a captura com o bloco de itens visível. Role a página e cole novas capturas; sobreposição é esperada.'}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={abrirCamera}
              variant="outline"
              className="h-11 flex-col gap-1 text-[11px]"
            >
              <Camera className="w-4 h-4" /> Câmera
            </Button>
            <Button
              onClick={abrirSelecionarArquivo}
              variant="outline"
              className="h-11 flex-col gap-1 text-[11px]"
            >
              <ImagePlus className="w-4 h-4" /> Selecionar
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-col gap-1 text-[11px]"
              onClick={() =>
                toast({
                  title: 'Ctrl+V colar',
                  description: 'Copie a imagem e pressione Ctrl+V nesta tela.',
                })
              }
            >
              <ClipboardPaste className="w-4 h-4" /> Colar
            </Button>
          </div>
          <input
            ref={inputArquivoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={aoEscolherArquivo}
          />

          {imagens.length > 0 && (
            <Card className="border-slate-200">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Capturas desta NFC-e ({imagens.length})
                </p>
                {imagens.map((im, idx) => (
                  <div
                    key={im.id}
                    className="flex items-center gap-2 border border-slate-100 rounded-lg p-2"
                  >
                    <span className="text-[10px] font-bold text-slate-400 w-4">{idx + 1}</span>
                    <img
                      src={im.url}
                      alt={`Captura ${idx + 1}`}
                      className="w-12 h-12 object-cover rounded border border-slate-200"
                    />
                    <div className="flex-1 flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] px-2"
                        onClick={() => visualizarImagem(im)}
                      >
                        <Eye className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] px-2"
                        onClick={() => {
                          setImagemEmBandeja(im)
                          setImagemRecorte(null)
                          setRecorteOrigem('bandeja')
                        }}
                      >
                        <Scissors className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] px-2 text-rose-600"
                        onClick={() => excluirImagemBandeja(im)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] px-2"
                        disabled={idx === 0}
                        onClick={() => moverImagem(idx, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] px-2"
                        disabled={idx === imagens.length - 1}
                        onClick={() => moverImagem(idx, 1)}
                      >
                        ↓
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <Button
              onClick={() => {
                setRecorteOrigem('nova')
                if (trilha === 'digital') abrirSelecionarArquivo()
                else abrirCamera()
              }}
              className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-sm"
            >
              <Plus className="w-4 h-4" /> Capturar próxima
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={processar}
                disabled={imagens.length === 0 || processando}
                className="h-11 bg-emerald-600 hover:bg-emerald-700 text-sm"
              >
                {processando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {imagens.length > 0 ? `Processar ${imagens.length} captura(s)` : 'Processar'}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/cartoes')}
                className="h-11 text-sm"
              >
                Cancelar
              </Button>
            </div>
          </div>

          {progresso && (
            <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 text-center">
              {progresso}
            </p>
          )}

          {historico.length > 0 && (
            <HistoricoCapturas historico={historico} onVer={(s) => setSessaoDetalhe(s)} />
          )}
        </div>
      )}

      {/* ETAPA 3 — revisão editável */}
      {etapa === 'revisao' && sessao && (
        <div className="space-y-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Revisão dos itens</h1>
            <p className="text-xs text-slate-500">
              Edite, marque e importe. Nada é lançado sem confirmação.
            </p>
          </div>

          <Card className="border-slate-200 bg-slate-50/60">
            <CardContent className="p-3 space-y-1">
              <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" /> Conferência informativa
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-600">
                <span>
                  Itens: <span className="font-semibold">{itens.length}</span>
                </span>
                <span>
                  Itens: <span className="font-semibold">{itens.length}</span>
                </span>
                <span>
                  Soma dos itens: <span className="font-semibold">{formatMoneyBRL(somaItens)}</span>
                </span>
                {/* T3 — soma dos itens SELECIONADOS em tempo real */}
                <span>
                  Soma dos itens selecionados:{' '}
                  <span className="font-semibold text-indigo-700">
                    {formatMoneyBRL(somaSelecionados)}
                  </span>
                </span>
                {diferenca != null && (
                  <span>
                    Diferença:{' '}
                    <span
                      className={`font-semibold ${
                        Math.abs(diferenca) < 0.01 ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {formatMoneyBRL(diferenca)}
                    </span>
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">
                A diferença é apenas informativa — nenhum lançamento é gerado automaticamente por
                ela. Revise itens ausentes ou duplicados e importe manualmente.
              </p>
           </CardContent>
          </Card>
            </CardContent>
          </Card>

          {itens.length === 0 && <p className="text-xs text-slate-500">Nenhum item reconhecido.</p>}
          {itens.length > 0 && !restamPendentes && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 font-medium">
              ✓ Todos os itens reconhecidos dessa captura foram importados.
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px]"
              onClick={() => selecionarTodos(true)}
            >
              <CheckSquare className="w-3 h-3" /> Todos
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px]"
              onClick={() => selecionarTodos(false)}
            >
              Limpar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px]"
              disabled={selecionados.length < 2}
              onClick={() => setAgruparAberto(true)}
            >
              <Layers className="w-3 h-3" /> Agrupar ({selecionados.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px]"
              disabled={selecionados.length === 0}
              onClick={() => setLoteAberto(true)}
            >
              <ClipboardList className="w-3 h-3" /> Lote
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px]"
              onClick={() => setItemManualAberto(true)}
            >
              <Plus className="w-3 h-3" /> Item manual
            </Button>
          </div>

          {/* T2 — filtro Todos / A Revisar / Prontos para importar */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { v: 'todos', r: 'Todos' },
                { v: 'revisar', r: 'A Revisar' },
                { v: 'prontos', r: 'Prontos para importar' },
              ] as const
            ).map((op) => (
              <button
                key={op.v}
                type="button"
                onClick={() => setFiltroRevisao(op.v)}
                className={`h-8 px-3 rounded-full border text-[11px] font-semibold transition-colors ${
                  filtroRevisao === op.v
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-300'
                }`}
              >
                {op.r}
              </button>
            ))}
            {filtroRevisao !== 'todos' && (
              <span className="text-[10px] text-slate-400">{itensParaRevisar.length} item(ns)</span>
            )}
          </div>

          {itens.length > 0 && itensParaRevisar.length === 0 && (
            <p className="text-xs text-slate-500">Nenhum item neste filtro.</p>
          )}
          {itensParaRevisar.map((item, i) => (
            <LinhaRevisaoCaptura
              key={item.id}
              item={item}
              indice={i}
              categorias={categorias}
              meiosPagamento={meios}
              onEditar={atualizarItem}
              onAlternarSelecao={(id) =>
                setItens((prev) =>
                  prev.map((x) => (x.id === id ? { ...x, selecionado: !x.selecionado } : x)),
                )
              }
              onAbrirDetalhes={abrirDetalhes}
              onExcluir={(id) => {
                const alvo = itens.find((x) => x.id === id)
                if (
                  sessao &&
                  alvo &&
                  !alvo.id.startsWith('manual_') &&
                  !alvo.id.startsWith('grupo_')
                ) {
                  capturaService
                    .excluirItem(id, sessao.id, sessao.workspace_id)
                    .catch(() => undefined)
                }
                setItens((prev) => prev.filter((x) => x.id !== id))
              }}
            />
          ))}

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              onClick={importar}
              disabled={
                importando ||
                !restamPendentes ||
                selecionados.filter((i) => i.status !== 'importado').length === 0
              }
              className="h-11 bg-emerald-600 hover:bg-emerald-700 text-sm"
            >
              {importando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckSquare className="w-4 h-4" />
              )}
              {importando ? 'Importando…' : botaoImportarLabel}
            </Button>
            <Button
              variant="outline"
              onClick={() => setEtapa('capturando')}
              className="h-11 text-sm"
            >
              Voltar às capturas
            </Button>
          </div>

          {/* R5 — itens já importados somem da revisão; seção recolhida p/ rastreio */}
          {importados.length > 0 && (
            <div className="border border-slate-200 rounded-lg">
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-semibold text-slate-600"
                onClick={() => setImportadosAbertos((v) => !v)}
              >
                <span>Itens já importados ({importados.length})</span>
                <span>{importadosAbertos ? '▲' : '▼'}</span>
              </button>
              {importadosAbertos && (
                <div className="px-3 pb-2 space-y-1">
                  {importados.map((im) => (
                    <p key={im.id} className="text-[11px] text-slate-500 flex justify-between">
                      <span className="truncate pr-2">{im.descricao}</span>
                      <span className="font-semibold shrink-0">{formatMoneyBRL(im.valor)}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {historico.length > 0 && (
            <HistoricoCapturas historico={historico} onVer={(s) => setSessaoDetalhe(s)} />
          )}
        </div>
      )}

      {/* Recorte (nova captura ou da bandeja) */}
      {imagemRecorte && recorteOrigem === 'nova' && (
        <Dialog open={!!imagemRecorte} onOpenChange={(o) => !o && setImagemRecorte(null)}>
          <DialogContent className="max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-slate-900">Recorte a região do cupom</DialogTitle>
              <DialogDescription>
                Arraste para selecionar a área do documento. Ajuste antes de adicionar à bandeja.
              </DialogDescription>
            </DialogHeader>
            <EditorRecorte
              imagemSrc={imagemRecorte}
              onConfirmar={confirmarRecorteNova}
              onCancelar={() => setImagemRecorte(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {imagemEmBandeja && recorteOrigem === 'bandeja' && (
        <Dialog open={!!imagemEmBandeja} onOpenChange={(o) => !o && setImagemEmBandeja(null)}>
          <DialogContent className="max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-slate-900">Recortar novamente esta captura</DialogTitle>
              <DialogDescription>
                A captura atual será substituída pela região recortada.
              </DialogDescription>
            </DialogHeader>
            <EditorRecorte
              imagemSrc={imagemEmBandeja.url}
              onConfirmar={confirmarRecorteBandeja}
              onCancelar={() => setImagemEmBandeja(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Câmera getUserMedia com fallback */}
      <Dialog open={cameraAberta} onOpenChange={(o) => !o && setCameraAberta(false)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Câmera</DialogTitle>
            <DialogDescription>Captura direta do cupom (câmera traseira).</DialogDescription>
          </DialogHeader>
          <CapturaCamera
            onCapturar={(dataUrl) => {
              setCameraAberta(false)
              setRecorteOrigem('nova')
              setImagemRecorte(dataUrl)
            }}
            onFechar={() => setCameraAberta(false)}
          />
        </DialogContent>
      </Dialog>

      <ModalLoteCaptura
        aberto={loteAberto}
        onFechar={() => setLoteAberto(false)}
        onAplicar={aplicarLote}
        meiosPagamento={meios}
      />
      <ModalAgruparCaptura
        aberto={agruparAberto}
        onFechar={() => setAgruparAberto(false)}
        onConfirmar={agrupar}
        quantidadeItens={selecionados.length}
        somaSelecionados={somaSelecionados}
      />

      {/* Item manual */}
      <Dialog open={itemManualAberto} onOpenChange={setItemManualAberto}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Adicionar item manual</DialogTitle>
            <DialogDescription>Para itens que o OCR não reconheceu.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Input
                value={descManual}
                onChange={(e) => setDescManual(e.target.value)}
                className="h-9"
                placeholder="Ex.: Pão francês"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor (R$)</Label>
              <Input
                value={valManual}
                onChange={(e) => setValManual(e.target.value)}
                inputMode="decimal"
                className="h-9"
                placeholder="0,00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemManualAberto(false)} className="h-9">
              Cancelar
            </Button>
            <Button onClick={addItemManual} className="h-9 bg-indigo-600 hover:bg-indigo-700">
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModalDetalheSessaoCaptura sessao={sessaoDetalhe} onFechar={() => setSessaoDetalhe(null)} />

      {/* R6 — Detalhes = janela do Novo Lançamento em MODO CAPTURA:
          salva SOMENTE no candidato (atualizarItem), nunca cria lançamento. */}
      {sessao && !carregandoContasCartoes && (
        <ModalDetalheItemCaptura
          item={itemDetalhe}
          open={!!itemDetalhe}
          onOpenChange={(o) => !o && setItemDetalheId(null)}
          sessaoId={sessao.id}
          workspaceId={sessao.workspace_id || workspaceId}
          contas={contas}
          cartoes={cartoes}
          categorias={categorias}
          subcategorias={subcategorias}
          userId={user?.id}
          onGravado={(id, patch) => atualizarItem(id, patch)}
        />
      )}
    </div>
  )
}

/** Histórico "Capturas recentes" — 5 sessões no total, todos os tipos (BLOCO 21). */
function HistoricoCapturas({
  historico,
  onVer,
}: {
  historico: CapturaSessao[]
  onVer: (s: CapturaSessao) => void
}) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-3 space-y-2">
        <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" /> Capturas recentes (últimas {LIMITE_SESSOES_RECENTES})
        </p>
        {historico.map((s) => (
          <div key={s.id} className="border border-slate-100 rounded-lg p-2.5 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-800">
                {rotuloTipoDocumento(s.tipo_documento)} •{' '}
                {s.data_captura
                  ? new Date(s.data_captura + 'T12:00:00').toLocaleDateString('pt-BR')
                  : '—'}
              </p>
              <Badge variant="outline" className="text-[10px]">
                {rotuloStatusSessao(s.status)}
              </Badge>
            </div>
            {s.meio_pagamento_nome && (
              <p className="text-[11px] text-slate-600">
                Pago com: <span className="font-semibold">{s.meio_pagamento_nome}</span>
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-slate-400">
                {s.quantidade_imagens} imagem(ns) • {s.quantidade_itens} item(ns)
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => onVer(s)}
              >
                Visualizar
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default function CapturarNfcePage() {
  return (
    <CapturaNfceErrorBoundary>
      <CapturarNfceConteudo />
    </CapturaNfceErrorBoundary>
  )
}
