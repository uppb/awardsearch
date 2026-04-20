# Award Alerts API

This is the human-readable reference for the internal `award-alerts` admin API.

Contract source of truth:

- machine-readable: `awardwiz/backend/award-alerts/openapi.json`
- runtime implementation: `awardwiz/backend/award-alerts/http-handlers.ts` and `awardwiz/backend/award-alerts/server.ts`

## Runtime Assumptions

- internal/admin API only
- no authentication middleware today
- JSON-only responses
- write endpoints require a non-empty JSON object body
- malformed JSON returns `400 bad_request`

Base URL in local development:

```text
http://127.0.0.1:2233
```

## Error Shape

All structured API errors use:

```json
{
  "error": {
    "code": "bad_request",
    "message": "request body must be a non-empty JSON object"
  }
}
```

Current error codes:

- `bad_request`
- `alert_not_found`
- `not_found`

## Health

`GET /health`

Response:

```json
{
  "ok": true
}
```

## Alert CRUD

### Create Alert

`POST /api/award-alerts`

Single-date example:

```json
{
  "program": "alaska",
  "origin": "SHA",
  "destination": "HND",
  "date": "2026-05-02",
  "cabin": "business",
  "maxMiles": 35000
}
```

Date-range example:

```json
{
  "program": "alaska",
  "origin": "SHA",
  "destination": "HND",
  "startDate": "2026-05-01",
  "endDate": "2026-05-03",
  "cabin": "business",
  "maxMiles": 35000,
  "nonstopOnly": true
}
```

Notes:

- `userId` is optional
- new alerts default to `pollIntervalMinutes=1` and `minNotificationIntervalMinutes=10`
- the response body is the created alert object directly, not an envelope

### List Alerts

`GET /api/award-alerts`

Response:

```json
[
  {
    "id": "alert-1",
    "program": "alaska",
    "origin": "SHA",
    "destination": "HND",
    "dateMode": "single_date",
    "date": "2026-05-02",
    "cabin": "business",
    "nonstopOnly": false,
    "maxMiles": 35000,
    "active": true,
    "pollIntervalMinutes": 1,
    "minNotificationIntervalMinutes": 10,
    "createdAt": "2026-04-20T00:00:00.000Z",
    "updatedAt": "2026-04-20T00:00:00.000Z"
  }
]
```

### Get Alert

`GET /api/award-alerts/:id`

Returns the raw alert object.

### Update Alert

`PATCH /api/award-alerts/:id`

Example:

```json
{
  "startDate": "2026-05-01",
  "endDate": "2026-05-03",
  "maxCash": null,
  "active": false
}
```

Notes:

- patch fields are partial
- only `userId`, `maxMiles`, and `maxCash` are clearable with `null`
- for date scope, either provide `date`, or provide both `startDate` and `endDate`, or omit all date fields to preserve the existing scope
- changing date scope is done by setting the new date fields you want, not by clearing with `null`
- empty `{}` bodies are rejected at the HTTP boundary

### Pause / Resume / Delete

- `POST /api/award-alerts/:id/pause`
- `POST /api/award-alerts/:id/resume`
- `DELETE /api/award-alerts/:id`

Each returns the raw alert object after the operation.

## Operations

### Runtime Status

`GET /api/award-alerts/status`

Response shape:

```json
{
  "databasePath": "./tmp/award-alerts.sqlite",
  "evaluator": {
    "running": false,
    "intervalMs": 60000
  },
  "notifier": {
    "running": false,
    "intervalMs": 60000
  }
}
```

When present, loop status may also include `lastStartedAt`, `lastCompletedAt`, and `lastError`.

### Trigger Evaluator / Notifier

- `POST /api/award-alerts/operations/run-evaluator`
- `POST /api/award-alerts/operations/run-notifier`

Possible responses:

```json
{ "started": true }
```

```json
{ "started": false, "reason": "already_running" }
```

### Preview

`POST /api/award-alerts/operations/preview`

Known live date-range example:

```json
{
  "program": "alaska",
  "origin": "SHA",
  "destination": "HND",
  "startDate": "2026-05-01",
  "endDate": "2026-05-03",
  "cabin": "business",
  "maxMiles": 35000
}
```

Response shape:

```json
{
  "hasMatch": true,
  "matchedDates": ["2026-05-02", "2026-05-03"],
  "matchingResults": [
    {
      "date": "2026-05-02",
      "flightNo": "JL 82",
      "origin": "SHA",
      "destination": "HND",
      "departureDateTime": "2026-05-02 12:45:00",
      "arrivalDateTime": "2026-05-02 16:50:00",
      "cabin": "business",
      "miles": 32500,
      "cash": 25.7,
      "currencyOfCash": "USD",
      "bookingClass": "U",
      "segmentCount": 1
    }
  ],
  "bestMatchSummary": {
    "date": "2026-05-02",
    "flightNo": "JL 82",
    "origin": "SHA",
    "destination": "HND",
    "departureDateTime": "2026-05-02 12:45:00",
    "arrivalDateTime": "2026-05-02 16:50:00",
    "cabin": "business",
    "miles": 32500,
    "cash": 25.7,
    "currencyOfCash": "USD",
    "bookingClass": "U",
    "segmentCount": 1
  },
  "matchFingerprint": "fp-1",
  "bookingUrl": "https://..."
}
```

Preview is non-persistent:

- it does not create an alert row
- it does not mutate alert state
- it does not enqueue notification events

## History

### Alert Runs

`GET /api/award-alerts/:id/runs`

Returns reverse-chronological evaluation runs for the alert.

### Notification Events

`GET /api/award-alerts/:id/notifications`

Returns reverse-chronological notification-event history for the alert.

Notification statuses:

- `pending`
- `processing`
- `delivered_unconfirmed`
- `sent`
- `failed`

## Local Verification Flow

Start the service:

```bash
just run-award-alerts-service
```

Create the known single-date alert:

```bash
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts \
  -H 'content-type: application/json' \
  -d '{
    "program":"alaska",
    "origin":"SHA",
    "destination":"HND",
    "date":"2026-05-02",
    "cabin":"business",
    "maxMiles":35000
  }'
```

Preview the known date range:

```bash
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/preview \
  -H 'content-type: application/json' \
  -d '{
    "program":"alaska",
    "origin":"SHA",
    "destination":"HND",
    "startDate":"2026-05-01",
    "endDate":"2026-05-03",
    "cabin":"business",
    "maxMiles":35000
  }'
```

Manually trigger evaluation:

```bash
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/run-evaluator
```
