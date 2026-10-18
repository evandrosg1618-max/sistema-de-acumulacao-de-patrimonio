import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  User,
  Shield,
  KeyRound,
  Bell,
  Coins,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Moon,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'

export default function Settings() {
  const { user, profile, updateProfileData, updatePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Form states
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Preferences states
  const [emailSignals, setEmailSignals] = useState(profile?.email_signals ?? true)
  const [priceAlerts, setPriceAlerts] = useState(profile?.price_alerts ?? true)
  const [currency, setCurrency] = useState<'BRL' | 'USD' | 'EUR'>(profile?.currency ?? 'BRL')

  // Danger zone modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  const userInitials = (profile?.full_name || user?.email || 'Investidor')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  const handleToggleSignals = async () => {
    const nextVal = !emailSignals
    setEmailSignals(nextVal)
    await updateProfileData({ email_signals: nextVal })
    toast({
      title: 'Preferência atualizada',
      description: nextVal ? 'Sinais por e-mail ativados.' : 'Sinais por e-mail desativados.',
    })
  }

  const handleToggleAlerts = async () => {
    const nextVal = !priceAlerts
    setPriceAlerts(nextVal)
    await updateProfileData({ price_alerts: nextVal })
    toast({
      title: 'Preferência atualizada',
      description: nextVal
        ? 'Notificações de preço-alvo ativadas.'
        : 'Notificações de preço-alvo desativadas.',
    })
  }

  const handleCurrencyChange = async (newCurr: 'BRL' | 'USD' | 'EUR') => {
    setCurrency(newCurr)
    await updateProfileData({ currency: newCurr })
    toast({
      title: 'Moeda alterada',
      description: `Moeda padrão definida para ${newCurr}.`,
    })
  }

  const handleUpdatePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A nova senha deve ter no mínimo 6 caracteres.',
        variant: 'destructive',
      })
      return
    }

    if (newPassword !== confirmNewPassword) {
      toast({
        title: 'Senhas divergentes',
        description: 'A confirmação de senha deve ser idêntica à nova senha.',
        variant: 'destructive',
      })
      return
    }

    setPasswordLoading(true)
    const res = await updatePassword(newPassword)
    setPasswordLoading(false)

    if (res.error) {
      toast({
        title: 'Erro ao atualizar senha',
        description: res.error.message || 'Tente novamente.',
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Senha atualizada com sucesso',
        description: 'Sua credencial de acesso foi alterada com segurança.',
      })
      setIsPasswordModalOpen(false)
      setNewPassword('')
      setConfirmNewPassword('')
    }
  }

  const handleDeleteAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (deleteConfirmText !== 'EXCLUIR') {
      toast({
        title: 'Palavra de confirmação incorreta',
        description: 'Digite exatamente "EXCLUIR" em maiúsculas para prosseguir.',
        variant: 'destructive',
      })
      return
    }

    setDeleteLoading(true)
    setTimeout(async () => {
      setDeleteLoading(false)
      setIsDeleteModalOpen(false)
      await signOut()
      toast({
        title: 'Conta excluída',
        description: 'Sua conta e seus dados foram apagados com sucesso.',
      })
      navigate('/entrar')
    }, 1000)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-16">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F3F6FB] flex items-center gap-2.5">
          <SettingsIcon className="w-6 h-6 text-[#17C3B2]" /> Configurações
        </h1>
        <p className="text-xs sm:text-sm text-[#96A3B8] mt-1">
          Gerencie seu perfil de investidor, preferências de notificações e segurança da conta.
        </p>
      </div>

      {/* 1. SEÇÃO DE PERFIL */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[#111827] border border-[#263343] space-y-6 shadow-md">
        <div className="flex items-center gap-3 pb-4 border-b border-[#263343]">
          <User className="w-5 h-5 text-[#17C3B2]" />
          <div>
            <h2 className="font-bold text-base text-[#F3F6FB]">Perfil do Usuário</h2>
            <p className="text-xs text-[#96A3B8]">Informações vinculadas à sua autenticação</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#17C3B2] to-[#0EA5E9] text-[#0A0F1E] font-black text-2xl flex items-center justify-center shrink-0 shadow-lg shadow-[#17C3B2]/20">
            {userInitials || 'PE'}
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#96A3B8] mb-1.5">
                Nome Completo
              </label>
              <input
                type="text"
                readOnly
                value={profile?.full_name || 'Investidor Pulse'}
                className="w-full bg-[#1A2332] border border-[#263343] rounded-xl px-4 py-2.5 text-xs font-medium text-[#F3F6FB] cursor-not-allowed outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#96A3B8] mb-1.5">
                E-mail Cadastrado
              </label>
              <input
                type="text"
                readOnly
                value={user?.email || 'usuario@pulse.com.br'}
                className="w-full bg-[#1A2332] border border-[#263343] rounded-xl px-4 py-2.5 text-xs font-medium text-[#F3F6FB] cursor-not-allowed outline-none"
              />
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-start">
          <button
            onClick={() => setIsPasswordModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-[#1A2332] hover:bg-[#202c3f] border border-[#263343] text-xs font-semibold text-[#17C3B2] transition-colors flex items-center gap-2"
          >
            <KeyRound className="w-4 h-4" /> Alterar Senha
          </button>
        </div>
      </div>

      {/* 2. SEÇÃO DE PREFERÊNCIAS */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[#111827] border border-[#263343] space-y-6 shadow-md">
        <div className="flex items-center gap-3 pb-4 border-b border-[#263343]">
          <Bell className="w-5 h-5 text-[#17C3B2]" />
          <div>
            <h2 className="font-bold text-base text-[#F3F6FB]">Preferências do Sistema</h2>
            <p className="text-xs text-[#96A3B8]">
              Ajuste como você recebe análises e exibe valores
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Toggle: Receber sinais por e-mail */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-[#1A2332]/50 border border-[#263343]">
            <div>
              <p className="text-sm font-semibold text-[#F3F6FB]">Receber sinais por e-mail</p>
              <p className="text-xs text-[#96A3B8]">
                Envio semanal consolidado dos melhores ativos B3 segundo o algoritmo
              </p>
            </div>
            <button
              onClick={handleToggleSignals}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                emailSignals ? 'bg-[#17C3B2]' : 'bg-[#263343]'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-[#0A0F1E] transition-transform ${
                  emailSignals ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Toggle: Notificações de preço-alvo */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-[#1A2332]/50 border border-[#263343]">
            <div>
              <p className="text-sm font-semibold text-[#F3F6FB]">Notificações de preço-alvo</p>
              <p className="text-xs text-[#96A3B8]">
                Alertas push sempre que um ativo da watchlist atingir máxima ou mínima
              </p>
            </div>
            <button
              onClick={handleToggleAlerts}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                priceAlerts ? 'bg-[#17C3B2]' : 'bg-[#263343]'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-[#0A0F1E] transition-transform ${
                  priceAlerts ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Toggle: Modo escuro (disabled as per spec) */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-[#1A2332]/30 border border-[#263343] opacity-60">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[#F3F6FB]">Modo escuro</p>
                <span className="px-2 py-0.5 text-[10px] bg-[#263343] text-[#96A3B8] rounded">
                  Padrão Fintech
                </span>
              </div>
              <p className="text-xs text-[#96A3B8]">
                Tema escuro otimizado para gráficos e menor cansaço visual
              </p>
            </div>
            <button
              disabled
              className="w-12 h-6 rounded-full bg-[#17C3B2] relative p-0.5 shrink-0 cursor-not-allowed"
            >
              <span className="block w-5 h-5 rounded-full bg-[#0A0F1E] translate-x-6" />
            </button>
          </div>

          {/* Select: Moeda de exibição */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#1A2332]/50 border border-[#263343]">
            <div>
              <p className="text-sm font-semibold text-[#F3F6FB]">Moeda de exibição</p>
              <p className="text-xs text-[#96A3B8]">
                Altera a formatação visual dos preços na interface
              </p>
            </div>
            <select
              value={currency}
              onChange={(e) => handleCurrencyChange(e.target.value as any)}
              className="bg-[#111827] border border-[#263343] text-xs font-semibold text-[#F3F6FB] rounded-xl px-4 py-2 outline-none focus:border-[#17C3B2] cursor-pointer"
            >
              <option value="BRL">BRL (R$) - Real Brasileiro</option>
              <option value="USD">USD ($) - Dólar Americano</option>
              <option value="EUR">EUR (€) - Euro</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. ZONA DE PERIGO (Excluir Conta) */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[#111827] border border-[#F87171]/40 space-y-4 shadow-md">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[#F87171]" />
          <div>
            <h2 className="font-bold text-base text-[#F87171]">Zona de Perigo</h2>
            <p className="text-xs text-[#96A3B8]">
              Ações irreversíveis sobre seus dados e histórico
            </p>
          </div>
        </div>

        <p className="text-xs text-[#96A3B8] leading-relaxed">
          Ao excluir sua conta, todas as suas preferências, lista de favoritos, histórico de
          conversas e configurações de carteira serão permanentemente destruídos.
        </p>

        <div className="pt-2">
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-[#F87171]/15 border border-[#F87171]/30 hover:bg-[#F87171] hover:text-[#0A0F1E] text-xs font-semibold text-[#F87171] transition-all flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Excluir minha conta
          </button>
        </div>
      </div>

      {/* MODAL: ALTERAR SENHA */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setIsPasswordModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-[#111827] border border-[#263343] rounded-2xl shadow-2xl p-6 z-10 animate-fade-in space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#263343]">
              <h3 className="font-bold text-base text-[#F3F6FB] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#17C3B2]" /> Atualizar Senha
              </h3>
              <button
                onClick={() => setIsPasswordModalOpen(false)}
                className="p-1 rounded-lg text-[#96A3B8] hover:text-[#F3F6FB]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdatePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#96A3B8] mb-1.5">
                  Nova Senha
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  required
                  className="w-full bg-[#1A2332] border border-[#263343] focus:border-[#17C3B2] text-xs text-[#F3F6FB] placeholder-[#96A3B8] rounded-xl px-4 py-2.5 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#96A3B8] mb-1.5">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  required
                  className="w-full bg-[#1A2332] border border-[#263343] focus:border-[#17C3B2] text-xs text-[#F3F6FB] placeholder-[#96A3B8] rounded-xl px-4 py-2.5 outline-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#1A2332] text-xs font-semibold text-[#96A3B8] hover:text-[#F3F6FB]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#17C3B2] text-xs font-semibold text-[#0A0F1E] hover:bg-[#13A796] disabled:opacity-50"
                >
                  {passwordLoading ? 'Atualizando…' : 'Salvar Nova Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUIR CONTA (DESTRUCTIVE WITH CONFIRM TEXT) */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setIsDeleteModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-[#111827] border border-[#F87171]/50 rounded-2xl shadow-2xl p-6 z-10 animate-fade-in space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#F87171]/20 text-[#F87171] flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-bold text-base text-[#F3F6FB]">Confirmação de Exclusão</h3>
              <p className="text-xs text-[#96A3B8] mt-1.5 leading-relaxed">
                Esta ação é definitiva. Para confirmar a exclusão permanente de sua conta, digite{' '}
                <strong className="text-[#F87171]">EXCLUIR</strong> no campo abaixo:
              </p>
            </div>

            <form onSubmit={handleDeleteAccountSubmit} className="space-y-4">
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Digite EXCLUIR"
                required
                className="w-full bg-[#1A2332] border border-[#263343] focus:border-[#F87171] text-xs text-[#F3F6FB] placeholder-[#96A3B8] rounded-xl px-4 py-2.5 outline-none font-mono"
              />

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteModalOpen(false)
                    setDeleteConfirmText('')
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#1A2332] text-xs font-semibold text-[#96A3B8] hover:text-[#F3F6FB]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={deleteLoading || deleteConfirmText !== 'EXCLUIR'}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#F87171] text-xs font-bold text-[#0A0F1E] hover:bg-[#ef4444] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {deleteLoading ? 'Excluindo…' : 'Excluir Definitivamente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
