import React, { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Calculator, Delete, X } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'

interface ValorCalculadoraInputProps {
  id?: string
  value: string
  onChange: (val: string) => void
  disabled?: boolean
  className?: string
  required?: boolean
  placeholder?: string
}

export function ValorCalculadoraInput({
  id = 'valor-input',
  value,
  onChange,
  disabled = false,
  className = '',
  required = true,
  placeholder = '0,00',
}: ValorCalculadoraInputProps) {
  const isMobile = useIsMobile()
  const [showCalc, setShowCalc] = useState(false)
  const [expression, setExpression] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Ao abrir o popover no mobile ou alternar
  const abrirCalc = () => {
    setExpression(value ? value.replace(/\./g, '').replace(',', '.') : '')
    setShowCalc(!showCalc)
  }

  const handleAppend = (char: string) => {
    setExpression((prev) => prev + char)
  }

  const handleClear = () => {
    setExpression('')
  }

  const handleBackspace = () => {
    setExpression((prev) => prev.slice(0, -1))
  }

  const calcularExpressao = (expString: string): string | null => {
    try {
      const cleanExp = expString.replace(/,/g, '.').replace(/\s+/g, '')
      if (!cleanExp) return null
      // Somente números e operadores aritméticos básicos
      if (!/^[0-9+\-*/.()]+$/.test(cleanExp)) {
        return null
      }
      // Avaliação aritmética segura
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${cleanExp})`)()
      if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
        return result.toFixed(2).replace('.', ',')
      }
      return null
    } catch {
      return null
    }
  }

  const handleCalcular = () => {
    const res = calcularExpressao(expression)
    if (res !== null) {
      onChange(res)
      setShowCalc(false)
    }
  }

  // Teclado do PC no input principal (desktop)
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Se o usuário apertar Enter ou '=', tenta avaliar a expressão contida no input
    if (e.key === 'Enter' || e.key === '=') {
      const valAtual = value || ''
      // Se tiver operador aritmético, calcula
      if (/[+\-*/]/.test(valAtual)) {
        e.preventDefault()
        const res = calcularExpressao(valAtual)
        if (res !== null) {
          onChange(res)
        }
      }
    }
  }

  // Teclado do PC quando o modal/popup da calculadora está aberto
  useEffect(() => {
    if (!showCalc) return

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCalc(false)
        return
      }
      if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault()
        handleCalcular()
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        handleBackspace()
        return
      }
      if (/^[0-9+\-*/.,]$/.test(e.key)) {
        e.preventDefault()
        handleAppend(e.key === ',' ? '.' : e.key)
      }
    }

    window.addEventListener('keydown', handleWindowKeyDown)
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [showCalc, expression])

  return (
    <div className="space-y-1.5 relative">
      <div className="relative flex items-center">
        <span className="absolute left-3 text-sm font-bold text-slate-700 z-10">R$</span>
        <Input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          title="Em desktop: digite números e operadores (+, -, *, /) e aperte Enter para calcular"
          className={`pl-10 pr-10 font-bold text-base bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 hover:border-slate-400 ${className}`}
        />
        <button
          type="button"
          onClick={abrirCalc}
          title="Abrir calculadora integrada (botão = para aplicar)"
          className="absolute right-2.5 p-1 text-slate-600 hover:text-slate-900 transition hover:bg-slate-100 rounded"
        >
          <Calculator className="w-4 h-4 text-emerald-600" />
        </button>
      </div>

      {showCalc && (
        <div className="absolute right-0 top-12 z-50 bg-white rounded-xl shadow-2xl border border-slate-300 p-3 w-72 space-y-2 animate-in fade-in-50 zoom-in-95">
          <div className="flex items-center justify-between pb-1 border-b border-slate-200">
            <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1">
              <Calculator className="w-3.5 h-3.5 text-emerald-600" />
              Calculadora SAP
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 hidden sm:inline">Teclado PC ativo</span>
              <button
                type="button"
                onClick={() => setShowCalc(false)}
                className="text-slate-500 hover:text-slate-800 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Visor em tonalidade contrastada com texto preto e fundo nítido */}
          <div className="bg-slate-100 p-2.5 rounded-lg text-right font-mono text-lg font-bold text-slate-900 break-all min-h-[42px] border border-slate-300 shadow-inner">
            {expression || '0'}
          </div>

          {/* Teclado da Calculadora: teclas com alto contraste (fundo cinza escuro/médio, letras pretas/escuras nítidas) */}
          <div className="grid grid-cols-4 gap-1.5 text-xs">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="col-span-2 bg-rose-700 hover:bg-rose-800 text-white font-bold border-rose-800"
            >
              C
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBackspace}
              className="bg-slate-700 hover:bg-slate-800 text-white font-bold border-slate-800"
            >
              <Delete className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('/')}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold border-emerald-800 text-base"
            >
              ÷
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('7')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold border-slate-900 text-sm"
            >
              7
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('8')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold border-slate-900 text-sm"
            >
              8
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('9')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold border-slate-900 text-sm"
            >
              9
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('*')}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold border-emerald-800 text-base"
            >
              ×
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('4')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold border-slate-900 text-sm"
            >
              4
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('5')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold border-slate-900 text-sm"
            >
              5
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('6')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold border-slate-900 text-sm"
            >
              6
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('-')}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold border-emerald-800 text-base"
            >
              -
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('1')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold border-slate-900 text-sm"
            >
              1
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('2')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold border-slate-900 text-sm"
            >
              2
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('3')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold border-slate-900 text-sm"
            >
              3
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('+')}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold border-emerald-800 text-base"
            >
              +
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('0')}
              className="col-span-2 bg-slate-800 hover:bg-slate-900 text-white font-bold border-slate-900 text-sm"
            >
              0
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('.')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold border-slate-900 text-sm"
            >
              .
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCalcular}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-sm"
            >
              =
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
