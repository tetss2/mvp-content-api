# Async Generation Queue

Lightweight in-memory queue for expensive media generation in `index.js`.

## Scope

The queue is intentionally small and runtime-local:

- no Redis
- no BullMQ
- no database
- no microservices
- no production/main flow refactor

It covers:

- image jobs
- video jobs

Text generation and ordinary bot commands stay synchronous.

## Job States

Each job has one of four states:

- `queued`
- `processing`
- `completed`
- `failed`

Progress is tracked separately and sent to Telegram status messages:

- `queued`
- `generating image`
- `generating voice`
- `generating video`
- `uploading`
- `completed`

If Fal/Fish/Cloudinary hangs or a long job exceeds its timeout, the job moves to `failed` and the queue slot is released.

## Concurrency

Defaults:

- images: max `2` active jobs
- videos: max `1` active job

Environment overrides:

```bash
GENERATION_IMAGE_CONCURRENCY=2
GENERATION_VIDEO_CONCURRENCY=1
GENERATION_IMAGE_TIMEOUT_MS=120000
GENERATION_VIDEO_TIMEOUT_MS=600000
```

The queue is in-memory, so pending and active jobs are lost on process restart. This is expected for the current beta runtime.

## User Behavior

When a user starts image/video generation, the bot immediately sends:

```text
Generation queued...
```

Then it updates the same status message as the worker progresses. The Telegram callback handler no longer waits for the whole Fal/Fish pipeline.

Limits and runtime costs are incremented only after a successful generated media result. Failed queued jobs do not spend media limits.

## Admin Command

```text
/queue_status
```

Shows:

- active jobs
- queued jobs
- processing users
- queue sizes
- current active and queued job lines

Access is restricted to `admin/full_access` via the existing paid beta admin guard.

## Current Integration Points

Image jobs:

- `/test_image`
- custom scene image
- regenerate photo
- topic photo
- office photo

Video jobs:

- `/test_video`
- regenerate video
- make video from selected/uploaded photo

Voice-only generation remains synchronous, but video test jobs report `generating voice` because voice is part of that video pipeline.

