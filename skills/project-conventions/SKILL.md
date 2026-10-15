---
name: project-conventions
description: Learn an existing codebase before changing it, then match its conventions, write human-readable self-documenting code without added comments, and reuse what already exists. MUST be used before implementing meaningful changes in an existing project, and when creating any component, route, endpoint, server function, hook, query, validation helper, or utility. Also use when new code could plausibly duplicate an existing implementation.
---
# Project Conventions

## Learn Before Editing

Do not start coding from generic framework preferences, personal style, framework defaults, or patterns from unrelated projects. Inspect the project first.

Inspect enough of the codebase to answer:

- What framework and runtime is this, and how is the repository organized?
- Where do similar features live, and how are routes written?
- How are components, hooks, and shared abstractions written?
- How is server logic, data access, validation, and error handling done?
- What naming, folder, import/export, and commenting conventions apply?
- What tests exist and how are they structured?

The target is that new code looks like it was written by the team that wrote the existing project.

## Conventions Take Priority

Project-local conventions are the default implementation standard: export style, function style, route/file/folder naming, early-return style, data-fetching pattern, API response format, database access pattern, validation placement, error handling, state management, component composition, hook naming, server/client separation, logging, styling, and test structure.

Do not rewrite a consistent, valid project style into a generic best-practice style. Consistency with the existing codebase is part of correctness.

Write human-readable code: descriptive names, straightforward control flow, minimal nesting, small focused functions, and clear self-documenting code. Avoid clever one-liners, giant mixed-responsibility functions, magic values, and abstraction for its own sake.

## The Smallest Complete Change

Take the first option that fully works, and stop climbing:

