# Security scan notes

## Opsera DevSecOps (planned)

Parameters: repository root, `full` scan, severity ≥ `high`.

Opsera MCP authentication timed out during implementation. To run the full scan:

1. Authenticate the Opsera plugin in Cursor (MCP `mcp_auth`).
2. Run `/security-scan` with path `.`, type `full`, threshold `high`.
3. Review generated markdown/HTML reports and fix new critical/high findings.

## Local checks (2026-06-02)

- `npm audit --audit-level=high`: **0 vulnerabilities**
- No hardcoded production secrets in `apps/` (test-only bot token in auth middleware test)

## Cron endpoint

`GET /cron/rates` requires `Authorization: Bearer $CRON_SECRET` in production (`CRON_SECRET` ≥ 32 chars enforced in `startup-checks`).
