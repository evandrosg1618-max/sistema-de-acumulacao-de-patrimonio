import { supabase } from '@/lib/supabase/client'
import { ParserResult, LinhaFaturaExtraida, StatusLinhaFatura } from '@/types/faturaPdf'
import { extrairPadraoBuscaAprendizado } from './pdf/normalizadorEstabelecimento'
import { lancamentoService, auditoriaService } from '@/services/sap'

export interface FaturaImportacaoRegistro {
  id: string
  workspace_id: string
  cartao_id: string
  arquivo_nome: string
  arquivo_hash: string
  emissor_detectado: string | null
  competencia: string | null
  data_vencimento: string | null
  data_fechamento: string | null
  valor_total_fatura: number
  moeda: string
  quantidade_itens: number
  pdf_protegido: boolean
  titulares_encontrados: string[]
  finais_encontrados: string[]
  status: 'em_revisao' | 'concluida' | 'cancelada' | 'descartada'
  created_at: string
}

export interface FaturaImportacaoLinhaRegistro {
  id: string
  importacao_id: string
  workspace_id: string
  ordem: number
  selecionado: boolean
  status: StatusLinhaFatura
  tipo_linha: string
  tratamento: string
  data: string
  descricao_original: string
  descricao_normalizada: string
  descricao_editavel: string
  valor: number
  parcela_atual: number | null
  total_parcelas: number | null
  valor_parcela: number | null
  valor_total_estimado: number | null
  marcar_historicas_anteriores: boolean
  categoria_id: string | null
  subcategoria_id: string | null
  modalidade_saida: string
  valor_proprio: number | null
  valor_terceiros: number | null
  afeta_resultado: boolean
  afeta_orcamento: boolean
  final_cartao: string | null
  titular: string | null
  observacao: string | null
  origem_classificacao: string
  regra_aprendida_id: string | null
  correspondencia_id: string | null
  correspondencia_tipo: string | null
  lancamento_criado_id: string | null
  mensagem_erro: string | null
}

export interface RegraClassificacao {
  id: string
  workspace_id: string
  padrao_busca: string
  descricao_sugerida?: string
  categoria_id?: string
  subcategoria_id?: string
  modalidade_saida?: string
  afeta_resultado?: boolean
  afeta_orcamento?: boolean
  vezes_utilizada: number
}

