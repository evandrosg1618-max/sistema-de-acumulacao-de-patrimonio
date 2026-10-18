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
        <span className="absolute left-3 text-sm font-bold text-sky-800 z-10">R$</span>
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
          className={`pl-10 pr-10 font-bold text-base bg-sky-50/80 border-sky-300 text-sky-950 placeholder:text-sky-400 focus-visible:ring-sky-500 focus-visible:border-sky-500 hover:bg-sky-50 ${className}`}
        />
        <button
          type="button"
          onClick={abrirCalc}
          title="Abrir calculadora integrada (botão = para aplicar)"
          className="absolute right-2.5 p-1 text-sky-700 hover:text-sky-950 transition hover:bg-sky-100 rounded"
        >
          <Calculator className="w-4 h-4" />
        </button>
      </div>

      {showCalc && (
        <div className="absolute right-0 top-12 z-50 bg-white rounded-xl shadow-2xl border border-sky-200 p-3 w-72 space-y-2 animate-in fade-in-50 zoom-in-95">
          <div className="flex items-center justify-between pb-1 border-b border-sky-100">
            <span className="text-[11px] font-bold text-sky-900 uppercase tracking-wider flex items-center gap-1">
              <Calculator className="w-3.5 h-3.5 text-sky-700" />
              Calculadora SAP
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-sky-600 hidden sm:inline">Teclado PC ativo</span>
              <button
                type="button"
                onClick={() => setShowCalc(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Visor em tonalidade azul claro com texto de alto contraste */}
          <div className="bg-sky-50/90 p-2.5 rounded-lg text-right font-mono text-base font-bold text-sky-950 break-all min-h-[38px] border border-sky-200 shadow-inner">
            {expression || '0'}
          </div>

          {/* Teclado da Calculadora: sempre disponível; no mobile é o teclado grande na tela */}
          <div className="grid grid-cols-4 gap-1.5 text-xs">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="col-span-2 text-rose-600 font-bold"
            >
              C
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBackspace}
              className="text-slate-600"
            >
              <Delete className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('/')}
              className="text-emerald-700 font-bold"
            >
              ÷
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('7')}
              className="font-semibold"
            >
              7
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('8')}
              className="font-semibold"
            >
              8
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('9')}
              className="font-semibold"
            >
              9
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('*')}
              className="text-emerald-700 font-bold"
            >
              ×
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('4')}
              className="font-semibold"
            >
              4
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('5')}
              className="font-semibold"
            >
              5
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('6')}
              className="font-semibold"
            >
              6
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('-')}
              className="text-emerald-700 font-bold"
            >
              -
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('1')}
              className="font-semibold"
            >
              1
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('2')}
              className="font-semibold"
            >
              2
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('3')}
              className="font-semibold"
            >
              3
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('+')}
              className="text-emerald-700 font-bold"
            >
              +
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('0')}
              className="col-span-2 font-semibold"
            >
              0
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAppend('.')}
              className="font-bold"
            >
              .
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCalcular}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              =
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
