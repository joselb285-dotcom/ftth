import { useEffect, useRef, useState } from 'react'

interface Props {
  label: React.ReactNode
  children: React.ReactNode
  align?: 'left' | 'right'
}

export default function DropdownMenu({ label, children, align = 'right' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  return (
    <div className="dropdown" ref={ref}>
      <button className="dropdown-btn" onClick={() => setOpen(o => !o)}>
        {label} <span className="dd-caret">▾</span>
      </button>
      {open && (
        <div
          className={`dropdown-panel${align === 'left' ? ' dd-panel-left' : ''}`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}
