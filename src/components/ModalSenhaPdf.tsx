import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Lock, Eye, EyeOff } from 'lucide-react'

export interface ModalSenhaPdfProps {
  aberto: boolean
  aoFechar: () => void
  aoConfirmar: (senha: string) => void
  carregando?: boolean
  erroMensagem?: string | null
}

export const ModalSenhaPdf: React.FC<ModalSenhaPdfProps> = ({
  aberto,
  aoFechar,
  aoConfirmar,
  carregando = false,
  erroMensagem = null,
}) => {
  const [senha, setSenha] = useState('')
  const [exibirSenha, setExibirSenha] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!senha) return
    aoConfirmar(senha)
  }

  const handleCancelar = () => {
    setSenha('')
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && handleCancelar()}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <Lock className="w-5 h-5" />
            <DialogTitle className="text-lg font-bold text-slate-100">PDF protegido</DialogTitle>
          </div>
          <DialogDescription className="text-slate-300 text-sm">
            Este arquivo exige uma senha para leitura. Informe a senha para continuar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="pdf-senha" className="text-slate-200 text-xs font-semibold">
              Senha
            </Label>
            <div className="relative">
              <Input
                id="pdf-senha"
                type={exibirSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Informe a senha da fatura"
                autoFocus
                className="bg-slate-800 border-slate-700 text-slate-100 pr-10 focus:ring-teal-500 focus:border-teal-500"
              />
              <button
                type="button"
                onClick={() => setExibirSenha(!exibirSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none"
              >
                {exibirSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <Checkbox
              id="exibir-senha-check"
              checked={exibirSenha}
              onCheckedChange={(checked) => setExibirSenha(!!checked)}
              className="data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600 border-slate-600"
            />
            <Label
              htmlFor="exibir-senha-check"
              className="text-xs text-slate-300 cursor-pointer font-normal select-none"
            >
              Exibir senha
            </Label>
          </div>

          {erroMensagem && (
            <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/60 p-2.5 rounded">
              {erroMensagem}
            </p>
          )}

          <div className="text-[11px] text-slate-400 bg-slate-800/60 p-2.5 rounded border border-slate-700/50">
            🔒 <strong>Segurança estrita:</strong> a senha existe SOMENTE em memória durante a
            leitura e é imediatamente descartada. Ela nunca é gravada no banco, nem enviada a
            servidores ou armazenada em disco.
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelar}
              disabled={carregando}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!senha.trim() || carregando}
              className="bg-teal-600 hover:bg-teal-500 text-white font-medium"
            >
              {carregando ? 'Abrindo...' : 'Abrir PDF'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
