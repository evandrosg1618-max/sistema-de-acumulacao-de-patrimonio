import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { ArrowLeft, Clock, ShieldCheck } from 'lucide-react'

interface PlaceholderPageProps {
  title: string
  description: string
  buildNumber: number
  buildName: string
  deliverables: string[]
}

export default function PlaceholderPage({
  title,
  description,
  buildNumber,
  buildName,
  deliverables,
}: PlaceholderPageProps) {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            <Badge variant="outline" className="text-teal-700 bg-teal-50 border-teal-200 text-xs">
              Build {buildNumber} — {buildName}
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">{description}</p>
        </div>

        <Link to="/">
          <Button variant="outline" size="sm" className="text-xs flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar ao Início
          </Button>
        </Link>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-600" />
            Módulo Programado no PRD SAP
          </CardTitle>
          <CardDescription className="text-xs">
            A infraestrutura de banco de dados e as políticas de segurança RLS já estão criadas e
            prontas no Supabase. A interface e as regras financeiras serão construídas na fase
            respectiva.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-xs font-semibold text-slate-800 mb-2">
              Entregas previstas para a Build {buildNumber}:
            </div>
            <ul className="space-y-1.5">
              {deliverables.map((item, idx) => (
                <li key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>
              Restrição respeitada: o PRD proíbe expressamente simulações parciais ou mocks da
              cadeia financeira antes de sua build oficial.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
