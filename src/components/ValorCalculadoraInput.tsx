import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Calculator, Check, Delete } from 'lucide-react'

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
  const [showCalc, setShowCalc] = useState(false)
  const [expression, setExpression] = useState('')

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

  const handleCalcular = () => {
    try {
      // Validação de expressão aritmética segura (somente números e +, -, *, /, .)
      const cleanExp = expression.replace(/,/g, '.')
      if (!/^[0-9+\-*/. ]+$/.test(cleanExp)) {
        throw new Error('Expressão inválida')
      }
      // Avaliação aritmética segura com Function isolada
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${cleanExp})`)()
      if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
        const formatado = result.toFixed(2).replace('.', ',')
        onChange(formatado)
        setShowCalc(false)
      } else {
        throw new Error('Resultado inválido')
      }
    } catch {
      // Deixar na tela
    }
  }

  return (
    <div className="space-y-1.5 relative">
      <div className="relative flex items-center">
        <span className="absolute left-3 text-sm font-semibold text-slate-400">R$</span>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          className={`pl-10 pr-10 font-bold text-base text-slate-900 ${className}`}
        />
        <button
          type="button"
          onClick={abrirCalc}
          title="Abrir calculadora integrada (PRD: confirmada pelo botão '=')"
          className="absolute right-2.5 p-1 text-slate-400 hover:text-emerald-600 transition"
        >
          <Calculator className="w-4 h-4" />
        </button>
      </div>

      {showCalc && (
        <div className="absolute right-0 top-12 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-64 space-y-2 animate-in fade-in-50 zoom-in-95">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Calculadora SAP
            </span>
            <span className="text-[10px] text-slate-400">Pressione = para aplicar</span>
          </div>

          <div className="bg-slate-50 p-2 rounded-lg text-right font-mono text-sm font-bold text-slate-800 break-all min-h-[32px] border border-slate-200">
            {expression || '0'}
          </div>

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
