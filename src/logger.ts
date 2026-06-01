const isDev = import.meta.env.DEV

export const logger = {
  info(message: string, ...args: unknown[]) {
    if (isDev) console.info(`[ftth] ${message}`, ...args)
  },
  warn(message: string, ...args: unknown[]) {
    console.warn(`[ftth] ${message}`, ...args)
  },
  error(message: string, error?: unknown) {
    console.error(`[ftth] ${message}`, error)
  },
}
