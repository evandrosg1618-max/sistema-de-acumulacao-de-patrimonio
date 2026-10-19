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
          ativo: boolean
          classificacao_gerencial: string
          cor: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          icone: string | null
          id: string
          natureza: string
          nome: string
          tipo: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ativo?: boolean
          classificacao_gerencial?: string
          cor?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          icone?: string | null
          id?: string
          natureza?: string
          nome: string
          tipo: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ativo?: boolean
          classificacao_gerencial?: string
          cor?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          icone?: string | null
          id?: string
          natureza?: string
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
          id: string
          idempotency_key: string | null
          lancamento_pai_id: string | null
          meio_pagamento_tipo: string
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
          workspace_id: string
        }
        Insert: {
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
          id?: string
          idempotency_key?: string | null
          lancamento_pai_id?: string | null
          meio_pagamento_tipo: string
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
          workspace_id: string
        }
        Update: {
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
          id?: string
          idempotency_key?: string | null
          lancamento_pai_id?: string | null
          meio_pagamento_tipo?: string
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
          created_at: string
          created_by: string | null
          descricao: string
          id: string
          ocorrencias_geradas: number
          periodicidade: string
          prazo: string
          proxima_competencia: string
          quantidade_total: number | null
          tipo: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao: string
          id?: string
          ocorrencias_geradas?: number
          periodicidade?: string
          prazo?: string
          proxima_competencia: string
          quantidade_total?: number | null
          tipo: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string
          id?: string
          ocorrencias_geradas?: number
          periodicidade?: string
          prazo?: string
          proxima_competencia?: string
          quantidade_total?: number | null
          tipo?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
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
          ativo: boolean
          categoria_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          nome: string
          observacao: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ativo?: boolean
          categoria_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          nome: string
          observacao?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          nome?: string
          observacao?: string | null
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
      calcular_competencia_cartao: {
        Args: { p_data: string; p_dia_fechamento: number }
        Returns: string
      }
      excluir_lancamento_parcelado_rpc: {
        Args: {
          p_lancamento_id: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_invitation_by_token: { Args: { token_input: string }; Returns: Json }
      is_admin_of_workspace: { Args: { ws_id: string }; Returns: boolean }
      is_member_of_workspace: { Args: { ws_id: string }; Returns: boolean }
      obter_cartoes_consolidado_rpc: {
        Args: { p_incluir_inativos?: boolean; p_workspace_id: string }
        Returns: {
          ativo: boolean
          bandeira: string
          cor: string
          dia_fechamento: number
          dia_vencimento: number
          fatura_atual: number
          id: string
          limite: number
          nome: string
          total_comprometido: number
          workspace_id: string
        }[]
      }
      recalcular_fatura_rpc: {
        Args: {
          p_cartao_id: string
          p_competencia: string
          p_workspace_id: string
        }
        Returns: number
      }
      regenerar_parcelas_lancamento: {
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
      somar_meses_competencia: {
        Args: { p_competencia: string; p_meses: number }
        Returns: string
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
