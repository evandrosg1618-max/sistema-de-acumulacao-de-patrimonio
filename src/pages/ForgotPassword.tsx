import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft, Mail } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      toast.error('Informe seu e-mail')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      })

      if (error) {
        toast.error('Erro ao enviar e-mail: ' + error.message)
      } else {
        setSent(true)
        toast.success('Instruções enviadas para o seu e-mail!')
      }
    } catch (err: any) {
      toast.error('Ocorreu um erro.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-600 text-white font-bold text-2xl shadow-md">
            S
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Recuperação de Acesso
          </h1>
          <p className="text-xs text-slate-500">Sistema de Acumulação de Capital (SAP)</p>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white">
          {sent ? (
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <Mail className="w-6 h-6" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">Verifique seu e-mail</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Enviamos um link de recuperação para <strong>{email}</strong>. Siga as instruções
                para definir uma nova senha.
              </p>
              <Link to="/entrar">
                <Button variant="outline" className="text-xs mt-2 w-full">
                  Voltar para o Login
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardHeader className="space-y-1">
                <CardTitle className="text-lg">Esqueceu sua senha?</CardTitle>
                <CardDescription className="text-xs">
                  Digite seu e-mail cadastrado para receber o link de redefinição de senha.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs">
                    E-mail
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
                >
                  {loading ? 'Enviando...' : 'Enviar Link de Recuperação'}
                </Button>
                <Link
                  to="/entrar"
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Voltar ao Login
                </Link>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
