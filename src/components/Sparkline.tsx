import React from 'react'

interface SparklineProps {
  data: number[]
  isPositive?: boolean
  width?: number
  height?: number
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  isPositive = true,
  width = 100,
  height = 36,
}) => {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min === 0 ? 1 : max - min

  const points = data
    .map((val, index) => {
      const x = (index / (data.length - 1)) * (width - 4) + 2
      const y = height - 4 - ((val - min) / range) * (height - 8)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const strokeColor = isPositive ? '#34D399' : '#F87171'

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}
