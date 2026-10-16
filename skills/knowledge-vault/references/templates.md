---
name: templates
description: Reusable note, session, change, attempt, and project-memory template shapes for the Knowledge Vault.
---

# Vault Templates

Load this only when writing or normalizing a vault note and the exact shape matters. The rules for
when to capture and where a note belongs stay in the knowledge-vault entrypoint.

## Templates

Use `_templates/` for reusable note structures when templates materially improve consistency.

Templates may exist for:

- project memory notes
- the memory index
- ADRs
- bugs
- enhancements
- questions
- WIP
- sessions
- changes
- attempts
- reports

Do not require every note to use a template when a simpler note is sufficient.

Suggested memory index shape:

```text
# Memory Index

Last updated: YYYY-MM-DD

## Project
- [[note]] — one-line description

## Current Work
## Modules
## Decisions
## Known Issues
```

Suggested start-of-day briefing shape:

```text
Current Objective
Latest Progress
Important Decisions
Open Issues / Blockers
Remaining Work
Recommended Next Step
```

Suggested continuity note shapes:

```text
# Development Session — YYYY-MM-DD

## Worked On
## Meaningful Changes
## Decisions
## Discoveries
## Problems Encountered
## Resolutions
## Remaining
## Next Step
## Git Context
```

```text
# Current Work

Last updated: YYYY-MM-DD HH:MM

## Objective
## Current Status
## Completed
## In Progress
## Remaining
## Blockers
## Relevant Files
## Relevant Memory
## Next Recommended Step
```

```text
# Change — <Title>

Date:
Branch:
Commit:

## Summary
## Reason
## Areas Affected
## Important Files
## Behavior Before
## Behavior After
## Related
```

```text
# Attempt — <Title>

## Attempt
## Result
## Why It Failed
## Resolution
## Avoid Repeating When
```

Suggested project memory note shapes:

```text
# Project Overview

Last verified: YYYY-MM-DD

## Project

Name:
Type:
Repository:

## Purpose

What this project does.

## Primary Areas

- Area

## Important Entry Points

- path

## Notes

Important project-wide context.
```

```text
# Project Structure

Last verified: YYYY-MM-DD

## Repository Layout

## Directory Responsibilities

### path/

Purpose.

## Important Relationships

## Relevant Conventions
```

```text
# Project Stack

Last verified: YYYY-MM-DD

## Runtime
## Frontend
## Backend
## Database
## Infrastructure
## Tooling
```

```text
# Project Commands

Last verified: YYYY-MM-DD

## Install
## Development
## Build
## Test
## Lint
## Type Check
```

```text
# Project State

Last explored: YYYY-MM-DD

## Identity

Project ID:
Repository:
Default branch:

## Detected Files

## Known Roots

## Last Verified Revision

Commit:
Branch:

## Notes

Known structural uncertainty or stale areas.
```

