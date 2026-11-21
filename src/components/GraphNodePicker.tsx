import { useId, useState } from 'react'
import type { GraphElement } from '../lib/graphParser'

export function GraphNodePicker({
  label,
  value,
  onChange,
  elements,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  elements: GraphElement[]
}) {
  const inputId = useId()
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const needle = value.toLowerCase()
  const nodes = elements
    .filter(
      element =>
        element.data.source === undefined &&
        `${element.data.id ?? ''} ${element.data.label ?? ''}`.toLowerCase().includes(needle),
    )
    .slice(0, 20)
  const safeIndex = activeIndex >= 0 && activeIndex < nodes.length ? activeIndex : -1
  const activeOptionId = safeIndex >= 0 ? `${listboxId}-opt-${safeIndex}` : undefined

  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <label htmlFor={inputId} style={{ fontSize: 12, fontWeight: 500 }}>
        {label}
      </label>
      <input
        id={inputId}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? activeOptionId : undefined}
        value={value}
        placeholder="Search a name or ID"
        onFocus={() => setOpen(true)}
        onChange={event => {
          onChange(event.target.value)
          setActiveIndex(-1)
          setOpen(true)
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            if (open) {
              event.preventDefault()
              event.stopPropagation()
              event.nativeEvent.stopPropagation()
              setOpen(false)
              setActiveIndex(-1)
            }
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setActiveIndex(current => (nodes.length ? (current + 1) % nodes.length : -1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            setActiveIndex(current =>
              nodes.length ? (current <= 0 ? nodes.length - 1 : current - 1) : -1,
            )
          } else if (event.key === 'Enter') {
            const target = safeIndex >= 0 ? nodes[safeIndex] : nodes.length === 1 ? nodes[0] : null
            if (target?.data.id) {
              event.preventDefault()
              onChange(target.data.id)
              setOpen(false)
              setActiveIndex(-1)
            }
          }
        }}
        onBlur={() => {
          setOpen(false)
          setActiveIndex(-1)
        }}
      />
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${label} matches`}
          style={{ maxHeight: 160, overflow: 'auto', display: 'grid', gap: 4 }}
        >
          {nodes.map((node, index) => (
            <button
              id={`${listboxId}-opt-${index}`}
              type="button"
              role="option"
              aria-selected={safeIndex === index || value === node.data.id}
              key={node.data.id}
              style={
                safeIndex === index
                  ? { outline: '2px solid var(--pure-chrome-accent, #267b66)', outlineOffset: -2 }
                  : undefined
              }
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                onChange(node.data.id!)
                setOpen(false)
                setActiveIndex(-1)
              }}
            >
              {String(node.data.label || node.data.id)} · {node.data.id}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