1. **Does it need to exist?** A vague request gets the smallest version that does the core job. Skip options, flags, and flexibility nobody asked for, and name them in one line so the user can still ask.
2. **Is it already in this project?** A helper, component, service, query, or pattern. Use it the way the surrounding code uses it, per [Search Before Create](#search-before-create).
3. **Does the language or runtime already do it?** A standard-library or platform primitive, unless the project has a house abstraction, in which case the house one wins.
4. **Is it already installed?** An existing dependency or first-party tool. Never add a dependency for a few lines of code.
5. **Is it one line a reader gets at a glance?** One line. A one-liner that needs decoding is not short.
6. **Otherwise: the minimum that works.**

Lazy about the solution, never about the change itself. A rung-6 patch still finishes everything the task needs, including the callers, tests, fixtures, and error paths the change breaks.

When two options are the same size, take the one that is correct on edge cases.

Never cut: validation at trust boundaries, error handling that prevents data loss, authorization, security, accessibility, required logging, anything the user asked for, or the check that proves the change works. Small and correct beats small and broken.

### Worked decisions

- **Reuse wins.** A date picker is requested and the project already has an `Input` component. Extend `Input` with a `type` prop rather than installing a date-picker library or hand-building a calendar. Rung 2.
- **A new helper is justified.** Two callers need the same non-trivial transformation and neither is a natural home for it. One small named helper is less code than two copies and clearer at both call sites. Rung 6 is the right answer here, not a failure to reuse.
- **Shorter would introduce a defect.** Collapsing a validated branch into a one-liner removes a check at a trust boundary. That is not rung 5; it is a correctness regression, and the longer form ships.
- **Doing nothing is correct.** The reported defect does not reproduce, or the described behavior already matches the request. Say so and stop, rather than making a change that cannot be justified.

## Comments

Do not add comments to new or modified code. The code must read as plainly as the surrounding project code without them.

Match the surrounding file. If neighbouring code is sparsely commented, new code is sparsely commented. If the project documents a public API, keep that documentation. Do not import the comment density of a different project into a consistent one.

Add a comment only when:

- the user explicitly asks for one; or
- a genuinely non-obvious constraint would be unsafe to leave unexplained, such as a required workaround, a non-obvious external constraint, or a deliberate deviation from the obvious approach.

Never add:

- section banners, file headers, or author/version blocks;
- comments that restate the code, such as `// increment counter` above `counter++`;
- commented-out code, and never keep stale commented-out code while editing a file;
- "why this works" narration of straightforward logic;
- markers referring to the change itself, such as "new", "changed", or "TODO: fix later".

Prefer making the code self-documenting: descriptive names, well-named small functions, and early returns. When a block needs explanation, extract it into a well-named function instead of annotating it inline.

## Search Before Create

Before creating any component, route, page, hook, server function, service, repository method, database query, mutation, form, schema, validation helper, utility, API wrapper, or data-access layer, search the codebase for an existing implementation that may already satisfy the requirement.

When several comparable examples exist, inspect enough of them to identify the recurring convention rather than copying one unusual file. Prefer adapting an established pattern over inventing a new one.

Reuse or extend a compatible implementation first. Create something new only when no suitable implementation exists, when existing behavior has materially different semantics, when reuse would break data correctness, when reuse would create harmful coupling, or when extension would make the existing abstraction confusing.

Do not duplicate functionality because discovery was skipped.

## Reuse Rules

### Frontend components

For visual or interactive work that introduces no new backend or persistence contract, search for an existing component first: buttons, inputs, selects, dropdowns, modals, dialogs, cards, tables, badges, tabs, form fields, date pickers, pagination, loading and empty states, confirmation dialogs, layout primitives.

Inspect its props and usage, reuse it if it fits, extend it carefully when the requirement is a natural extension that will not break existing consumers, and create a new component only when the existing one cannot support the requirement cleanly. If two components differ only by text, icons, labels, or small visual variants, make the existing component reusable through props instead of duplicating it.

Do not force reuse that would introduce confusing conditional behavior, mix unrelated responsibilities, couple unrelated features, change an existing component's meaning, or reduce clarity.

### API and fetch logic

Before creating an endpoint, API client function, fetch helper, request wrapper, or server function, search for an existing implementation of the same operation. Do not create `getUsers`, `fetchUsers`, `loadUsers`, `retrieveUsers`, and `getAllUsers` as separate functions for one operation; prefer one canonical implementation reused by callers.

When behavior is close but not identical, first check whether it can be safely extended with optional parameters, filters, pagination, selected fields, or reusable inputs without breaking existing callers or creating an unclear contract. Create a new function only when the operation is genuinely different.

### Database queries and data access

Reuse an existing query, repository method, or data-access function when the purpose, filtering semantics, returned shape, authorization assumptions, and transaction requirements all match. Prefer extending the canonical query with optional filters, search, pagination, sorting, date range, or include flags over writing a parallel version.

Do not force reuse when semantics differ materially, such as reusing a query scoped to active organization-visible records for an admin audit over all records including archived ones. Correct data semantics outrank reducing function count.

When several parts of the project need the same data, prefer one canonical path — UI to shared hook/client/server function to service/repository/query to database — instead of each page or modal running its own fetch.

## Reuse Must Not Corrupt Data Flow

Before reusing a component, API function, fetch helper, or query, verify input requirements, output shape, validation behavior, authorization rules, mutation side effects, database writes, caching and invalidation behavior, transaction behavior, error handling, and caller expectations.

If reuse would interfere with how data is transferred or persisted, keep the shared portion, isolate the genuinely different behavior, and create the smallest new abstraction necessary. Reuse shared behavior, not mismatched behavior.

## Do Not Blindly Copy Bad Legacy Patterns

Conventions are the default, but never copy code that is insecure, clearly broken, deprecated, causing the bug being fixed, contradicted by current project documentation, or incompatible with an explicit new requirement.

When deviating: identify the reason, make the smallest safe deviation, stay consistent with surrounding architecture, avoid unrelated refactoring, and record the reason in project knowledge when it will matter later.

## Persist Discovered Conventions

When stable conventions are discovered that will matter in future work, persist them through `knowledge-vault` without waiting to be asked: routing, component structure, server-function patterns, database access style, error handling, validation, state management, folder and naming conventions, testing conventions, shared abstractions, and architectural boundaries.

Prefer updating an existing project-conventions note over creating a duplicate. Verify stored conventions against current source when practical; current source is authoritative when a note is stale.
