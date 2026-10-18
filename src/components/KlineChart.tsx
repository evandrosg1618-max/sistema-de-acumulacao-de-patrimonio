import React from 'react'
import { StockHistoryPoint } from '@/lib/supabase'

interface KlineChartProps {
  data: StockHistoryPoint[]
  height?: number
  ticker?: string
}

export const KlineChart: React.FC<KlineChartProps> = ({ data, height = 180, ticker }) => {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-[#1A2332]/50 border border-[#263343] rounded-xl text-xs text-[#96A3B8]"
        style={{ height }}
      >
        Sem dados históricos para exibir
      </div>
    )
  }

  // Calculate scales
  const allPrices = data.flatMap((d) => [d.open, d.high, d.low, d.close])
  const minPrice = Math.min(...allPrices) * 0.98
  const maxPrice = Math.max(...allPrices) * 1.02
  const priceRange = maxPrice - minPrice || 1

  const paddingBottom = 24
  const paddingTop = 12
  const usableHeight = height - paddingBottom - paddingTop

  const getY = (price: number) => {
    return height - paddingBottom - ((price - minPrice) / priceRange) * usableHeight
  }

  const svgWidth = 480
  const candleSlotWidth = svgWidth / data.length
  const candleBodyWidth = Math.min(22, candleSlotWidth * 0.6)

  return (
    <div className="w-full bg-[#111827] border border-[#263343] rounded-xl p-3 select-none">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[11px] font-semibold text-[#96A3B8] uppercase tracking-wider">
          Gráfico K-Line (Candlestick) {ticker && `• ${ticker}`}
        </span>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1 text-[#34D399]">
            <span className="w-2 h-2 rounded-sm bg-[#34D399]" /> Alta
          </span>
          <span className="flex items-center gap-1 text-[#F87171]">
            <span className="w-2 h-2 rounded-sm bg-[#F87171]" /> Baixa
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${svgWidth} ${height}`}
        className="w-full overflow-visible"
        style={{ height }}
      >
        {/* Subtle grid lines */}
        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = paddingTop + usableHeight * ratio
          const priceLevel = maxPrice - ratio * priceRange
          return (
            <g key={ratio}>
              <line
                x1={0}
                y1={y}
                x2={svgWidth}
                y2={y}
                stroke="#263343"
                strokeDasharray="2 4"
                strokeWidth={1}
              />
              <text
                x={svgWidth - 4}
                y={y - 3}
                textAnchor="end"
                fill="#96A3B8"
                fontSize={9}
                fontFamily="JetBrains Mono"
              >
                R$ {priceLevel.toFixed(1)}
              </text>
            </g>
          )
        })}

        {/* Candles */}
        {data.map((point, index) => {
          const xCenter = index * candleSlotWidth + candleSlotWidth / 2
          const isUp = point.close >= point.open
          const color = isUp ? '#34D399' : '#F87171'

          const yHigh = getY(point.high)
          const yLow = getY(point.low)
          const yOpen = getY(point.open)
          const yClose = getY(point.close)

          const bodyY = Math.min(yOpen, yClose)
          const bodyHeight = Math.max(3, Math.abs(yOpen - yClose))

          return (
            <g key={index} className="hover:opacity-80 transition-opacity cursor-pointer">
              {/* Wick */}
              <line
                x1={xCenter}
                y1={yHigh}
                x2={xCenter}
                y2={yLow}
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
              />

              {/* Candle Body */}
              <rect
                x={xCenter - candleBodyWidth / 2}
                y={bodyY}
                width={candleBodyWidth}
                height={bodyHeight}
                fill={color}
                rx={2}
              />

              {/* Date Label */}
              <text
                x={xCenter}
                y={height - 6}
                textAnchor="middle"
                fill="#96A3B8"
                fontSize={9}
                fontFamily="Inter"
              >
                {point.date}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
