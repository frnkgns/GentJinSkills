---
description: Analyze the current project's deployment readiness using the `deployment-readiness` skill, report blockers and warnings, and provide suggested next steps. The command does not modify the project unless the user explicitly approves a recommended implementation afterward.
---

Perform a comprehensive deployment-readiness analysis of the current project. The first invocation is always analysis-first and read-only: it must NOT edit files, apply fixes, change configuration, run destructive operations, deploy, commit, push, or modify project behavior. Follow this rule:

> **Analyze first. Suggest second. Implement only after explicit user approval.**

## Workflow

Inspect the project, analyze deployment readiness, identify confirmed issues and risks, explain why they matter, suggest concrete next steps, ask whether the user wants specific fixes implemented, and only make changes after explicit approval. The report must list every actionable finding.

## Project detection

Do not assume a stack. Inspect the repository before analyzing: project name, language, package manager, framework, frontend/backend structure, monorepo or single project, build/type-check/lint/test commands, database/ORM, authentication system, deployment provider, environment files, Docker usage, CI/CD configuration, and any payment or external services.

## Read-only analysis

You may inspect files, read configuration and source code, inspect environment variable names and package manifests, run non-destructive diagnostics, builds, type checks, lint, safe tests, and safe dependency-audit commands, and inspect Git status/history where useful. Never edit files, overwrite configuration, apply lint autofixes, upgrade dependencies, change environment variables, modify schemas or migrations, rotate secrets, modify auth or payment logic, commit, push, merge, deploy, delete anything, or touch production infrastructure.

Analyze these areas using the existing project's real commands, reporting evidence based on what is actually implemented:

1. Build readiness: run or inspect the production build; a failing build is a deployment blocker.
2. Type safety: run the project's type check; report errors and frontend/backend contract mismatches.
3. Lint/code quality: run the existing lint command; report errors, warnings, and production-impacting issues. Never run autofix.
4. Tests: detect and run safe tests. If a test appears destructive, expensive, production-connected, or unsafe, skip it and report exactly: `Test skipped because it may affect production resources.`
5. Secret exposure: scan for keys, tokens, passwords, OAuth secrets, service role keys, hardcoded credentials, exposed `.env` files, and private certificates. Never print full secret values; mask evidence (for example `SUPABASE_SERVICE_ROLE_KEY=eyJ...REDACTED`).
6. Environment configuration: missing required production variables, localhost URLs in production config, wrong callback/redirect URLs, frontend exposure of private variables, missing `.env.example`, and test credentials used in production.
7. Dependencies: critical/high vulnerabilities, deprecated critical packages, broken lockfiles, and risky production dependencies via safe audit commands. Never upgrade anything.
8. Authentication: route enforcement, session validation, token handling, cookie security, callback URLs, logout, and server-side validation.
9. Authorization: ownership/role checks, admin exposure, insecure direct object references, client-only authorization, and unrestricted destructive endpoints. A confirmed authorization bypass is a deployment blocker.
10. Input validation: missing validation, unsafe parsing, untrusted input, unsafe file paths, command/SQL injection, and mass assignment.
11. Browser/web security where applicable: XSS, CSRF, CORS, SSRF, CSP, security headers, and unsafe HTML rendering.
12. Database safety: migration files, pending or destructive migrations, unsafe reset commands, seed scripts, and production data-loss risks. Never run destructive migrations.
13. Logging/error handling: secrets, PII, payment data, debug output, and stack traces or raw internal errors exposed to users.
14. API safety: missing auth/authorization, unsafe destructive endpoints, unrestricted uploads, missing rate limiting, and insecure request handling.
15. File uploads (if any): type validation, size limits, filename/path safety, executable uploads, storage access, and public/private permissions.
16. Payment integration (if any): production/test key separation, webhook verification, redirect URLs, idempotency, duplicate payment handling, server-side amount validation, client-side tampering risk, and localhost callbacks. Never modify payment code during the check.
17. Deployment configuration: detect the provider (Vercel, AWS, Cloudflare, Docker, Netlify, Render, Railway, or other) and check build commands, output paths, regions, environment variables, redirects, and production URLs.
18. CI/CD: inspect workflows (GitHub Actions, GitLab CI, or other) for broken pipelines, exposed secrets, unsafe triggers, wrong branches, and risky script execution.
19. Debug/development artifacts: localhost URLs, debug routes, test accounts, mock APIs, disabled auth, temporary flags, production `console.log`, and unfinished TODOs that affect deployment. Only flag items that matter to deployment.

