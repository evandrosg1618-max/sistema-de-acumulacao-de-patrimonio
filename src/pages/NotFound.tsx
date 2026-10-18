import { Link } from 'react-router-dom'
import { Activity, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col items-center justify-center p-6 text-[#F3F6FB] text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#111827] border border-[#263343] flex items-center justify-center text-[#17C3B2] mb-6 shadow-xl">
        <Activity className="w-7 h-7" />
      </div>

      <h1 className="text-6xl font-black font-mono text-[#17C3B2] mb-2">404</h1>
      <h2 className="text-xl font-bold mb-2">Página não encontrada</h2>
      <p className="text-xs text-[#96A3B8] max-w-sm mb-6 leading-relaxed">
        O ativo ou a rota que você tentou acessar não foi localizada em nossa base.
      </p>

      <Link
        to="/"
        className="px-5 py-2.5 rounded-xl bg-[#17C3B2] text-[#0A0F1E] font-semibold text-xs hover:bg-[#13A796] transition-all flex items-center gap-2 shadow-lg shadow-[#17C3B2]/20"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar para a Visão Geral
      </Link>
    </div>
  )
}
