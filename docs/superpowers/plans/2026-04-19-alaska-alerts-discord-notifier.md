# Alaska Alerts Discord Notifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Alaska alerts email notifier with a shared Discord webhook notifier and include a direct Alaska booking link in each alert event.

**Architecture:** Keep the existing evaluator and notifier split. The evaluator remains responsible for deciding when to emit a `notification_events` record, but its payload becomes Discord-ready and includes the generic Alaska booking URL for the best matched date. The notifier worker stops using Firebase Auth and SMTP, posts one Discord webhook message per event, and records sent or failed status without affecting evaluation state.

**Tech Stack:** TypeScript, Vitest, Vite Node worker entry points, Firestore repository layer, Discord incoming webhooks, existing Alaska alert evaluator/matcher modules

---

## File Map

- Modify: `awardwiz/backend/alaska-alerts/types.ts`
  - Replace the email-shaped `NotificationEvent` payload with a Discord-oriented payload contract.
- Modify: `awardwiz/backend/alaska-alerts/evaluator.ts`
  - Build `bookingUrl`, `matchCount`, and rule-summary fields into emitted events.
- Modify: `test/awardwiz/alaska-alerts/evaluator.test.ts`
  - Lock down the new event payload shape and booking-link behavior.
- Modify: `awardwiz/backend/alaska-alerts/notifier.ts`
  - Replace SMTP/Firebase delivery with Discord webhook delivery and embed formatting.
- Modify: `awardwiz/workers/alaska-alerts-notifier.ts`
  - Replace Nodemailer transport setup with Discord webhook configuration and sequential sends.
- Modify: `test/awardwiz/alaska-alerts/notifier.test.ts`
  - Replace email tests with webhook payload and failure-path coverage.
- Delete: `awardwiz/backend/alaska-alerts/firebase-admin.ts`
  - Remove the no-longer-used email-only Firebase Auth dependency from the Alaska alert path.
- Modify: `README.md`
  - Document the Discord webhook configuration for the Alaska notifier.

### Task 1: Make Notification Events Discord-Ready

**Files:**
- Modify: `awardwiz/backend/alaska-alerts/types.ts`
- Modify: `awardwiz/backend/alaska-alerts/evaluator.ts`
- Modify: `test/awardwiz/alaska-alerts/evaluator.test.ts`

- [ ] **Step 1: Write the failing evaluator test for the new event payload**

```ts
it("creates a Discord-ready notification event with a booking URL", async () => {
  const createNotificationEvent = vi.fn().mockResolvedValue(undefined)

  await evaluateOneAlert({
    alert: {
      ...baseAlert,
      origin: "SFO",
      destination: "HNL",
      cabin: "business",
      nonstopOnly: true,
      maxMiles: 90000,
      maxCash: 10,
    },
    repository: {
      getState: vi.fn().mockResolvedValue(undefined),
      saveEvaluation: vi.fn().mockResolvedValue(undefined),
      createNotificationEvent,
    },
    searchAlaska: vi.fn().mockResolvedValue([matchingFlight]),
    now: new Date("2026-04-19T08:00:00.000Z"),
  })

  expect(createNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({
    payload: expect.objectContaining({
      matchedDates: ["2026-07-01"],
      matchCount: 1,
      nonstopOnly: true,
      maxMiles: 90000,
      maxCash: 10,
      bookingUrl: "https://www.alaskaair.com/search/results?A=1&O=SFO&D=HNL&OD=2026-07-01&OT=Anytime&RT=false&UPG=none&ShoppingMethod=onlineaward&locale=en-us",
      bestMatch: expect.objectContaining({
        flightNo: "AS 843",
        date: "2026-07-01",
      }),
    }),
  }))
})
```

- [ ] **Step 2: Run the evaluator test to verify it fails**

Run:

```bash
npm exec -- vitest run test/awardwiz/alaska-alerts/evaluator.test.ts -t "creates a Discord-ready notification event with a booking URL"
```

Expected: FAIL because `NotificationEvent["payload"]` does not yet contain `matchCount`, `nonstopOnly`, `maxMiles`, `maxCash`, or `bookingUrl`.

- [ ] **Step 3: Update the notification payload type**

```ts
export type NotificationEvent = {
  id: string
  alertId: string
  userId: string
  createdAt: string
  payload: {
    origin: string
    destination: string
    cabin: AlaskaAlertCabin
    matchedDates: string[]
    matchCount: number
    nonstopOnly: boolean
    maxMiles: number | undefined
    maxCash: number | undefined
    bestMatch: AlaskaAlertMatch | undefined
    bookingUrl: string
  }
  status: "pending" | "sent" | "failed"
  sentAt: string | undefined
  failureReason: string | undefined
}
```

