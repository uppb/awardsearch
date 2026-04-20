export type LoopRunnerSource = "manual" | "scheduled"

export type LoopRunnerTriggerResult =
  | { started: true }
  | { started: false, reason: "already_running" }

export type LoopRunnerStatus = {
  running: boolean
  lastStartedAt: string | undefined
  lastCompletedAt: string | undefined
  lastError: string | undefined
  intervalMs: number
}

export type LoopRunnerLogger = {
  info: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export type LoopRunnerOptions = {
  name: string
  intervalMs: number
  run: () => Promise<unknown>
  now: () => Date
  logger: LoopRunnerLogger
}

export const createLoopRunner = ({
  name,
  intervalMs,
  run,
  now,
  logger,
}: LoopRunnerOptions) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let runningPromise: Promise<void> | undefined
  let stopped = true
  let lastStartedAt: string | undefined
  let lastCompletedAt: string | undefined
  let lastError: string | undefined

  const scheduleNext = () => {
    if (stopped)
      return

    if (timer)
      clearTimeout(timer)

    timer = setTimeout(() => {
      timer = undefined
      void trigger("scheduled")
    }, intervalMs)
  }

  const trigger = async (_source: LoopRunnerSource): Promise<LoopRunnerTriggerResult> => {
    if (runningPromise)
      return { started: false, reason: "already_running" }

    const startedAt = now().toISOString()
    lastStartedAt = startedAt
    logger.info(`[${name}] started`)

    runningPromise = (async () => {
      try {
        await run()
        lastError = undefined
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        logger.error(`[${name}] failed`, error)
      } finally {
        lastCompletedAt = now().toISOString()
        runningPromise = undefined
        if (!stopped)
          scheduleNext()
      }
    })()

    return { started: true }
  }

  return {
    start() {
      if (!stopped && (timer || runningPromise))
        return

      stopped = false
      if (!runningPromise && !timer)
        scheduleNext()
    },

    async stop() {
      stopped = true

      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }

      await runningPromise
    },

    trigger,

    waitForIdle: async () => {
      await runningPromise
    },

    getStatus: (): LoopRunnerStatus => ({
      running: runningPromise !== undefined,
      lastStartedAt,
      lastCompletedAt,
      lastError,
      intervalMs,
    }),
  }
}