export const faturaImportacaoService = {
  /**
   * Verifica se já existe importação concluída ou em andamento com este hash.
   */
  async verificarHashExistente(
    workspaceId: string,
    hash: string,
  ): Promise<FaturaImportacaoRegistro | null> {
    const { data, error } = await supabase
      .from('fatura_importacoes' as any)
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('arquivo_hash', hash)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('Erro ao verificar hash:', error)
      return null
    }
    return (data as unknown as FaturaImportacaoRegistro) || null
  },

  /**
   * Busca regras de aprendizado de classificação cadastradas no workspace.
   */
  async carregarRegrasAprendizado(workspaceId: string): Promise<RegraClassificacao[]> {
    const { data, error } = await supabase
      .from('regras_classificacao_fatura' as any)
      .select('*')
      .eq('workspace_id', workspaceId)

    if (error) {
      console.warn('Erro ao carregar regras:', error)
      return []
    }
    return (data as unknown as RegraClassificacao[]) || []
  },

  /**
   * Salva ou incrementa uma regra de aprendizado quando o usuário confirma uma classificação.
   */
  async aprenderClassificacao(
    workspaceId: string,
    descricao: string,
    categoriaId: string,
    subcategoriaId: string,
    modalidadeSaida: string,
    afetaResultado: boolean,
    afetaOrcamento: boolean,
    userId?: string,
  ): Promise<void> {
    const padrao = extrairPadraoBuscaAprendizado(descricao)
    if (!padrao || padrao.length < 3) return

    try {
      const { data: existente } = await supabase
        .from('regras_classificacao_fatura' as any)
        .select('id, vezes_utilizada')
        .eq('workspace_id', workspaceId)
        .eq('padrao_busca', padrao)
        .maybeSingle()

      if (existente) {
        await supabase
          .from('regras_classificacao_fatura' as any)
          .update({
            categoria_id: categoriaId,
            subcategoria_id: subcategoriaId,
            modalidade_saida: modalidadeSaida,
            afeta_resultado: afetaResultado,
            afeta_orcamento: afetaOrcamento,
            vezes_utilizada: ((existente as any).vezes_utilizada || 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', (existente as any).id)
      } else {
        await supabase.from('regras_classificacao_fatura' as any).insert({
          workspace_id: workspaceId,
          padrao_busca: padrao,
          categoria_id: categoriaId,
          subcategoria_id: subcategoriaId,
          modalidade_saida: modalidadeSaida,
          afeta_resultado: afetaResultado,
          afeta_orcamento: afetaOrcamento,
          created_by: userId,
        })
      }
    } catch (e) {
      console.warn('Falha silenciosa ao persistir regra aprendida:', e)
    }
  },

  /**
   * Cria uma nova sessão de importação e suas linhas temporárias, aplicando:
   * - Aprendizado de classificação
   * - Detecção de duplicidade (mesma linha no PDF e no banco)
   * - Conciliação com parcelas existentes no SAP
   */
  async criarSessaoImportacao(params: {
    workspaceId: string
    cartaoId: string
    arquivoNome: string
    arquivoHash: string
    parsed: ParserResult
    userId?: string
  }): Promise<{ importacaoId: string; linhas: FaturaImportacaoLinhaRegistro[] }> {
    const { workspaceId, cartaoId, arquivoNome, arquivoHash, parsed, userId } = params

    // Inserir registro mestre
    // REGRA C2: Uma sessão ativa por cartão.
    // Ao processar nova fatura de um cartão que já possui sessão em processamento,
    // a sessão anterior daquele cartão é descartada (marcada como descartada sem apagar auditoria).
    // O que já foi EFETIVADO de sessões anteriores no banco permanece.
    await this.descartarSessoesEmRevisaoDoCartao(workspaceId, cartaoId)

    // Inserir registro mestre
    const { data: impData, error: impError } = await supabase
      .from('fatura_importacoes' as any)
      .insert({
        workspace_id: workspaceId,
        cartao_id: cartaoId,
        arquivo_nome: arquivoNome,
        arquivo_hash: arquivoHash,
        emissor_detectado: parsed.cabecalho.emissor,
        competencia: parsed.cabecalho.competencia || null,
        data_vencimento: parsed.cabecalho.vencimento || null,
        data_fechamento: parsed.cabecalho.fechamento || null,
        valor_total_fatura: parsed.cabecalho.valorTotalFatura || 0,
        moeda: parsed.cabecalho.moeda,
        quantidade_itens: parsed.linhas.length,
        pdf_protegido: parsed.cabecalho.pdfProtegido,
        titulares_encontrados: parsed.cabecalho.titulares,
        finais_encontrados: parsed.cabecalho.finais,
        status: 'em_revisao',
        created_by: userId,
      })
      .select()
      .single()

    if (impError || !impData) {
      throw new Error(`Falha ao criar sessão de importação: ${impError?.message}`)
    }

    const importacaoId = (impData as any).id

    // Carregar regras aprendidas para classificar previamente
    const regras = await this.carregarRegrasAprendizado(workspaceId)

    // Carregar lançamentos e parcelas existentes deste cartão para conciliação e duplicidade
    const { data: lancamentosExistentes } = await (supabase
      .from('lancamentos')
      .select(
        'id, data, descricao, valor, numero_parcela, total_parcelas, lancamento_pai_id, status_pagamento',
      )
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .is('deleted_at', null) as any)

    const mapaExistentes = (lancamentosExistentes || []) as Array<{
      id: string
      data: string
      descricao: string
      valor: number
      numero_parcela: number | null
      total_parcelas: number | null
      lancamento_pai_id: string | null
      status_pagamento: string
    }>

    // Montar linhas temporárias com verificação de duplicidade interna na própria fatura (ex: DL*iHerb repetido)
    const linhasVistasNestaFatura = new Set<string>()

    const linhasParaInserir = parsed.linhas.map((l: LinhaFaturaExtraida) => {
      let status: StatusLinhaFatura = 'novo'
      let categoriaId: string | null = null
      let subcategoriaId: string | null = null
      let modalidadeSaida = 'compra_propria'
      let afetaResultado = true
      let afetaOrcamento = true
      let origemClassificacao = 'padrao'
      let regraId: string | null = null
      let correspondenciaId: string | null = null
      let correspondenciaTipo: string | null = null

      // 1. Tentar aplicar regra aprendida
      const padraoLinha = extrairPadraoBuscaAprendizado(l.descricaoOriginal)
      const regraEncontrada = regras.find(
        (r) => padraoLinha.includes(r.padrao_busca) || r.padrao_busca.includes(padraoLinha),
      )

      if (regraEncontrada) {
        categoriaId = regraEncontrada.categoria_id || null
        subcategoriaId = regraEncontrada.subcategoria_id || null
        modalidadeSaida = regraEncontrada.modalidade_saida || 'compra_propria'
        afetaResultado = regraEncontrada.afeta_resultado ?? true
        afetaOrcamento = regraEncontrada.afeta_orcamento ?? true
        origemClassificacao = 'regra_aprendida'
        regraId = regraEncontrada.id
        status = 'preenchido_regra'
      }

      // 2. Conciliação de parcelas (BLOCO 24)
      if (l.parcelaAtual && l.totalParcelas) {
        const matchParcela = mapaExistentes.find(
          (e) =>
            e.numero_parcela === l.parcelaAtual &&
            e.total_parcelas === l.totalParcelas &&
            Math.abs(e.valor - l.valor) < 0.05,
        )

        if (matchParcela) {
          status = 'conciliado'
          correspondenciaId = matchParcela.id
          correspondenciaTipo = 'parcela'
        }
      }

      // 3. Duplicidade de linha (BLOCO 25 e BLOCO K)
      // Camada 1: Linha repetida exatamente idêntica dentro do mesmo PDF (ex: DL*iHerb)
      const chaveInterna = `${l.data}_${l.valor}_${l.descricaoOriginal.trim()}_${l.parcelaAtual || 0}`
      if (linhasVistasNestaFatura.has(chaveInterna)) {
        status = 'provavel_duplicado'
        correspondenciaTipo = 'linha_duplicada_no_pdf'
      } else {
        linhasVistasNestaFatura.add(chaveInterna)
      }

      // Camada 2: Comparação com lançamentos já existentes no SAP
      if (status !== 'conciliado' && status !== 'provavel_duplicado') {
        const matchDuplicado = mapaExistentes.find(
          (e) =>
            e.data === l.data &&
            Math.abs(e.valor - l.valor) < 0.05 &&
            (e.descricao.toUpperCase().includes(l.descricaoNormalizada.toUpperCase()) ||
              l.descricaoNormalizada.toUpperCase().includes(e.descricao.toUpperCase())),
        )

        if (matchDuplicado) {
          status = 'provavel_duplicado'
          correspondenciaId = matchDuplicado.id
          correspondenciaTipo = 'lancamento'
        }
      }

      // Tratamento especial para linhas de crédito
      if (l.tipo === 'credito') {
        afetaResultado = false
        afetaOrcamento = false
      }

      return {
        importacao_id: importacaoId,
        workspace_id: workspaceId,
        ordem: l.ordem,
        selecionado: status === 'novo' || status === 'preenchido_regra',
        status,
        tipo_linha: l.tipo,
        tratamento: l.tratamento,
        data: l.data,
        descricao_original: l.descricaoOriginal,
        descricao_normalizada: l.descricaoNormalizada,
        descricao_editavel: l.descricaoNormalizada || l.descricaoOriginal,
        valor: l.valor,
        parcela_atual: l.parcelaAtual || null,
        total_parcelas: l.totalParcelas || null,
        valor_parcela: l.valorParcela || null,
        valor_total_estimado: l.valorTotalEstimado || l.valor,
        marcar_historicas_anteriores: true,
        categoria_id: categoriaId,
        subcategoria_id: subcategoriaId,
        modalidade_saida: modalidadeSaida,
        valor_proprio: l.valor,
        valor_terceiros: 0.0,
        afeta_resultado: afetaResultado,
        afeta_orcamento: afetaOrcamento,
        final_cartao: l.finalCartao || null,
        titular: l.titular || null,
        origem_classificacao: origemClassificacao,
        regra_aprendida_id: regraId,
        correspondencia_id: correspondenciaId,
        correspondencia_tipo: correspondenciaTipo,
      }
    })

    const { data: linhasInseridas, error: linhasError } = await supabase
      .from('fatura_importacao_linhas' as any)
      .insert(linhasParaInserir)
      .select()

    if (linhasError) {
      throw new Error(`Falha ao inserir linhas temporárias: ${linhasError.message}`)
    }

    return {
      importacaoId,
      linhas: (linhasInseridas as unknown as FaturaImportacaoLinhaRegistro[]) || [],
    }
  },

  /**
   * Carrega uma sessão temporária existente com suas linhas.
   */
  async obterSessao(
    workspaceId: string,
    importacaoId: string,
  ): Promise<{
    importacao: FaturaImportacaoRegistro
    linhas: FaturaImportacaoLinhaRegistro[]
  }> {
    const { data: imp, error: impErr } = await supabase
      .from('fatura_importacoes' as any)
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('id', importacaoId)
      .single()

    if (impErr || !imp) {
      throw new Error('Sessão de importação não encontrada.')
    }

    const { data: linhas, error: lErr } = await supabase
      .from('fatura_importacao_linhas' as any)
      .select('*')
      .eq('importacao_id', importacaoId)
      .order('ordem', { ascending: true })

    if (lErr) {
      throw new Error('Falha ao carregar linhas da sessão.')
    }

    return {
      importacao: imp as unknown as FaturaImportacaoRegistro,
      linhas: (linhas as unknown as FaturaImportacaoLinhaRegistro[]) || [],
    }
  },

  /**
   * M3 — Exclui (descarta definitivamente) uma linha capturada da revisão da fatura.
   * O banco é a fonte da verdade: a linha é REMOVIDA da tabela fatura_importacao_linhas
   * (RLS do workspace garante o escopo) e a exclusão é auditada.
   */
  async excluirLinha(linhaId: string, workspaceId: string): Promise<void> {
    const { error } = await supabase
      .from('fatura_importacao_linhas' as any)
      .delete()
      .eq('id', linhaId)
      .eq('workspace_id', workspaceId)

    if (error) {
      throw new Error(`Não foi possível excluir o item: ${error.message}`)
    }

    try {
      await auditoriaService.registrar({
        workspace_id: workspaceId,
        entidade: 'fatura_importacao_linhas',
        entidade_id: linhaId,
        acao: 'EXCLUIR_LINHA_REVISAO_FATURA',
        estado_posterior: { linhaId, excluidaEm: new Date().toISOString() },
      })
    } catch (e) {
      // Auditoria é best-effort: a exclusão em si já foi persistida.
      console.warn('Falha ao registrar auditoria da exclusão de linha:', e)
    }
  },

  /**
   * Atualiza a contagem de itens da sessão (mantida consistente após exclusões).
   */
  async atualizarContagemItens(
    importacaoId: string,
    workspaceId: string,
    novaQuantidade: number,
  ): Promise<void> {
    const { error } = await supabase
      .from('fatura_importacoes' as any)
      .update({
        quantidade_itens: novaQuantidade,
        updated_at: new Date().toISOString(),
      })
      .eq('id', importacaoId)
      .eq('workspace_id', workspaceId)

    if (error) {
      throw new Error(`Falha ao atualizar contagem de itens da sessão: ${error.message}`)
    }
  },

  /**
   * Atualiza uma linha temporária durante a revisão do usuário.
   */
  async atualizarLinha(
    id: string,
    alteracoes: Partial<FaturaImportacaoLinhaRegistro>,
  ): Promise<void> {
    const { error } = await supabase
      .from('fatura_importacao_linhas' as any)
      .update({
        ...alteracoes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      throw new Error(`Falha ao atualizar linha: ${error.message}`)
    }
  },

  /**
   * Obtém a sessão ativa ('em_revisao') de um cartão específico, se houver.
   */
  async obterSessaoAtivaDoCartao(
    workspaceId: string,
    cartaoId: string,
  ): Promise<FaturaImportacaoRegistro | null> {
    const { data, error } = await supabase
      .from('fatura_importacoes' as any)
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .eq('status', 'em_revisao')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('Erro ao obter sessão ativa do cartão:', error)
      return null
    }
    return (data as unknown as FaturaImportacaoRegistro) || null
  },

  /**
   * Lista todas as faturas salvas em processamento ('em_revisao') no workspace.
   */
  async listarSessoesEmProcessamento(
    workspaceId: string,
  ): Promise<
    Array<FaturaImportacaoRegistro & { linhas_total?: number; linhas_selecionadas?: number }>
  > {
    const { data, error } = await supabase
      .from('fatura_importacoes' as any)
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'em_revisao')
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('Erro ao listar sessões em processamento:', error)
      return []
    }
    return (data as unknown as FaturaImportacaoRegistro[]) || []
  },

  /**
   * Descarta uma sessão de importação específica (marca status como 'descartada').
   * Auditoria e metadados são mantidos; nada que já foi efetivado é alterado.
   */
  async descartarSessao(importacaoId: string, workspaceId?: string): Promise<void> {
    let query = supabase
      .from('fatura_importacoes' as any)
      .update({
        status: 'descartada',
        updated_at: new Date().toISOString(),
      })
      .eq('id', importacaoId)

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId)
    }

    const { error } = await query
    if (error) {
      console.warn('Erro ao descartar sessão de importação:', error)
      throw new Error(`Falha ao descartar sessão: ${error.message}`)
    }
  },

  /**
   * Descarta qualquer sessão anterior 'em_revisao' de um cartão específico.
   * Chamado antes de criar uma nova sessão para o mesmo cartão (regra C2).
   */
  async descartarSessoesEmRevisaoDoCartao(workspaceId: string, cartaoId: string): Promise<void> {
    const { error } = await supabase
      .from('fatura_importacoes' as any)
      .update({
        status: 'descartada',
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .eq('status', 'em_revisao')

    if (error) {
      console.warn('Erro ao descartar sessões em revisão do cartão:', error)
    }
  },

  /**
   * Atualização em massa de linhas selecionadas (BLOCO 22).
   */
  async atualizarLinhasEmMassa(
    ids: string[],
    alteracoes: {
      categoria_id?: string
      subcategoria_id?: string
      modalidade_saida?: string
      afeta_resultado?: boolean
      afeta_orcamento?: boolean
      tratamento?: string
      status?: StatusLinhaFatura
      selecionado?: boolean
    },
  ): Promise<void> {
    if (ids.length === 0) return

    const { error } = await supabase
      .from('fatura_importacao_linhas' as any)
      .update({
        ...alteracoes,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)

    if (error) {
      throw new Error(`Falha na atualização em massa: ${error.message}`)
    }
  },

  /**
   * EFETIVAÇÃO FINAL DOS LANÇAMENTOS CONFIRMADOS:
   * Aplica estritamente os services/fluxos normais do SAP.
   * - Compras à vista: cria lançamento definitivo de cartão
   * - Compras parceladas: cria lançamento PAI com valor total e estrutura integral de parcelas
   *   (1/N .. N/N). Sugere e marca históricas anteriores sem gerar movimentação bancária retroativa.
   * - Aprendizado automático de classificação para futuras faturas
   * - Auditoria completa registrada em auditoria_operacoes
   */
  async efetivarImportacao(params: {
    workspaceId: string
    importacaoId: string
    cartaoId: string
    linhas: FaturaImportacaoLinhaRegistro[]
    userId: string
    mesReferenciaImplatacao?: string // 'YYYY-MM' (padrão: mês corrente)
  }): Promise<{ sucesso: boolean; importados: number; erros: string[] }> {
    const {
      workspaceId,
      importacaoId,
      cartaoId,
      linhas,
      userId,
      mesReferenciaImplatacao = new Date().toISOString().slice(0, 7),
    } = params

    let importados = 0
    const erros: string[] = []

    for (const linha of linhas) {
      // Pula desmarcados ou conciliados
      if (!linha.selecionado || linha.status === 'conciliado' || linha.status === 'ignorado') {
        continue
      }

      // Validações estruturais obrigatórias (BLOCO 28)
      if (linha.modalidade_saida === 'compra_compartilhada') {
        if (!linha.valor_proprio || linha.valor_proprio > linha.valor) {
          erros.push(
            `Linha "${linha.descricao_editavel}": Valor próprio inválido na compra compartilhada.`,
          )
          continue
        }
      }

      try {
        if (linha.tipo_linha === 'parcelado' && linha.total_parcelas && linha.total_parcelas > 1) {
          // RECONSTRUÇÃO DE COMPRA PARCELADA (BLOCO G, 11-13)
          const valorTotalPai = linha.valor_total_estimado || linha.valor * linha.total_parcelas
          const valorProprioPai =
            linha.modalidade_saida === 'compra_compartilhada'
              ? (linha.valor_proprio || 0) * linha.total_parcelas
              : valorTotalPai

          const payloadPai: any = {
            tipo: 'despesa',
            data: linha.data,
            descricao: linha.descricao_editavel,
            valor: valorTotalPai,
            categoria_id: linha.categoria_id,
            subcategoria_id: linha.subcategoria_id,
            meio_pagamento_tipo: 'CARTAO',
            cartao_id: cartaoId,
            regime: 'parcelado',
            numero_parcelas: linha.total_parcelas,
            parcela_atual: 1,
            valor_parcela: linha.valor_parcela || linha.valor,
            modalidade_saida: linha.modalidade_saida,
            valor_proprio: valorProprioPai,
            valor_terceiros: valorTotalPai - valorProprioPai,
            afeta_resultado: linha.afeta_resultado,
            afeta_orcamento: linha.afeta_orcamento,
            observacao: `[Importado via Fatura PDF] Final: ${linha.final_cartao || 'N/D'} | Titular: ${linha.titular || 'N/D'} | Parcela na fatura: ${linha.parcela_atual}/${linha.total_parcelas}`,
          }

          // Criação pelo fluxo normal do SAP
          const novoPai = await lancamentoService.salvarUnificado(
            {
              workspace_id: workspaceId,
              tipo: 'despesa',
              regime: 'parcelado',
              data: linha.data,
              descricao: linha.descricao_editavel,
              valor: valorTotalPai,
              categoria_id: linha.categoria_id,
              subcategoria_id: linha.subcategoria_id,
              meio_pagamento_tipo: 'CARTAO',
              cartao_id: cartaoId,
              quantidade_parcelas: linha.total_parcelas,
              modalidade_saida: linha.modalidade_saida,
              valor_proprio: valorProprioPai,
              valor_terceiros: valorTotalPai - valorProprioPai,
              afeta_resultado: linha.afeta_resultado,
              afeta_orcamento: linha.afeta_orcamento,
              observacao: `[Importado via Fatura PDF] Final: ${linha.final_cartao || 'N/D'} | Titular: ${linha.titular || 'N/D'} | Parcela na fatura: ${linha.parcela_atual}/${linha.total_parcelas}`,
            },
            userId,
          )

          // Se a opção de marcar parcelas anteriores como históricas/pagas estiver ativa:
          if (linha.marcar_historicas_anteriores && novoPai?.id) {
            // Buscar todas as parcelas geradas para este pai
            const { data: parcelasGeradas } = await supabase
              .from('lancamentos')
              .select('id, data, competencia, numero_parcela')
              .eq('lancamento_pai_id', novoPai.id)
              .neq('id', novoPai.id)

            if (parcelasGeradas) {
              for (const p of parcelasGeradas) {
                const comp = (p as any).competencia || (p as any).data.slice(0, 7)
                if (comp < mesReferenciaImplatacao) {
                  // Marca como histórico/pago sem gerar movimentação de conta bancária retroativa
                  await supabase
                    .from('lancamentos')
                    .update({
                      status_pagamento: 'pago',
                      data_pagamento: (p as any).data,
                    })
                    .eq('id', (p as any).id)
                }
              }
            }
          }

          // Atualiza registro temporário
          await this.atualizarLinha(linha.id, {
            status: 'importado',
            lancamento_criado_id: novoPai?.id,
          })

          importados++
        } else if (linha.tipo_linha === 'compra' || linha.tipo_linha === 'encargo') {
          // COMPRA À VISTA / ENCARGO (BLOCO 10, 16)
          const novoLanc = await lancamentoService.salvarUnificado(
            {
              workspace_id: workspaceId,
              tipo: 'despesa',
              regime: 'unico',
              data: linha.data,
              descricao: linha.descricao_editavel,
              valor: linha.valor,
              categoria_id: linha.categoria_id,
              subcategoria_id: linha.subcategoria_id,
              meio_pagamento_tipo: 'CARTAO',
              cartao_id: cartaoId,
              modalidade_saida: linha.modalidade_saida,
              valor_proprio: linha.valor_proprio || linha.valor,
              valor_terceiros: linha.valor_terceiros || 0,
              afeta_resultado: linha.afeta_resultado,
              afeta_orcamento: linha.afeta_orcamento,
              observacao: `[Importado via Fatura PDF] Final: ${linha.final_cartao || 'N/D'} | Titular: ${linha.titular || 'N/D'}`,
            },
            userId,
          )

          await this.atualizarLinha(linha.id, {
            status: 'importado',
            lancamento_criado_id: novoLanc?.id,
          })

          importados++
        } else if (linha.tipo_linha === 'credito') {
          // ESTORNO OU CRÉDITO/AJUSTE (BLOCO H)
          // Regra do BLOCO H: crédito de fatura NUNCA vira Receita automaticamente.
          // É lançado como estorno/crédito no cartão de crédito, vinculado ou abatendo a fatura.
          // Se tiver vínculo com lançamento existente (estorno_vinculado_lancamento_id), atualiza/vincula.
          // Se for crédito avulso sem original (1ª carga), lança como estorno no cartão (tipo 'estorno'/'estorno_cartao').
          const novoCredito = await lancamentoService.salvarUnificado(
            {
              workspace_id: workspaceId,
              tipo: 'despesa', // no SAP estornos de despesa abatem despesa ou usam estorno_cartao
              regime: 'unico',
              data: linha.data,
              descricao: `[Estorno/Crédito] ${linha.descricao_editavel}`,
              valor: -Math.abs(linha.valor), // valor negativo para abater despesa
              categoria_id: linha.categoria_id,
              subcategoria_id: linha.subcategoria_id,
              meio_pagamento_tipo: 'CARTAO',
              cartao_id: cartaoId,
              modalidade_saida: linha.modalidade_saida,
              valor_proprio: -(linha.valor_proprio || linha.valor),
              valor_terceiros: 0,
              afeta_resultado: linha.afeta_resultado,
              afeta_orcamento: linha.afeta_orcamento,
              observacao: `[Crédito Fatura PDF] Tratamento: ${linha.tratamento || 'estorno'} | Final: ${linha.final_cartao || 'N/D'} | Titular: ${linha.titular || 'N/D'}`,
            },
            userId,
          )

          await this.atualizarLinha(linha.id, {
            status: 'importado',
            lancamento_criado_id: novoCredito?.id,
          })

          importados++
        }

        // Salvar regra aprendida se categoria foi definida
        if (linha.categoria_id && linha.subcategoria_id) {
          await this.aprenderClassificacao(
            workspaceId,
            linha.descricao_original,
            linha.categoria_id,
            linha.subcategoria_id,
            linha.modalidade_saida,
            linha.afeta_resultado,
            linha.afeta_orcamento,
            userId,
          )
        }
      } catch (err: any) {
        erros.push(`Erro na linha "${linha.descricao_editavel}": ${err?.message}`)
        await this.atualizarLinha(linha.id, {
          status: 'erro',
          mensagem_erro: err?.message,
        })
      }
    }

    // Auditoria da importação concluída (BLOCO 31)
    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'fatura_importacoes',
      entidade_id: importacaoId,
      acao: 'IMPORTAR_FATURA_PDF',
      estado_posterior: {
        importados,
        totalLinhas: linhas.length,
        errosCount: erros.length,
        cartaoId,
      },
    })

    // Atualiza status da sessão
    await supabase
      .from('fatura_importacoes' as any)
      .update({
        status: 'concluida',
        updated_at: new Date().toISOString(),
      })
      .eq('id', importacaoId)

    return {
      sucesso: erros.length === 0,
      importados,
      erros,
    }
  },
}
