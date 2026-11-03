// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
      auditoria_operacoes: {
        Row: {
          acao: string
          created_at: string
          created_by: string | null
          entidade: string
          entidade_id: string
          estado_anterior: Json | null
          estado_posterior: Json | null
          id: string
          idempotency_key: string | null
          workspace_id: string
        }
        Insert: {
          acao: string
          created_at?: string
          created_by?: string | null
          entidade: string
          entidade_id: string
          estado_anterior?: Json | null
          estado_posterior?: Json | null
          id?: string
          idempotency_key?: string | null
          workspace_id: string
        }
        Update: {
          acao?: string
          created_at?: string
          created_by?: string | null
          entidade?: string
          entidade_id?: string
          estado_anterior?: Json | null
          estado_posterior?: Json | null
          id?: string
          idempotency_key?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'auditoria_operacoes_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      auditoria_series: {
        Row: {
          created_at: string
          created_by: string | null
          detalhes: Json | null
          escopo: string
          evento: string
          id: string
          serie_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detalhes?: Json | null
          escopo: string
          evento: string
          id?: string
          serie_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detalhes?: Json | null
          escopo?: string
          evento?: string
          id?: string
          serie_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'auditoria_series_serie_id_fkey'
            columns: ['serie_id']
            isOneToOne: false
            referencedRelation: 'series_lancamentos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'auditoria_series_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      cartoes: {
        Row: {
          ativo: boolean
          bandeira: string
          cor: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dia_fechamento: number
          dia_vencimento: number
          icone: string | null
          id: string
          limite: number
          nome: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ativo?: boolean
          bandeira?: string
          cor?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dia_fechamento: number
          dia_vencimento: number
          icone?: string | null
          id?: string
          limite?: number
          nome: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ativo?: boolean
          bandeira?: string
          cor?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dia_fechamento?: number
          dia_vencimento?: number
          icone?: string | null
          id?: string
          limite?: number
          nome?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cartoes_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      categorias: {
        Row: {
          arquivado: boolean
          ativo: boolean
          classificacao_gerencial: string | null
          cor: string | null
          created_at: string
          created_by: string | null
          data_arquivamento: string | null
          deleted_at: string | null
          icone: string | null
          id: string
          natureza: string | null
          nome: string
          tipo: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          arquivado?: boolean
          ativo?: boolean
          classificacao_gerencial?: string | null
          cor?: string | null
          created_at?: string
          created_by?: string | null
          data_arquivamento?: string | null
          deleted_at?: string | null
          icone?: string | null
          id?: string
          natureza?: string | null
          nome: string
          tipo: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          arquivado?: boolean
          ativo?: boolean
          classificacao_gerencial?: string | null
          cor?: string | null
          created_at?: string
          created_by?: string | null
          data_arquivamento?: string | null
          deleted_at?: string | null
          icone?: string | null
          id?: string
          natureza?: string | null
          nome?: string
          tipo?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'categorias_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      conciliacoes_conta: {
        Row: {
          ajustado: boolean
          conta_id: string
          created_at: string
          created_by: string | null
          data_extrato: string
          divergencia: number
          id: string
          lancamento_ajuste_id: string | null
          observacao: string | null
          saldo_extrato: number
          saldo_sistema: number
          workspace_id: string
        }
        Insert: {
          ajustado?: boolean
          conta_id: string
          created_at?: string
          created_by?: string | null
          data_extrato: string
          divergencia: number
          id?: string
          lancamento_ajuste_id?: string | null
          observacao?: string | null
          saldo_extrato: number
          saldo_sistema: number
          workspace_id: string
        }
        Update: {
          ajustado?: boolean
          conta_id?: string
          created_at?: string
          created_by?: string | null
          data_extrato?: string
          divergencia?: number
          id?: string
          lancamento_ajuste_id?: string | null
          observacao?: string | null
          saldo_extrato?: number
          saldo_sistema?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conciliacoes_conta_conta_id_fkey'
            columns: ['conta_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conciliacoes_conta_lancamento_ajuste_id_fkey'
            columns: ['lancamento_ajuste_id']
            isOneToOne: false
            referencedRelation: 'lancamentos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conciliacoes_conta_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      contas: {
        Row: {
          ativa: boolean
          cor: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          icone: string | null
          id: string
          nome: string
          saldo_atual: number
          saldo_inicial: number
          tipo: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ativa?: boolean
          cor?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          icone?: string | null
          id?: string
          nome: string
          saldo_atual?: number
          saldo_inicial?: number
          tipo: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ativa?: boolean
          cor?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          icone?: string | null
          id?: string
          nome?: string
          saldo_atual?: number
          saldo_inicial?: number
          tipo?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'contas_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      fatura_parcelas: {
        Row: {
          created_at: string
          fatura_id: string
          id: string
          parcela_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          fatura_id: string
          id?: string
          parcela_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          fatura_id?: string
          id?: string
          parcela_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fatura_parcelas_fatura_id_fkey'
            columns: ['fatura_id']
            isOneToOne: false
            referencedRelation: 'faturas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fatura_parcelas_parcela_id_fkey'
            columns: ['parcela_id']
            isOneToOne: false
            referencedRelation: 'parcelas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fatura_parcelas_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      faturas: {
        Row: {
          cartao_id: string
          competencia: string
          created_at: string
          data_fechamento: string
          data_vencimento: string
          id: string
          status: string
          updated_at: string
          valor_total: number
          workspace_id: string
        }
        Insert: {
          cartao_id: string
          competencia: string
          created_at?: string
          data_fechamento: string
          data_vencimento: string
          id?: string
          status?: string
          updated_at?: string
          valor_total?: number
          workspace_id: string
        }
        Update: {
          cartao_id?: string
          competencia?: string
          created_at?: string
          data_fechamento?: string
          data_vencimento?: string
          id?: string
          status?: string
          updated_at?: string
          valor_total?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'faturas_cartao_id_fkey'
            columns: ['cartao_id']
            isOneToOne: false
            referencedRelation: 'cartoes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'faturas_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      idempotency_requests: {
        Row: {
          chave: string
          created_at: string
          hash_entrada: string
          id: string
          operacao: string
          resultado: Json | null
          solicitante: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          chave: string
          created_at?: string
          hash_entrada: string
          id?: string
          operacao: string
          resultado?: Json | null
          solicitante: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          chave?: string
          created_at?: string
          hash_entrada?: string
          id?: string
          operacao?: string
          resultado?: Json | null
          solicitante?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'idempotency_requests_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      lancamentos: {
        Row: {
          afeta_orcamento: boolean | null
          afeta_resultado: boolean | null
          cartao_id: string | null
          categoria_id: string | null
          competencia: string
          conciliado: boolean
          conciliado_por: string | null
          conta_destino_id: string | null
          conta_origem_id: string | null
          created_at: string
          created_by: string | null
          data: string
          data_conciliacao: string | null
          data_pagamento: string | null
          deleted_at: string | null
          descricao: string
          eh_excecao: boolean
          id: string
          idempotency_key: string | null
          lancamento_pai_id: string | null
          meio_pagamento_tipo: string
          modalidade_saida: string | null
          natureza_previsao: boolean
          numero_parcela: number | null
          observacao: string | null
          quantidade_parcelas: number | null
          regime: string
          serie_id: string | null
          status_pagamento: string
          subcategoria_id: string | null
          tipo: string
          total_parcelas: number | null
          updated_at: string
          valor: number
          valor_proprio: number | null
          valor_terceiros: number | null
          workspace_id: string
        }
        Insert: {
          afeta_orcamento?: boolean | null
          afeta_resultado?: boolean | null
          cartao_id?: string | null
          categoria_id?: string | null
          competencia: string
          conciliado?: boolean
          conciliado_por?: string | null
          conta_destino_id?: string | null
          conta_origem_id?: string | null
          created_at?: string
          created_by?: string | null
          data: string
          data_conciliacao?: string | null
          data_pagamento?: string | null
          deleted_at?: string | null
          descricao: string
          eh_excecao?: boolean
          id?: string
          idempotency_key?: string | null
          lancamento_pai_id?: string | null
          meio_pagamento_tipo: string
          modalidade_saida?: string | null
          natureza_previsao?: boolean
          numero_parcela?: number | null
          observacao?: string | null
          quantidade_parcelas?: number | null
          regime?: string
          serie_id?: string | null
          status_pagamento?: string
          subcategoria_id?: string | null
          tipo: string
          total_parcelas?: number | null
          updated_at?: string
          valor: number
          valor_proprio?: number | null
          valor_terceiros?: number | null
          workspace_id: string
        }
        Update: {
          afeta_orcamento?: boolean | null
          afeta_resultado?: boolean | null
          cartao_id?: string | null
          categoria_id?: string | null
          competencia?: string
          conciliado?: boolean
          conciliado_por?: string | null
          conta_destino_id?: string | null
          conta_origem_id?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          data_conciliacao?: string | null
          data_pagamento?: string | null
          deleted_at?: string | null
          descricao?: string
          eh_excecao?: boolean
          id?: string
          idempotency_key?: string | null
          lancamento_pai_id?: string | null
          meio_pagamento_tipo?: string
          modalidade_saida?: string | null
          natureza_previsao?: boolean
          numero_parcela?: number | null
          observacao?: string | null
          quantidade_parcelas?: number | null
          regime?: string
          serie_id?: string | null
          status_pagamento?: string
          subcategoria_id?: string | null
          tipo?: string
          total_parcelas?: number | null
          updated_at?: string
          valor?: number
          valor_proprio?: number | null
          valor_terceiros?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lancamentos_cartao_id_fkey'
            columns: ['cartao_id']
            isOneToOne: false
            referencedRelation: 'cartoes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lancamentos_categoria_id_fkey'
            columns: ['categoria_id']
            isOneToOne: false
            referencedRelation: 'categorias'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lancamentos_conta_destino_id_fkey'
            columns: ['conta_destino_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lancamentos_conta_origem_id_fkey'
            columns: ['conta_origem_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lancamentos_lancamento_pai_id_fkey'
            columns: ['lancamento_pai_id']
            isOneToOne: false
            referencedRelation: 'lancamentos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lancamentos_serie_id_fkey'
            columns: ['serie_id']
            isOneToOne: false
            referencedRelation: 'series_lancamentos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lancamentos_subcategoria_id_fkey'
            columns: ['subcategoria_id']
            isOneToOne: false
            referencedRelation: 'subcategorias'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lancamentos_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      meios_pagamento: {
        Row: {
          ativo: boolean
          cartao_id: string | null
          conta_id: string | null
          created_at: string
          id: string
          nome: string
          tipo: string
          workspace_id: string
        }
        Insert: {
          ativo?: boolean
          cartao_id?: string | null
          conta_id?: string | null
          created_at?: string
          id?: string
          nome: string
          tipo: string
          workspace_id: string
        }
        Update: {
          ativo?: boolean
          cartao_id?: string | null
          conta_id?: string | null
          created_at?: string
          id?: string
          nome?: string
          tipo?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'meios_pagamento_cartao_id_fkey'
            columns: ['cartao_id']
            isOneToOne: false
            referencedRelation: 'cartoes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'meios_pagamento_conta_id_fkey'
            columns: ['conta_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'meios_pagamento_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      member_scopes: {
        Row: {
          created_at: string
          entidade_id: string
          id: string
          member_id: string
          tipo_escopo: string
        }
        Insert: {
          created_at?: string
          entidade_id: string
          id?: string
          member_id: string
          tipo_escopo: string
        }
        Update: {
          created_at?: string
          entidade_id?: string
          id?: string
          member_id?: string
          tipo_escopo?: string
        }
        Relationships: [
          {
            foreignKeyName: 'member_scopes_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'workspace_members'
            referencedColumns: ['id']
          },
        ]
      }
      metas_acumulacao: {
        Row: {
          ano_mes: string
          created_at: string
          created_by: string | null
          criterio: string
          id: string
          updated_at: string
          valor_previsto: number
          valor_realizado: number
          workspace_id: string
        }
        Insert: {
          ano_mes: string
          created_at?: string
          created_by?: string | null
          criterio: string
          id?: string
          updated_at?: string
          valor_previsto?: number
          valor_realizado?: number
          workspace_id: string
        }
        Update: {
          ano_mes?: string
          created_at?: string
          created_by?: string | null
          criterio?: string
          id?: string
          updated_at?: string
          valor_previsto?: number
          valor_realizado?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'metas_acumulacao_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      movimentacoes_conta: {
        Row: {
          conta_id: string
          created_at: string
          created_by: string | null
          data: string
          descricao: string
          id: string
          idempotency_key: string | null
          lancamento_id: string | null
          pagamento_fatura_id: string | null
          tipo: string
          valor: number
          workspace_id: string
        }
        Insert: {
          conta_id: string
          created_at?: string
          created_by?: string | null
          data: string
          descricao: string
          id?: string
          idempotency_key?: string | null
          lancamento_id?: string | null
          pagamento_fatura_id?: string | null
          tipo: string
          valor: number
          workspace_id: string
        }
        Update: {
          conta_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string
          id?: string
          idempotency_key?: string | null
          lancamento_id?: string | null
          pagamento_fatura_id?: string | null
          tipo?: string
          valor?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'movimentacoes_conta_conta_id_fkey'
            columns: ['conta_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'movimentacoes_conta_lancamento_id_fkey'
            columns: ['lancamento_id']
            isOneToOne: false
            referencedRelation: 'lancamentos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'movimentacoes_conta_pagamento_fatura_id_fkey'
            columns: ['pagamento_fatura_id']
            isOneToOne: false
            referencedRelation: 'pagamentos_fatura'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'movimentacoes_conta_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      orcamento_limites: {
        Row: {
          competencia: string
          created_at: string
          created_by: string | null
          id: string
          limite_definido: number
          subcategoria_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          competencia: string
          created_at?: string
          created_by?: string | null
          id?: string
          limite_definido?: number
          subcategoria_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          competencia?: string
          created_at?: string
          created_by?: string | null
          id?: string
          limite_definido?: number
          subcategoria_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'orcamento_limites_subcategoria_id_fkey'
            columns: ['subcategoria_id']
            isOneToOne: false
            referencedRelation: 'subcategorias'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orcamento_limites_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      orcamento_metas_poupanca: {
        Row: {
          competencia: string
          created_at: string
          created_by: string | null
          id: string
          meta_poupanca: number | null
          percentual_minimo: number
          subcategorias_selecionadas: Json | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          competencia: string
          created_at?: string
          created_by?: string | null
          id?: string
          meta_poupanca?: number | null
          percentual_minimo?: number
          subcategorias_selecionadas?: Json | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          competencia?: string
          created_at?: string
          created_by?: string | null
          id?: string
          meta_poupanca?: number | null
          percentual_minimo?: number
          subcategorias_selecionadas?: Json | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'orcamento_metas_poupanca_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      orcamentos: {
        Row: {
          ano_mes: string
          categoria_id: string
          created_at: string
          created_by: string | null
          id: string
          limite: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ano_mes: string
          categoria_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          limite?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ano_mes?: string
          categoria_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          limite?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'orcamentos_categoria_id_fkey'
            columns: ['categoria_id']
            isOneToOne: false
            referencedRelation: 'categorias'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orcamentos_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      pagamentos_fatura: {
        Row: {
          conta_id: string
          created_at: string
          created_by: string | null
          data_pagamento: string
          fatura_id: string
          id: string
          idempotency_key: string | null
          status: string
          updated_at: string
          valor: number
          workspace_id: string
        }
        Insert: {
          conta_id: string
          created_at?: string
          created_by?: string | null
          data_pagamento: string
          fatura_id: string
          id?: string
          idempotency_key?: string | null
          status?: string
          updated_at?: string
          valor: number
          workspace_id: string
        }
        Update: {
          conta_id?: string
          created_at?: string
          created_by?: string | null
          data_pagamento?: string
          fatura_id?: string
          id?: string
          idempotency_key?: string | null
          status?: string
          updated_at?: string
          valor?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'pagamentos_fatura_conta_id_fkey'
            columns: ['conta_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pagamentos_fatura_fatura_id_fkey'
            columns: ['fatura_id']
            isOneToOne: false
            referencedRelation: 'faturas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pagamentos_fatura_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      parcelas: {
        Row: {
          cartao_id: string | null
          competencia: string
          created_at: string
          data_vencimento: string
          fatura_id: string | null
          id: string
          lancamento_id: string
          numero_parcela: number
          status: string
          total_parcelas: number
          updated_at: string
          valor: number
          workspace_id: string
        }
        Insert: {
          cartao_id?: string | null
          competencia: string
          created_at?: string
          data_vencimento: string
          fatura_id?: string | null
          id?: string
          lancamento_id: string
          numero_parcela: number
          status?: string
          total_parcelas: number
          updated_at?: string
          valor: number
          workspace_id: string
        }
        Update: {
          cartao_id?: string | null
          competencia?: string
          created_at?: string
          data_vencimento?: string
          fatura_id?: string | null
          id?: string
          lancamento_id?: string
          numero_parcela?: number
          status?: string
          total_parcelas?: number
          updated_at?: string
          valor?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'parcelas_cartao_id_fkey'
            columns: ['cartao_id']
            isOneToOne: false
            referencedRelation: 'cartoes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'parcelas_fatura_id_fkey'
            columns: ['fatura_id']
            isOneToOne: false
            referencedRelation: 'faturas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'parcelas_lancamento_id_fkey'
            columns: ['lancamento_id']
            isOneToOne: false
            referencedRelation: 'lancamentos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'parcelas_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      permissions: {
        Row: {
          acao: string
          codigo: string
          descricao: string
          id: string
          modulo: string
        }
        Insert: {
          acao: string
          codigo: string
          descricao: string
          id?: string
          modulo: string
        }
        Update: {
          acao?: string
          codigo?: string
          descricao?: string
          id?: string
          modulo?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          moeda: string
          nome: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          moeda?: string
          nome?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          moeda?: string
          nome?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: string
          permission_id: string
          permitido: boolean
          role_id: string
        }
        Insert: {
          id?: string
          permission_id: string
          permitido?: boolean
          role_id: string
        }
        Update: {
          id?: string
          permission_id?: string
          permitido?: boolean
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'role_permissions_permission_id_fkey'
            columns: ['permission_id']
            isOneToOne: false
            referencedRelation: 'permissions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'role_permissions_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome: string
          sistema: boolean
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          sistema?: boolean
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          sistema?: boolean
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'roles_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      series_lancamentos: {
        Row: {
          ativo: boolean
          cartao_id: string | null
          categoria_id: string | null
          conta_destino_id: string | null
          conta_origem_id: string | null
          created_at: string
          created_by: string | null
          data_inicio: string | null
          data_limite_projecao: string | null
          descricao: string
          dia_vencimento: number | null
          id: string
          meio_pagamento_tipo: string | null
          observacao: string | null
          ocorrencias_geradas: number
          periodicidade: string
          prazo: string
          proxima_competencia: string
          quantidade_total: number | null
          subcategoria_id: string | null
          tipo: string
          updated_at: string
          valor: number | null
          workspace_id: string
        }
        Insert: {
          ativo?: boolean
          cartao_id?: string | null
          categoria_id?: string | null
          conta_destino_id?: string | null
          conta_origem_id?: string | null
          created_at?: string
          created_by?: string | null
          data_inicio?: string | null
          data_limite_projecao?: string | null
          descricao: string
          dia_vencimento?: number | null
          id?: string
          meio_pagamento_tipo?: string | null
          observacao?: string | null
          ocorrencias_geradas?: number
          periodicidade?: string
          prazo?: string
          proxima_competencia: string
          quantidade_total?: number | null
          subcategoria_id?: string | null
          tipo: string
          updated_at?: string
          valor?: number | null
          workspace_id: string
        }
        Update: {
          ativo?: boolean
          cartao_id?: string | null
          categoria_id?: string | null
          conta_destino_id?: string | null
          conta_origem_id?: string | null
          created_at?: string
          created_by?: string | null
          data_inicio?: string | null
          data_limite_projecao?: string | null
          descricao?: string
          dia_vencimento?: number | null
          id?: string
          meio_pagamento_tipo?: string | null
          observacao?: string | null
          ocorrencias_geradas?: number
          periodicidade?: string
          prazo?: string
          proxima_competencia?: string
          quantidade_total?: number | null
          subcategoria_id?: string | null
          tipo?: string
          updated_at?: string
          valor?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'series_lancamentos_cartao_id_fkey'
            columns: ['cartao_id']
            isOneToOne: false
            referencedRelation: 'cartoes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'series_lancamentos_categoria_id_fkey'
            columns: ['categoria_id']
            isOneToOne: false
            referencedRelation: 'categorias'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'series_lancamentos_conta_destino_id_fkey'
            columns: ['conta_destino_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'series_lancamentos_conta_origem_id_fkey'
            columns: ['conta_origem_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'series_lancamentos_subcategoria_id_fkey'
            columns: ['subcategoria_id']
            isOneToOne: false
            referencedRelation: 'subcategorias'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'series_lancamentos_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      subcategorias: {
        Row: {
          afeta_resultado: boolean | null
          arquivado: boolean
          ativo: boolean
          categoria_id: string
          classificacao: string | null
          cor: string | null
          created_at: string
          created_by: string | null
          data_arquivamento: string | null
          deleted_at: string | null
          icone: string | null
          id: string
          natureza: string | null
          nome: string
          observacao: string | null
          origem_economica: string | null
          regularidade: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          afeta_resultado?: boolean | null
          arquivado?: boolean
          ativo?: boolean
          categoria_id: string
          classificacao?: string | null
          cor?: string | null
          created_at?: string
          created_by?: string | null
          data_arquivamento?: string | null
          deleted_at?: string | null
          icone?: string | null
          id?: string
          natureza?: string | null
          nome: string
          observacao?: string | null
          origem_economica?: string | null
          regularidade?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          afeta_resultado?: boolean | null
          arquivado?: boolean
          ativo?: boolean
          categoria_id?: string
          classificacao?: string | null
          cor?: string | null
          created_at?: string
          created_by?: string | null
          data_arquivamento?: string | null
          deleted_at?: string | null
          icone?: string | null
          id?: string
          natureza?: string | null
          nome?: string
          observacao?: string | null
          origem_economica?: string | null
          regularidade?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subcategorias_categoria_id_fkey'
            columns: ['categoria_id']
            isOneToOne: false
            referencedRelation: 'categorias'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'subcategorias_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      user_invitations: {
        Row: {
          convidado_por: string | null
          created_at: string
          email: string
          expira_em: string
          id: string
          perfil: string
          status: string
          token_hash: string
          workspace_id: string
        }
        Insert: {
          convidado_por?: string | null
          created_at?: string
          email: string
          expira_em: string
          id?: string
          perfil: string
          status?: string
          token_hash: string
          workspace_id: string
        }
        Update: {
          convidado_por?: string | null
          created_at?: string
          email?: string
          expira_em?: string
          id?: string
          perfil?: string
          status?: string
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_invitations_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      workspace_members: {
        Row: {
          accepted_at: string | null
          convidado_por: string | null
          created_at: string
          id: string
          invited_at: string
          perfil: string
          role_id: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          convidado_por?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          perfil: string
          role_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          convidado_por?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          perfil?: string
          role_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workspace_members_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'workspace_members_user_id_profiles_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'workspace_members_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      workspaces: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation_by_token: {
        Args: { token_input: string }
        Returns: Json
      }
      alterar_fixo_escopo_rpc:
        | {
            Args: {
              p_escopo?: string
              p_lancamento_id: string
              p_nova_categoria_id?: string
              p_nova_conta_destino_id?: string
              p_nova_conta_origem_id?: string
              p_nova_data?: string
              p_nova_descricao?: string
              p_nova_observacao?: string
              p_nova_periodicidade?: string
              p_nova_quantidade_total?: number
              p_nova_subcategoria_id?: string
              p_novo_cartao_id?: string
              p_novo_meio_pagamento_tipo?: string
              p_novo_prazo?: string
              p_novo_valor?: number
              p_pago_primeira?: boolean
              p_user_id?: string
              p_workspace_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_escopo: string
              p_lancamento_id: string
              p_nova_categoria_id?: string
              p_nova_conta_destino_id?: string
              p_nova_conta_origem_id?: string
              p_nova_data: string
              p_nova_descricao: string
              p_nova_observacao?: string
              p_nova_periodicidade?: string
              p_nova_quantidade_total?: number
              p_nova_subcategoria_id?: string
              p_novo_cartao_id?: string
              p_novo_meio_pagamento_tipo?: string
              p_novo_prazo?: string
              p_novo_valor: number
              p_user_id?: string
              p_workspace_id: string
            }
            Returns: Json
          }
      aplicar_saldo_transferencia_rpc: {
        Args: {
          p_lancamento_id: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      arquivar_categoria_rpc: {
        Args: {
          p_arquivar: boolean
          p_arquivar_subcategorias?: boolean
          p_categoria_id: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      arquivar_subcategoria_rpc: {
        Args: {
          p_arquivar: boolean
          p_subcategoria_id: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      atualizar_fechamento_cartao_rpc: {
        Args: {
          p_cartao_id: string
          p_novo_dia_fechamento: number
          p_novo_dia_vencimento?: number
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      avancar_data_periodicidade: {
        Args: { p_data: string; p_passos?: number; p_periodicidade: string }
        Returns: string
      }
      calcular_competencia_cartao:
        | {
            Args: { p_data: string; p_dia_fechamento: number }
            Returns: string
          }
        | {
            Args: {
              p_data: string
              p_dia_fechamento: number
              p_dia_vencimento: number
            }
            Returns: string
          }
      calcular_limite_projecao_fixo: {
        Args: { p_data_inicio: string }
        Returns: string
      }
      calcular_meta_poupanca_rpc: {
        Args: {
          p_competencia: string
          p_percentual_minimo?: number
          p_subcategorias_ids?: string[]
          p_workspace_id: string
        }
        Returns: Json
      }
      calcular_regime_competencia_integral_rpc: {
        Args: {
          p_data_fim: string
          p_data_inicio: string
          p_workspace_id: string
        }
        Returns: Json
      }
      converter_regime_lancamento_rpc:
        | {
            Args: {
              p_lancamento_id: string
              p_nova_categoria_id?: string
              p_nova_conta_destino?: string
              p_nova_conta_origem?: string
              p_nova_data: string
              p_nova_descricao: string
              p_nova_observacao?: string
              p_nova_periodicidade?: string
              p_nova_quantidade_parcelas?: number
              p_nova_subcategoria_id?: string
              p_novo_cartao_id?: string
              p_novo_meio_pagamento: string
              p_novo_prazo?: string
              p_novo_regime: string
              p_novo_total_ocorrencias?: number
              p_novo_valor: number
              p_pago_primeira?: boolean
              p_user_id?: string
              p_workspace_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_lancamento_id: string
              p_nova_categoria_id?: string
              p_nova_conta_destino?: string
              p_nova_conta_origem?: string
              p_nova_data: string
              p_nova_descricao: string
              p_nova_observacao?: string
              p_nova_periodicidade?: string
              p_nova_quantidade_parcelas?: number
              p_nova_subcategoria_id?: string
              p_novo_cartao_id?: string
              p_novo_meio_pagamento: string
              p_novo_prazo?: string
              p_novo_regime: string
              p_novo_total_ocorrencias?: number
              p_novo_valor: number
              p_user_id?: string
              p_workspace_id: string
            }
            Returns: Json
          }
      copiar_limites_periodo_anterior_rpc: {
        Args: {
          p_competencia_destino: string
          p_competencia_origem: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      criar_serie_fixa_rpc: {
        Args: {
          p_cartao_id?: string
          p_categoria_id?: string
          p_conta_destino_id?: string
          p_conta_origem_id?: string
          p_data_inicio: string
          p_descricao: string
          p_meio_pagamento_tipo?: string
          p_observacao?: string
          p_pago_primeira?: boolean
          p_periodicidade: string
          p_prazo: string
          p_quantidade_total?: number
          p_subcategoria_id?: string
          p_tipo: string
          p_user_id?: string
          p_valor: number
          p_workspace_id: string
        }
        Returns: Json
      }
      editar_lancamento_atomico_rpc:
        | {
            Args: {
              p_cartao_id?: string
              p_categoria_id?: string
              p_conta_destino_id?: string
              p_conta_origem_id?: string
              p_data: string
              p_descricao: string
              p_lancamento_id: string
              p_meio_pagamento_tipo: string
              p_observacao?: string
              p_quantidade_parcelas?: number
              p_status_pagamento?: string
              p_subcategoria_id?: string
              p_user_id?: string
              p_valor: number
              p_workspace_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_afeta_orcamento?: boolean
              p_afeta_resultado?: boolean
              p_cartao_id?: string
              p_categoria_id?: string
              p_conta_destino_id?: string
              p_conta_origem_id?: string
              p_data: string
              p_descricao: string
              p_lancamento_id: string
              p_meio_pagamento_tipo: string
              p_modalidade_saida?: string
              p_observacao?: string
              p_quantidade_parcelas?: number
              p_status_pagamento?: string
              p_subcategoria_id?: string
              p_user_id?: string
              p_valor: number
              p_valor_proprio?: number
              p_valor_terceiros?: number
              p_workspace_id: string
            }
            Returns: Json
          }
      estornar_fatura_rpc: {
        Args: {
          p_fatura_id: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      excluir_fixo_escopo_rpc: {
        Args: {
          p_escopo?: string
          p_lancamento_id: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      excluir_lancamento_parcelado_rpc: {
        Args: {
          p_lancamento_id: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      excluir_subcategoria_rpc: {
        Args: {
          p_subcategoria_id: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      excluir_transferencia_rpc: {
        Args: {
          p_lancamento_id: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_invitation_by_token: { Args: { token_input: string }; Returns: Json }
      gravar_limite_subcategoria_rpc: {
        Args: {
          p_competencia: string
          p_limite: number
          p_subcategoria_id: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      gravar_meta_poupanca_rpc: {
        Args: {
          p_competencia: string
          p_meta_poupanca?: number
          p_percentual_minimo?: number
          p_subcategorias_selecionadas?: Json
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      is_admin_of_workspace: { Args: { ws_id: string }; Returns: boolean }
      is_member_of_workspace: { Args: { ws_id: string }; Returns: boolean }
      listar_lancamentos_periodo_anterior_rpc:
        | {
            Args: {
              p_categoria_id?: string
              p_competencia: string
              p_subcategoria_id?: string
              p_workspace_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_categoria_id?: string
              p_competencia: string
              p_modo?: string
              p_subcategoria_id?: string
              p_workspace_id: string
            }
            Returns: Json
          }
      materializar_fixos_pendentes_rpc: {
        Args: { p_user_id?: string; p_workspace_id: string }
        Returns: Json
      }
      obter_cartoes_consolidado_rpc: {
        Args: { p_incluir_inativos?: boolean; p_workspace_id: string }
        Returns: {
          ativo: boolean
          bandeira: string
          cor: string
          dia_fechamento: number
          dia_vencimento: number
          fatura_atual: number
          icone: string
          id: string
          limite: number
          nome: string
          total_comprometido: number
          workspace_id: string
        }[]
      }
      obter_orcamento_consolidado_rpc: {
        Args: { p_competencia: string; p_workspace_id: string }
        Returns: Json
      }
      obter_status_serie_fixa_rpc: {
        Args: { p_lancamento_id: string; p_workspace_id: string }
        Returns: Json
      }
      pagar_fatura_rpc: {
        Args: {
          p_conta_id: string
          p_data_pagamento: string
          p_fatura_id: string
          p_user_id?: string
          p_valor: number
          p_workspace_id: string
        }
        Returns: Json
      }
      recalcular_fatura_rpc: {
        Args: {
          p_cartao_id: string
          p_competencia: string
          p_workspace_id: string
        }
        Returns: number
      }
      reconciliar_saldos_contas_rpc: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      regenerar_parcelas_lancamento:
        | {
            Args: {
              p_categoria_id?: string
              p_lancamento_id: string
              p_nova_data: string
              p_nova_descricao: string
              p_nova_quantidade_parcelas: number
              p_novo_valor: number
              p_observacao?: string
              p_subcategoria_id?: string
              p_user_id?: string
              p_workspace_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_categoria_id?: string
              p_lancamento_id: string
              p_nova_data: string
              p_nova_descricao: string
              p_nova_quantidade_parcelas: number
              p_novo_cartao_id?: string
              p_novo_valor: number
              p_observacao?: string
              p_subcategoria_id?: string
              p_user_id?: string
              p_workspace_id: string
            }
            Returns: Json
          }
      renovar_projecao_fixo_rpc: {
        Args: {
          p_nova_categoria_id?: string
          p_nova_data_base?: string
          p_novo_valor?: number
          p_serie_id: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      restaurar_saldo_transferencia_rpc: {
        Args: { p_lancamento_id: string; p_workspace_id: string }
        Returns: Json
      }
      somar_meses_competencia: {
        Args: { p_competencia: string; p_meses: number }
        Returns: string
      }
      toggle_pago_lancamento_rpc: {
        Args: {
          p_lancamento_id: string
          p_pago: boolean
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      unaccent: { Args: { '': string }; Returns: string }
      verificar_pode_desativar_cartao_rpc: {
        Args: { p_cartao_id: string; p_workspace_id: string }
        Returns: Json
      }
      verificar_pode_excluir_categoria_rpc: {
        Args: { p_categoria_id: string; p_workspace_id: string }
        Returns: Json
      }
      verificar_pode_excluir_conta_rpc: {
        Args: { p_conta_id: string; p_workspace_id: string }
        Returns: Json
      }
      verificar_pode_excluir_subcategoria_rpc: {
        Args: { p_subcategoria_id: string; p_workspace_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
