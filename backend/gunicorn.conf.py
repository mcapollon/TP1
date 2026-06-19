"""
gunicorn.conf.py — gunicorn settings, auto-loaded from the working directory.

Gunicorn reads this file automatically when started from this directory, even
when the start command is a bare `gunicorn server:app` with no flags. This makes
the batch-export timeout fix robust to Render's "Start Command" overriding the
Procfile: the config below applies regardless of which start command is used,
unless that command explicitly passes a conflicting flag.

Why these values:
  - timeout 120: /api/export/batch is synchronous and can run ~1-2 min for a
    large sample. Gunicorn's DEFAULT 30s worker timeout was killing it mid-
    request, producing a 502 with no CORS headers (surfaced in the browser as a
    CORS error). 120s clears that wall and sits just above the upstream proxy's
    ~100s limit. (For batches that would exceed ~100s on a slow free-tier CPU,
    the real fix is an async job mode — out of scope here.)
  - threads 8: the work is I/O-bound (waiting on Yahoo). Threads let the single
    worker keep serving health checks and other requests while a batch runs, so
    the platform doesn't mark the service unhealthy mid-export.
  - workers 1: one process keeps the memory footprint within the free tier
    (pandas + yfinance per worker); concurrency comes from threads instead.
"""

import os

bind = f"0.0.0.0:{os.environ.get('PORT', '5000')}"
workers = 1
threads = 8
timeout = 120
