/**
 * Serviço de captura de documentos (NFC-e / Cupom Fiscal) — SAP v0.0.98
 *
 * Domínio CAPTURA/DOCUMENTO (imagem, OCR, recorte, sessão, itens candidatos).
 * NUNCA cria lançamento financeiro — isso é papel dos services existentes
 * (lancamentoService), chamados somente após confirmação do usuário.
 */

import { supabase as db } from '@/lib/supabase/client'
import { auditoriaService } from '@/services/sap'
import type { TrilhaCaptura } from '@/services/captura/nfceParser'

export type TipoDocumentoCaptura = 'nfce' | 'fatura' | 'nfe'
export type StatusSessaoCaptura =
  | 'capturando'
  | 'processando'
  | 'revisao'
  | 'importada'
  | 'parcial'
  | 'erro'

export const BUCKET_CAPTURAS = 'capturas'
/** Mantém as 5 sessões mais recentes NO TOTAL (todos os tipos — BLOCO 19). */
export const LIMITE_SESSOES_RECENTES = 5

export interface CapturaSessao {
  id: string
  workspace_id: string
  tipo_documento: string
  trilha: TrilhaCaptura
  status: StatusSessaoCaptura
  data_captura: string | null
  data_documento: string | null
  meio_pagamento_id: string | null
  meio_pagamento_tipo: string | null
  meio_pagamento_nome: string | null
  valor_total_documento: number | null
  quantidade_imagens: number
  quantidade_itens: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CapturaSessaoImagem {
  id: string
  sessao_id: string
  ordem: number
  storage_path: string
  recorte: { x: number; y: number; w: number; h: number } | null
  trilha: TrilhaCaptura
  created_at: string
}

export interface CapturaSessaoItem {
  id: string
  sessao_id: string
  ordem: number
  selecionado: boolean
  descricao: string
  valor: number
  status: string
  confianca: string
  repetido_entre_capturas: boolean
  data: string | null
  meio_pagamento_id: string | null
  meio_pagamento_tipo: string | null
  meio_pagamento_nome: string | null
  categoria_id: string | null
  subcategoria_id: string | null
  modalidade_saida: string | null
  valor_proprio: number | null
  valor_terceiros: number | null
  afeta_resultado: boolean
  afeta_orcamento: boolean
  observacao: string | null
  lancamento_criado_id: string | null
  mensagem_erro: string | null
  created_at: string
  updated_at: string
}

const COLUNAS_SESSAO = `
  id, workspace_id, tipo_documento, trilha, status, data_captura, data_documento,
  meio_pagamento_id, meio_pagamento_tipo, meio_pagamento_nome,
  valor_total_documento, quantidade_imagens, quantidade_itens,
  created_by, created_at, updated_at
`

function dataHoje(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Porto_Velho',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Formata tipo da sessão para exibição no histórico (BLOCO 21). */
export function rotuloTipoDocumento(tipo: string): string {
  switch (tipo) {
    case 'nfce':
      return 'NFC-e'
    case 'nfe':
      return 'NF-e'
    case 'fatura':
      return 'Fatura de Cartão'
    default:
      return tipo || 'Documento'
  }
}

export function rotuloStatusSessao(status: string): string {
  switch (status) {
    case 'capturando':
      return 'Capturando'
    case 'processando':
      return 'Processando'
    case 'revisao':
      return 'Revisão'
    case 'importada':
      return 'Importada'
    case 'parcial':
      return 'Parcial'
    case 'erro':
      return 'Erro'
    default:
      return status
  }
}

export const capturaService = {
  // ───────────────────────────── Storage ─────────────────────────────

  /** Upload da imagem (JPEG) em path por workspace/sessão. Bucket PRIVADO. */
  async uploadImagem(
    workspaceId: string,
    sessaoId: string,
    blob: Blob,
    ordem: number,
  ): Promise<string> {
    const path = `${workspaceId}/${sessaoId}/parte_${ordem}_${Date.now()}.jpg`
    const { error } = await db.storage.from(BUCKET_CAPTURAS).upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    })
    if (error) throw error
    return path
  },

  /** URL ASSINADA de curta duração — nunca URL pública (BLOCO 26). */
  async urlAssinada(storagePath: string, segundos = 300): Promise<string> {
    const { data, error } = await db.storage
      .from(BUCKET_CAPTURAS)
      .createSignedUrl(storagePath, segundos)
    if (error) throw error
    return data.signedUrl
  },

