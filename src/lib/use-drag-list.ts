import { useState, type DragEvent } from 'react'

export const move = <T,>(items: T[], from: number, to: number) => {
  const next = [...items]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

/**
 * Drag-to-reorder for a list of rows. Dragging is armed by pressing the handle,
 * so text selection inside a row keeps working.
 */
export function useDragList(onReorder: (from: number, to: number) => void) {
  const [from, setFrom] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [armed, setArmed] = useState(false)

  const reset = () => {
    setFrom(null)
    setOver(null)
    setArmed(false)
  }

  return {
    from,
    over,
    handleProps: {
      onMouseDown: () => setArmed(true),
      onMouseUp: () => setArmed(false),
      onTouchStart: () => setArmed(true),
      onTouchEnd: () => setArmed(false),
    },
    rowProps: (index: number) => ({
      draggable: armed,
      onDragStart: () => setFrom(index),
      onDragOver: (e: DragEvent) => {
        e.preventDefault()
        setOver(index)
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        if (from !== null && from !== index) onReorder(from, index)
        reset()
      },
      onDragEnd: reset,
    }),
  }
}
