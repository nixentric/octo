import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'

type Options = {
  title: string
  body?: string
  confirmLabel?: string
  destructive?: boolean
  /** Single OK button — for reporting a failure rather than asking a question. */
  alert?: boolean
}

const Ctx = createContext<(o: Options) => Promise<boolean>>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Options | null>(null)
  const resolve = useRef<((v: boolean) => void) | null>(null)

  const ask = useCallback(
    (o: Options) =>
      new Promise<boolean>((res) => {
        resolve.current = res
        setOptions(o)
      }),
    [],
  )

  const close = (value: boolean) => {
    setOptions(null)
    resolve.current?.(value)
    resolve.current = null
  }

  return (
    <Ctx.Provider value={ask}>
      {children}
      <Dialog open={!!options} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="max-w-md">
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.body && <DialogDescription>{options.body}</DialogDescription>}
          <DialogFooter>
            {!options?.alert && <Button variant="outline" onClick={() => close(false)}>Cancel</Button>}
            <Button variant={options?.destructive ? 'destructive' : 'default'} onClick={() => close(true)} autoFocus>
              {options?.confirmLabel ?? 'OK'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  )
}

export const useConfirm = () => useContext(Ctx)