  async excluirArquivosStorage(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    const { error } = await db.storage.from(BUCKET_CAPTURAS).remove(paths)
    if (error) throw error
  },

  // ───────────────────────────── Sessões ─────────────────────────────

  async criarSessao(
    workspaceId: string,
    dados: {
      tipo_documento: TipoDocumentoCaptura
      trilha: TrilhaCaptura
      meio_pagamento_id?: string | null
      meio_pagamento_tipo?: string | null
      meio_pagamento_nome?: string | null
      data_documento?: string | null
      data_captura?: string | null
      valor_total_documento?: number | null
      created_by?: string | null
    },
  ): Promise<CapturaSessao> {
    const { data, error } = await db
      .from('captura_sessoes')
      .insert({
        workspace_id: workspaceId,
        tipo_documento: dados.tipo_documento,
        trilha: dados.trilha,
        status: 'capturando',
        data_captura: dados.data_captura || dataHoje(),
        data_documento: dados.data_documento || null,
        meio_pagamento_id: dados.meio_pagamento_id || null,
        meio_pagamento_tipo: dados.meio_pagamento_tipo || null,
        meio_pagamento_nome: dados.meio_pagamento_nome || null,
        valor_total_documento: dados.valor_total_documento ?? null,
        created_by: dados.created_by || null,
      })
      .select(COLUNAS_SESSAO)
      .single()
    if (error) throw error
    return data as CapturaSessao
  },

  async atualizarSessao(
    sessaoId: string,
    workspaceId: string,
    updates: Partial<{
      status: StatusSessaoCaptura
      data_documento: string | null
      meio_pagamento_id: string | null
      meio_pagamento_tipo: string | null
      meio_pagamento_nome: string | null
      valor_total_documento: number | null
      quantidade_itens: number
    }>,
  ): Promise<void> {
    const { error } = await db
      .from('captura_sessoes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', sessaoId)
      .eq('workspace_id', workspaceId)
    if (error) throw error
  },

  async getSessao(sessaoId: string, workspaceId: string): Promise<CapturaSessao | null> {
    const { data, error } = await db
      .from('captura_sessoes')
      .select(COLUNAS_SESSAO)
      .eq('id', sessaoId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (error) throw error
    return (data as CapturaSessao) || null
  },

  /** Histórico: sessões mais recentes (todos os tipos — BLOCO 19). */
  async listarRecentes(
    workspaceId: string,
    limite = LIMITE_SESSOES_RECENTES,
  ): Promise<CapturaSessao[]> {
    const { data, error } = await db
      .from('captura_sessoes')
      .select(COLUNAS_SESSAO)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limite)
    if (error) throw error
    return (data || []) as CapturaSessao[]
  },

  async listarImagens(sessaoId: string, workspaceId: string): Promise<CapturaSessaoImagem[]> {
    const { data, error } = await db
      .from('captura_sessao_imagens')
      .select('id, sessao_id, ordem, storage_path, recorte, trilha, created_at')
      .eq('sessao_id', sessaoId)
      .eq('workspace_id', workspaceId)
      .order('ordem', { ascending: true })
    if (error) throw error
    return (data || []) as CapturaSessaoImagem[]
  },

  async listarItens(sessaoId: string, workspaceId: string): Promise<CapturaSessaoItem[]> {
    const { data, error } = await db
      .from('captura_sessao_itens')
      .select('*')
      .eq('sessao_id', sessaoId)
      .eq('workspace_id', workspaceId)
      .order('ordem', { ascending: true })
    if (error) throw error
    return (data || []) as CapturaSessaoItem[]
  },

