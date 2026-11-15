# Deterministic HTTP collection timer

A GitHub-hosted Node process runs a start/collect/finish HTTPS protocol. It uses no models and requires no local computer or browser. The target origin and service credential are repository secrets; neither belongs in source or logs. Logs contain aggregate status and counts, not source content. Permissions are read-only. Per-source failures are persisted before the job fails.

Only schedule and workflow_dispatch triggers are enabled. Automatic execution must be proven with event=schedule and the matching persisted remote run ID. Restore hourly cadence after the temporary timer observation.

Production cadence is hourly at minute 58 UTC; a temporary five-minute observation trigger is removed after the production timer is verified. Target configuration stays in repository secrets.
