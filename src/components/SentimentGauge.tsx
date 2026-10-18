import React from 'react'

interface SentimentGaugeProps {
  score: number // 0 - 100
  size?: number
}

export const SentimentGauge: React.FC<SentimentGaugeProps> = ({ score, size = 180 }) => {
  const clamped = Math.max(0, Math.min(100, score))
  const strokeWidth = 14
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  // Show a 220 degree arc
  const arcLength = circumference * (240 / 360)
  const offset = arcLength - (clamped / 100) * arcLength

  const getScoreColor = (val: number) => {
    if (val >= 65) return '#34D399' // high positive
    if (val >= 45) return '#FBBF24' // neutral
    return '#F87171' // negative
  }

  const getSentimentText = (val: number) => {
    if (val >= 75) return 'Otimismo Forte'
    if (val >= 60) return 'Otimismo Moderado'
    if (val >= 45) return 'Neutro'
    if (val >= 30) return 'Pessimismo Moderado'
    return 'Extremo Risco'
  }

  const color = getScoreColor(clamped)

  return (
    <div className="flex flex-col items-center justify-center relative">
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size * 0.75 }}
      >
        <svg width={size} height={size} className="transform -rotate-[120deg] overflow-visible">
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1A2332"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Filled Animated Arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          <span className="text-4xl font-extrabold tracking-tight tabular-nums" style={{ color }}>
            {clamped}
          </span>
          <span className="text-[11px] font-semibold text-[#96A3B8] uppercase tracking-wider">
            de 100
          </span>
        </div>
      </div>

      <div className="text-center mt-2">
        <span
          className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {getSentimentText(clamped)}
        </span>
      </div>
    </div>
  )
}
