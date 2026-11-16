# Deterministic HTTP collection timer

A GitHub-hosted Node process runs a start/collect/finish HTTPS protocol. It uses no models and requires no local computer or browser. The target origin and service credential are repository secrets; neither belongs in source or logs. Logs contain aggregate status and counts, not source content. Permissions are read-only. Per-source failures are persisted before the job fails.

Only schedule and workflow_dispatch triggers are enabled. Automatic execution must be proven with event=schedule and the matching persisted remote run ID. A successful manual run does not prove automatic scheduling.

Production cadence is hourly at minute 58 UTC. Target configuration stays in repository secrets. Configure and verify scheduling separately; a workflow definition alone is not evidence that the provider has dispatched its timer.

The runner sends an execution-attempt ID and accepts the server's atomic lease/due decision. An overlapping timer or a recent successful collection is recorded as skipped, without collecting twice. Failed or incomplete runs remain visible for retry. The shared HTTP runtime also supports an independently hosted timer; account connection and real scheduled-execution proof are required before treating that timer as configured.
