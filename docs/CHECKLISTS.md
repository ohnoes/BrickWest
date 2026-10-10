# Brew-day checklists

Standard operating steps for each stage of a brew, recorded per batch.

## How it works

- **Checklists are versioned.** Saving a checklist under an existing name creates the
  next version and retires the previous one. A batch that already started version 1
  keeps version 1's steps, so its record always shows what the operator followed.
- **Each batch runs a checklist once.** Starting the same checklist again returns the
  run that already exists.
- **Steps are recorded, never edited.** Every action on a step (done, skipped, problem,
  reopened) is a new row in `checklist_step_events` with the operator and time. The
  latest row is the step's current state; the rest is its history. A database trigger
  rejects updates and deletes on that table.
- **Skipping, reporting a problem and reopening need a reason.** A measured step needs
  its value, and a value outside the expected range needs a note and is flagged.
- **Retries cannot duplicate a step.** The device generates a `client_event_id` (a UUID)
  for each action. Sending the same id again is accepted and stored once. The web app
  uses this to keep steps recorded with no signal and send them when it is back online.

## In the web app

- **Checklists** page: write and edit checklists. One step per line; for a measurement
  add `= unit` and optionally a range, for example `Mash-in temperature = °C 64-68`.
- **Batch** page: start a checklist and work through it.
- **Today**: lists every checklist that still has steps to do, with the next step.

## API

All routes need a bearer token and live under `/api/checklists`.

| Method and path | Purpose |
| --- | --- |
| `GET /templates?stage=mashing` | Active checklists with their steps |
| `POST /templates` | Create a checklist, or the next version of an existing name |
| `DELETE /templates/:id` | Retire a checklist |
| `GET /open` | Runs with steps still to do, on batches in progress |
| `GET /batches/:batchId` | Runs for a batch, with each step's state and history |
| `POST /batches/:batchId` | Start a checklist: `{ "template_id": 3 }` |
| `POST /runs/:runId/steps/:stepId` | Record a step (below) |

```json
{
  "status": "done",
  "measured_value": 66.5,
  "note": null,
  "client_event_id": "0b8f6f0e-6c1e-4a52-9a0e-3f0d0f1b2c3d",
  "performed_at": "2026-10-10T16:26:00.000Z"
}
```

`status` is `done`, `skipped`, `exception` or `reopened`. `performed_at` is optional and
lets a device that was offline report when the step was really done; times in the future
are replaced with the server's time.

## Not included yet

- Assigning a checklist or step to a specific operator.
- Working fully offline: a step can be recorded with no signal, but opening a page still
  needs a connection.