## Avoid false positives

Before reporting a finding, inspect the actual implementation, verify whether protection exists elsewhere, determine whether the issue is reachable, distinguish dev-only from production behavior, and distinguish theoretical risks from confirmed issues. If uncertain, label it `Needs verification`. Never present assumptions as confirmed vulnerabilities.

## Severity model

- `BLOCKER`: deployment must not proceed until fixed.
- `WARNING`: deployment may proceed only after the user understands the risk.
- `IMPROVEMENT`: recommended but not required for deployment.
- `PASSED`: the check completed successfully.

## Report format

Return a report in this structure:

```
# DEPLOYMENT CHECK

Project:
Detected Stack:
Deployment Target:
Date:

## RESULT

NOT READY / READY WITH WARNINGS / READY

## BLOCKERS

### <n>. <Title>

Evidence:
- File: ...
- Detail: ...

Why this matters:
...

Suggested fix:
...

Recommended steps:
1. ...
2. ...

Requires implementation:
YES / NO

## WARNINGS
...

## IMPROVEMENTS
...

## PASSED

- Build
- Type checking
- Secret scan
- ...

## COMMAND RESULTS

Build:
Type Check:
Lint:
Tests:
Dependency Audit:

## RECOMMENDED NEXT ACTIONS

1. ...
2. ...

## IMPLEMENTATION OPTIONS

The following issues can be implemented by Overgeared Skills/OpenCode after approval:

1. Fix ...
2. Update ...
3. Add ...

No files have been modified.

Would you like me to implement any of these recommendations?
```

Every blocker or warning must include what was found, evidence, why it matters, a suggested fix, recommended implementation steps, whether OpenCode can safely implement it, and whether manual action is required. Do not list vague findings like `Security issue detected.`; provide concrete, evidence-backed findings with actionable next steps.

## Approval gate

After the report, stop and wait. Never make changes automatically. Only implement after the user explicitly approves specific findings (for example `Fix blocker 1.`, `Implement recommendations 1 and 3.`, or `Apply the auth callback fix only.`). Do not treat vague conversation as approval; if approval is unclear, ask which findings to implement.

## Scoped implementation

After approval, implement only the approved findings. Preserve the existing architecture, avoid unrelated refactoring, and do not change behavior unnecessarily. If implementation reveals a new risky change, stop and request approval before proceeding.

## Revalidation after approved changes

After approved fixes, rerun the relevant checks: build, type check, lint, and relevant tests. Verify the original issue is resolved and report any remaining issue. Never assume success.

## Second report

After approved implementation, return:

```
# DEPLOYMENT CHECK - FOLLOW-UP

## IMPLEMENTED
- ...

## VALIDATION
Build:
Type Check:
Lint:
Tests:

## REMAINING BLOCKERS
- ...

## REMAINING WARNINGS
- ...

## RESULT
READY / READY WITH WARNINGS / NOT READY
```

## Safety

During analysis, never commit, push, merge, rebase, reset, checkout another branch, or stash user work. Never automatically deploy, modify production data, run destructive migrations, rotate credentials, update DNS, change payment provider settings, modify production cloud infrastructure, or change third-party dashboard settings; provide the required manual steps instead. Even after implementation is approved, do not commit or push unless the user explicitly asks.

## Persistent notes

After the analysis, if project knowledge is available, save only a concise deployment-audit summary in the existing knowledge structure (project name, detected stack, deployment result, blockers, warnings, and important recurring notes). Never store secret values, tokens, passwords, or sensitive environment values; use the existing knowledge system rather than forcing a new structure.