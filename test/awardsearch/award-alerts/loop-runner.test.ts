import { afterEach, describe, expect, it, vi } from "vitest"
import { createLoopRunner } from "../../../awardsearch/backend/award-alerts/loop-runner.js"

const createDeferred = () => {
  let resolveFn!: () => void
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve
  })

  return { promise, resolve: resolveFn }
}

describe("createLoopRunner", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("schedules work after start and cancels the timer on stop", async () => {
    vi.useFakeTimers()
    const run = vi.fn().mockResolvedValue(undefined)

    const loop = createLoopRunner({
      name: "evaluator",
      intervalMs: 1_000,
      run,
      now: vi.fn(() => new Date("2026-04-20T00:00:00.000Z")),
      logger: { info: vi.fn(), error: vi.fn() },
    })

    loop.start()
    expect(run).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(999)
    expect(run).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledOnce()

    await loop.stop()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(run).toHaveBeenCalledOnce()
  })

  it("prevents manual triggers after shutdown begins", async () => {
    const loop = createLoopRunner({
      name: "notifier",
      intervalMs: 5_000,
      run: vi.fn().mockResolvedValue(undefined),
      now: vi.fn(() => new Date("2026-04-20T00:00:00.000Z")),
      logger: { info: vi.fn(), error: vi.fn() },
    })

    loop.beginShutdown()

    await expect(loop.trigger("manual")).rejects.toThrow("shutting down")
  })

  it("does not emit an unhandled rejection when a scheduled tick fires after shutdown begins", async () => {
    vi.useFakeTimers()
    const unhandledRejection = vi.fn()
    process.on("unhandledRejection", unhandledRejection)

    const loop = createLoopRunner({
      name: "evaluator",
      intervalMs: 1_000,
      run: vi.fn().mockResolvedValue(undefined),
      now: vi.fn(() => new Date("2026-04-20T00:00:00.000Z")),
      logger: { info: vi.fn(), error: vi.fn() },
    })

    loop.start()
    await vi.advanceTimersByTimeAsync(1_000)
    loop.beginShutdown()
    await vi.advanceTimersByTimeAsync(1_000)
    await loop.stop()

    process.off("unhandledRejection", unhandledRejection)
    expect(unhandledRejection).not.toHaveBeenCalled()
  })

  it("prevents overlapping runs and reports already-running manual triggers", async () => {
    const deferred = createDeferred()
    const now = vi.fn()
      .mockReturnValueOnce(new Date("2026-04-20T00:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-04-20T00:00:01.000Z"))
      .mockReturnValueOnce(new Date("2026-04-20T00:00:02.000Z"))

    const loop = createLoopRunner({
      name: "evaluator",
      intervalMs: 1000,
      run: vi.fn(async () => {
        await deferred.promise
      }),
      now,
      logger: { info: vi.fn(), error: vi.fn() },
    })

    const first = await loop.trigger("manual")
    const second = await loop.trigger("manual")

    expect(first).toEqual({ started: true })
    expect(second).toEqual({ started: false, reason: "already_running" })
    expect(loop.getStatus()).toEqual({
      running: true,
      lastStartedAt: "2026-04-20T00:00:00.000Z",
      lastCompletedAt: undefined,
      lastError: undefined,
      intervalMs: 1000,
    })

    deferred.resolve()
    await loop.waitForIdle()

    expect(loop.getStatus()).toEqual({
      running: false,
      lastStartedAt: "2026-04-20T00:00:00.000Z",
      lastCompletedAt: "2026-04-20T00:00:01.000Z",
      lastError: undefined,
      intervalMs: 1000,
    })
  })

  it("records the last error when a run fails", async () => {
    const loop = createLoopRunner({
      name: "notifier",
      intervalMs: 5000,
      run: vi.fn().mockRejectedValue(new Error("loop failed")),
      now: vi.fn(() => new Date("2026-04-20T00:00:00.000Z")),
      logger: { info: vi.fn(), error: vi.fn() },
    })

    await expect(loop.trigger("manual")).resolves.toEqual({ started: true })
    await loop.waitForIdle()

    expect(loop.getStatus()).toMatchObject({
      running: false,
      lastStartedAt: "2026-04-20T00:00:00.000Z",
      lastCompletedAt: "2026-04-20T00:00:00.000Z",
      lastError: "loop failed",
      intervalMs: 5000,
    })
  })
})