- [ ] **Step 4: Implement the evaluator payload changes**

```ts
const buildBookingUrl = ({ origin, destination, date }: {
  origin: string
  destination: string
  date: string
}) =>
  `https://www.alaskaair.com/search/results?A=1&O=${origin}&D=${destination}&OD=${date}&OT=Anytime&RT=false&UPG=none&ShoppingMethod=onlineaward&locale=en-us`

await repository.createNotificationEvent({
  id: buildNotificationEventId(alert.id, matchEvaluation.matchFingerprint, priorState?.lastNotifiedAt),
  alertId: alert.id,
  userId: alert.userId,
  createdAt: nowIso,
  payload: {
    origin: alert.origin,
    destination: alert.destination,
    cabin: alert.cabin,
    matchedDates: matchEvaluation.matchedDates,
    matchCount: matchEvaluation.matchingResults.length,
    nonstopOnly: alert.nonstopOnly,
    maxMiles: alert.maxMiles,
    maxCash: alert.maxCash,
    bestMatch: matchEvaluation.bestMatchSummary,
    bookingUrl: buildBookingUrl({
      origin: alert.origin,
      destination: alert.destination,
      date: matchEvaluation.bestMatchSummary?.date ?? matchEvaluation.matchedDates[0]!,
    }),
  },
  status: "pending",
  sentAt: undefined,
  failureReason: undefined,
})
```

- [ ] **Step 5: Run the targeted evaluator tests**

Run:

```bash
npm exec -- vitest run test/awardwiz/alaska-alerts/evaluator.test.ts
```

Expected: PASS, including the existing retry/throttle tests plus the new payload assertion.

- [ ] **Step 6: Commit Task 1**

```bash
git add awardwiz/backend/alaska-alerts/types.ts awardwiz/backend/alaska-alerts/evaluator.ts test/awardwiz/alaska-alerts/evaluator.test.ts
git commit -m "feat: emit Discord-ready Alaska alert events"
```

### Task 2: Replace Email Delivery With Discord Webhooks

**Files:**
- Modify: `awardwiz/backend/alaska-alerts/notifier.ts`
- Modify: `awardwiz/workers/alaska-alerts-notifier.ts`
- Modify: `test/awardwiz/alaska-alerts/notifier.test.ts`
- Delete: `awardwiz/backend/alaska-alerts/firebase-admin.ts`

- [ ] **Step 1: Write the failing notifier tests for Discord delivery**

```ts
it("posts a Discord embed and marks the event sent", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 204,
    text: vi.fn().mockResolvedValue(""),
  })

  await sendNotificationEvent({
    event,
    webhookUrl: "https://discord.com/api/webhooks/test/id",
    fetchFn: fetchMock,
    repository,
    now: new Date("2026-04-19T09:00:00.000Z"),
  })

  expect(fetchMock).toHaveBeenCalledWith(
    "https://discord.com/api/webhooks/test/id",
    expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
  )
  expect(repository.markNotificationSent).toHaveBeenCalledWith("event-1", "2026-04-19T09:00:00.000Z")
})

it("marks the event failed when Discord returns a non-2xx response", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 429,
    text: vi.fn().mockResolvedValue("rate limited"),
  })

  await sendNotificationEvent({
    event,
    webhookUrl: "https://discord.com/api/webhooks/test/id",
    fetchFn: fetchMock,
    repository,
    now: new Date("2026-04-19T09:00:00.000Z"),
  })

  expect(repository.markNotificationFailed).toHaveBeenCalledWith("event-1", "Discord webhook failed: 429 rate limited")
})
```

- [ ] **Step 2: Run the notifier test file to verify it fails**

Run:

```bash
npm exec -- vitest run test/awardwiz/alaska-alerts/notifier.test.ts
```

Expected: FAIL because `sendNotificationEvent()` still expects a mail transporter and still imports Firebase/email dependencies.

- [ ] **Step 3: Replace the notifier implementation with a Discord webhook sender**

```ts
const buildDiscordBody = (event: NotificationEvent, username: string | undefined, avatarUrl: string | undefined) => ({
  username,
  avatar_url: avatarUrl,
  embeds: [{
    title: `Alaska award alert: ${event.payload.origin} -> ${event.payload.destination}`,
    color: 0x1f8b4c,
    fields: [
      { name: "Cabin", value: event.payload.cabin, inline: true },
      { name: "Dates", value: event.payload.matchedDates.join(", "), inline: true },
      { name: "Matches", value: String(event.payload.matchCount), inline: true },
      { name: "Best Fare", value: event.payload.bestMatch ? `${event.payload.bestMatch.flightNo} • ${event.payload.bestMatch.miles.toLocaleString()} mi + ${event.payload.bestMatch.currencyOfCash} ${event.payload.bestMatch.cash.toFixed(2)}` : "Unavailable", inline: false },
      { name: "Booking", value: event.payload.bookingUrl, inline: false },
    ],
    footer: { text: `alert=${event.alertId}` },
    timestamp: event.createdAt,
  }],
})

