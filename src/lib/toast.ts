/**
 * Global toast notification system.
 * Works from anywhere — React components, sync engine, etc.
 */

export interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
let nextId = 0
const listeners = new Set<Listener>()

function notify() {
  const snapshot = [...toasts]
  listeners.forEach(fn => fn(snapshot))
}

export function addToast(type: Toast['type'], message: string, durationMs = 3000) {
  const id = nextId++
  toasts = [...toasts, { id, type, message }]
  notify()
  if (durationMs > 0) {
    setTimeout(() => removeToast(id), durationMs)
  }
}

function removeToast(id: number) {
  toasts = toasts.filter(t => t.id !== id)
  notify()
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getToasts(): Toast[] {
  return toasts
}
