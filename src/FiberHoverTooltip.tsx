interface Props {
  x: number
  y: number
  fromA: number
  fromB: number
}

export default function FiberHoverTooltip({ x, y, fromA, fromB }: Props) {
  return (
    <div
      className="fiber-hover-tooltip"
      style={{ left: x + 16, top: y - 52 }}
    >
      <div className="fiber-hover-tooltip__label">Distancia física</div>
      <div>← <span className="fiber-hover-tooltip__value">A:</span> <strong>{fromA.toFixed(0)} m</strong></div>
      <div><span className="fiber-hover-tooltip__value">B:</span> <strong>{fromB.toFixed(0)} m</strong> →</div>
    </div>
  )
}