export const sendNotificationEvent = async ({ event, webhookUrl, fetchFn, repository, now, username, avatarUrl }: {
  event: NotificationEvent
  webhookUrl: string
  fetchFn: typeof fetch
  repository: NotificationRepository
  now: Date
  username?: string
  avatarUrl?: string
}) => {
  try {
    const response = await fetchFn(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordBody(event, username, avatarUrl)),
    })

    if (!response.ok)
      throw new Error(`Discord webhook failed: ${response.status} ${await response.text()}`)

    await repository.markNotificationSent(event.id, now.toISOString())
  } catch (error) {
    await repository.markNotificationFailed(event.id, (error as Error).message)
  }
}
```

- [ ] **Step 4: Update the notifier worker to require Discord configuration**

```ts
const webhookUrl = process.env.DISCORD_WEBHOOK_URL ?? import.meta.env.DISCORD_WEBHOOK_URL
if (!webhookUrl)
  throw new Error("DISCORD_WEBHOOK_URL is required for alaska-alerts-notifier")

const username = process.env.DISCORD_USERNAME ?? import.meta.env.DISCORD_USERNAME
const avatarUrl = process.env.DISCORD_AVATAR_URL ?? import.meta.env.DISCORD_AVATAR_URL
const pendingEvents = await repository.listPendingNotificationEvents(20)

for (const event of pendingEvents)
  await sendNotificationEvent({
    event,
    webhookUrl,
    fetchFn: fetch,
    repository,
    now: new Date(),
    username,
    avatarUrl,
  })
```

- [ ] **Step 5: Remove the unused Firebase helper from the Alaska notifier path**

```bash
git rm awardwiz/backend/alaska-alerts/firebase-admin.ts
```

- [ ] **Step 6: Run the notifier tests**

Run:

```bash
npm exec -- vitest run test/awardwiz/alaska-alerts/notifier.test.ts
```

Expected: PASS, including both the success path and the non-2xx Discord failure path.

- [ ] **Step 7: Commit Task 2**

```bash
git add awardwiz/backend/alaska-alerts/notifier.ts awardwiz/workers/alaska-alerts-notifier.ts test/awardwiz/alaska-alerts/notifier.test.ts
git commit -m "feat: send Alaska alerts to Discord webhook"
```

### Task 3: Document and Verify the Discord-Only Notifier

**Files:**
- Modify: `README.md`
- Modify: `awardwiz/workers/alaska-alerts-notifier.ts`

- [ ] **Step 1: Update developer docs for the new env vars and runtime behavior**

```md
### Workers

- `VITE_FIREBASE_SERVICE_ACCOUNT_JSON`: Required by `awardwiz/workers/marked-fares.ts` and the Alaska evaluator when not using emulators.
- `DISCORD_WEBHOOK_URL`: Required by `awardwiz/workers/alaska-alerts-notifier.ts`.
- `DISCORD_USERNAME`: Optional override for the displayed Discord webhook username.
- `DISCORD_AVATAR_URL`: Optional override for the displayed Discord webhook avatar.

## Notes On Notifications

- `awardwiz/workers/alaska-alerts-evaluator.ts` emits pending notification events for matching Alaska alerts.
- `awardwiz/workers/alaska-alerts-notifier.ts` posts those events to a shared Discord webhook.
- Each Discord alert includes the generic Alaska booking results link for the best matched date.
```

- [ ] **Step 2: Run targeted verification for the notifier migration**

Run:

```bash
npm exec -- vitest run test/awardwiz/alaska-alerts/evaluator.test.ts test/awardwiz/alaska-alerts/notifier.test.ts
npm exec tsc
```

Expected:

```text
All Alaska alert evaluator/notifier tests pass
TypeScript exits cleanly with code 0
```

- [ ] **Step 3: Commit Task 3**

```bash
git add README.md
git commit -m "docs: document Discord Alaska alert notifications"
```

## Self-Review

- Spec coverage:
  - Discord-only shared webhook delivery is covered by Task 2.
  - Generic Alaska booking URL in each notification is covered by Task 1.
  - Required env vars and operational behavior are covered by Task 3.
- Placeholder scan:
  - No `TODO`, `TBD`, or deferred implementation language remains in task steps.
- Type consistency:
  - `NotificationEvent.payload.bookingUrl`, `matchCount`, `nonstopOnly`, `maxMiles`, and `maxCash` are introduced in Task 1 and referenced consistently in Task 2.
