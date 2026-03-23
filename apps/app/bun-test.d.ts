declare global {
  const describe: (name: string, fn: () => void) => void
  const it: (name: string, fn: () => void | Promise<void>) => void
  const expect: (value: unknown) => {
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    rejects: {
      toBe(expected: unknown): Promise<void>
    }
  }
}

export {}