  async inserirImagem(
    sessaoId: string,
    workspaceId: string,
    storagePath: string,
    ordem: number,
    trilha: TrilhaCaptura,
    recorte: { x: number; y: number; w: number; h: number } | null,
  ): Promise<CapturaSessaoImagem> {
    const { data, error } = await db
      .from('captura_sessao_imagens')
      .insert({
        sessao_id: sessaoId,
        workspace_id: workspaceId,
        ordem,
        storage_path: storagePath,
        recorte,
        trilha,
      })
      .select('id, sessao_id, ordem, storage_path, recorte, trilha, created_at')
      .single()
    if (error) throw error
    const { error: errUpd } = await db
      .from('captura_sessoes')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessaoId)
      .eq('workspace_id', workspaceId)
    if (errUpd) throw errUpd
    return data as CapturaSessaoImagem
  },

  async reordenarImagens(sessaoId: string, workspaceId: string, ordemIds: string[]): Promise<void> {
    for (let i = 0; i < ordemIds.length; i++) {
      const { error } = await db
        .from('captura_sessao_imagens')
        .update({ ordem: i })
        .eq('id', ordemIds[i])
        .eq('sessao_id', sessaoId)
        .eq('workspace_id', workspaceId)
      if (error) throw error
    }
  },

  async excluirImagem(imagemId: string, sessaoId: string, workspaceId: string): Promise<void> {
    const { data: img } = await db
      .from('captura_sessao_imagens')
      .select('storage_path')
      .eq('id', imagemId)
      .eq('sessao_id', sessaoId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (img?.storage_path) {
      try {
        await this.excluirArquivosStorage([img.storage_path])
      } catch (e) {
        console.warn('Falha ao remover arquivo do Storage:', e)
      }
    }
    const { error } = await db
      .from('captura_sessao_imagens')
      .delete()
      .eq('id', imagemId)
      .eq('sessao_id', sessaoId)
      .eq('workspace_id', workspaceId)
    if (error) throw error
  },

  // ───────────────────────────── Itens ─────────────────────────────

  /**
   * Persiste os candidatos revisados da sessão. Itens anteriores SEM
   * lançamento criado são apagados (candidatos descartados); itens já
   * importados ficam intocados (rastreabilidade).
   */
  async substituirItens(
    sessaoId: string,
    workspaceId: string,
    itens: Array<{
      descricao: string
      valor: number
      status?: string
      confianca?: string
      repetido_entre_capturas?: boolean
      data?: string | null
      meio_pagamento_id?: string | null
      meio_pagamento_tipo?: string | null
      meio_pagamento_nome?: string | null
      categoria_id?: string | null
      subcategoria_id?: string | null
      modalidade_saida?: string | null
      valor_proprio?: number | null
      valor_terceiros?: number | null
      afeta_resultado?: boolean | null
      afeta_orcamento?: boolean | null
      observacao?: string | null
    }>,
  ): Promise<CapturaSessaoItem[]> {
    await db
      .from('captura_sessao_itens')
      .delete()
      .eq('sessao_id', sessaoId)
      .eq('workspace_id', workspaceId)
      .is('lancamento_criado_id', null)

    if (itens.length === 0) {
      await this.atualizarSessao(sessaoId, workspaceId, { quantidade_itens: 0 })
      return []
    }
    const { data, error } = await db
      .from('captura_sessao_itens')
      .insert(
        itens.map((i, idx) => ({
          sessao_id: sessaoId,
          workspace_id: workspaceId,
          ordem: idx + 1,
          selecionado: true,
          descricao: i.descricao,
          valor: i.valor,
          status: i.status || 'pronto',
          confianca: i.confianca || 'alta',
          repetido_entre_capturas: Boolean(i.repetido_entre_capturas),
          data: i.data || null,
          meio_pagamento_id: i.meio_pagamento_id || null,
          meio_pagamento_tipo: i.meio_pagamento_tipo || null,
          meio_pagamento_nome: i.meio_pagamento_nome || null,
          categoria_id: i.categoria_id || null,
          subcategoria_id: i.subcategoria_id || null,
          modalidade_saida: i.modalidade_saida || 'compra_propria',
          valor_proprio: i.valor_proprio ?? null,
          valor_terceiros: i.valor_terceiros ?? null,
          afeta_resultado: i.afeta_resultado ?? true,
          afeta_orcamento: i.afeta_orcamento ?? true,
          observacao: i.observacao || null,
        })),
      )
      .select('*')
    if (error) throw error
    await this.atualizarSessao(sessaoId, workspaceId, { quantidade_itens: itens.length })
    return (data || []) as CapturaSessaoItem[]
  },

  async atualizarItem(
    itemId: string,
    sessaoId: string,
    workspaceId: string,
    updates: Partial<{
      selecionado: boolean
      descricao: string
      valor: number
      status: string
      data: string | null
      meio_pagamento_id: string | null
      meio_pagamento_tipo: string | null
      meio_pagamento_nome: string | null
      categoria_id: string | null
      subcategoria_id: string | null
      modalidade_saida: string | null
      valor_proprio: number | null
      valor_terceiros: number | null
      afeta_resultado: boolean
      afeta_orcamento: boolean
      observacao: string | null
    }>,
  ): Promise<void> {
    const { error } = await db
      .from('captura_sessao_itens')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('sessao_id', sessaoId)
      .eq('workspace_id', workspaceId)
    if (error) throw error
  },

  async excluirItem(itemId: string, sessaoId: string, workspaceId: string): Promise<void> {
    const { error } = await db
      .from('captura_sessao_itens')
      .delete()
      .eq('id', itemId)
      .eq('sessao_id', sessaoId)
      .eq('workspace_id', workspaceId)
    if (error) throw error
  },

  /**
   * IMPORTAÇÃO DEFINITIVA: vincula o item ao lançamento criado pelo service
   * financeiro existente (rastreabilidade sessão → candidato → lançamento,
   * BLOCO 23). O lançamento é criado pelo lancamentoService; aqui só registra.
   */
  async vincularLancamento(
    itemId: string,
    sessaoId: string,
    workspaceId: string,
    lancamentoId: string,
  ): Promise<void> {
    const { error } = await db
      .from('captura_sessao_itens')
      .update({ lancamento_criado_id: lancamentoId, status: 'importado' })
      .eq('id', itemId)
      .eq('sessao_id', sessaoId)
      .eq('workspace_id', workspaceId)
    if (error) throw error
  },

  /** Marca o item com erro de importação (orientado ao usuário). */
  async marcarErroItem(
    itemId: string,
    sessaoId: string,
    workspaceId: string,
    mensagem: string,
  ): Promise<void> {
    const { error } = await db
      .from('captura_sessao_itens')
      .update({ status: 'erro', mensagem_erro: mensagem })
      .eq('id', itemId)
      .eq('sessao_id', sessaoId)
      .eq('workspace_id', workspaceId)
    if (error) throw error
  },

  // ────────────────────── Limpeza (BLOCO 19/24) ──────────────────────

  /**
   * Mantém as N sessões mais recentes; remove a mais antiga (registro +
   * arquivos do Storage). REGRA CRÍTICA: nunca exclui lançamentos —
   * lancamento_criado_id é rastreabilidade sem FK; o cascade das tabelas de
   * captura não toca a tabela lancamentos.
   */
  async limparSessoesAntigas(
    workspaceId: string,
    limite = LIMITE_SESSOES_RECENTES,
  ): Promise<number> {
    const { data: todas, error } = await db
      .from('captura_sessoes')
      .select('id, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    if (error) throw error
    const lista = todas || []
    if (lista.length <= limite) return 0
    const aRemover = lista.slice(limite).map((s: any) => s.id)
    for (const sid of aRemover) {
      await this.excluirSessao(sid, workspaceId)
    }
    return aRemover.length
  },

  /** Exclusão REAL: arquivos do Storage + linhas (cascade) + sessão. */
  async excluirSessao(sessaoId: string, workspaceId: string): Promise<void> {
    const imagens = await this.listarImagens(sessaoId, workspaceId)
    try {
      await this.excluirArquivosStorage(imagens.map((i) => i.storage_path))
    } catch (e) {
      console.warn('Arquivos já removidos ou inacessíveis:', e)
    }
    const { error } = await db
      .from('captura_sessoes')
      .delete()
      .eq('id', sessaoId)
      .eq('workspace_id', workspaceId)
    if (error) throw error
  },

  async registrarAuditoria(
    workspaceId: string,
    sessaoId: string,
    acao: string,
    estado: Record<string, unknown>,
    userId?: string | null,
  ): Promise<void> {
    try {
      await auditoriaService.registrar({
        workspace_id: workspaceId,
        entidade: 'captura_sessoes',
        entidade_id: sessaoId,
        acao,
        estado_posterior: estado,
        created_by: userId || null,
      })
    } catch (e) {
      console.warn('Auditoria de captura não registrada:', e)
    }
  },
}
