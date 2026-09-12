const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

export function formatDateTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${dateFmt.format(d)} · ${timeFmt.format(d)}`
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export const firstLine = (s: string) => s.split('\n')[0]
