import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const KEY = 'theme'
const read = (): Theme => {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {
    // a browser blocking site data just loses the preference between visits
  }
  return 'system'
}

const systemPrefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

const Ctx = createContext<{ theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void }>({
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(read)
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    read() === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : (read() as 'light' | 'dark'),
  )

  useEffect(() => {
    const apply = () => {
      const next = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme
      setResolved(next)
      document.documentElement.classList.toggle('dark', next === 'dark')
      // Tells the browser which palette to paint native controls and scrollbars in.
      document.documentElement.style.colorScheme = next
    }
    apply()

    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {
      // ignored for the same reason as above
    }
  }

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
