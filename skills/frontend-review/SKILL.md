---
name: frontend-review
description: Review changed frontend/UI code for responsive design, UX consistency, accessibility, optimistic interactions, loading/error/empty states, real data usage, and frontend performance. Run it yourself before reporting any task complete that changed a user-facing screen, without waiting to be asked. Also use for explicit UI review, frontend QA, responsive/mobile review, or as part of cleanup when user-facing screens changed.
---
# Frontend Review

## Run this before calling a UI change done

When your task changed something a user can see or reach — a page, component, form, dialog,
navigation, layout, or any visual state — work through this review yourself **before reporting
the task complete**. Do not leave it to the revision round, and do not wait to be asked.

Answer it from the code you just changed. Read the diff and the surrounding components; that
costs nothing and needs no permission.

Do not launch a dev server, start a browser, capture screenshots, or request extra tool
permissions to satisfy this review. It is a code review, not a runtime test. If a judgement
genuinely needs runtime evidence you cannot get from the diff, say which one and leave it as a
stated limitation instead of escalating the work.

Report what you found and what you fixed. A clean pass is a valid result and worth stating.

The sections below are the checklist. Use the ones the change actually touches.

## Responsive Layout
Review changed UI on small/large phones, tablets, laptops, desktops, and relevant portrait/landscape orientations. Check horizontal overflow, clipping, text overflow, overlapping controls, table/chart usability, dialogs/sheets, navigation, touch targets, off-screen actions, and awkward large-screen stretching. Treat mobile as first-class.

## Visual Consistency
Review alignment, padding, margins, gaps, grids, card spacing, typography hierarchy, icon/button/input sizing, wrapping, and visual balance. Follow existing design-system components/tokens/radius/spacing. Do not redesign unrelated screens.

## UX and States
- Clear button labels and interactive affordances.
- Understandable disabled states.
- Useful validation and error messages.
- Clear success/empty states and next actions.
- Loading behavior that avoids unnecessary layout jumps.
- Safeguards for destructive actions and duplicate submissions.
- Graceful API/network/database failure handling; never fake success after failure.
- Preserve already-known valid data when appropriate.

## Optimistic UI
Use optimistic updates only for fast mutations where rollback/reconciliation are safe. Update immediately, prevent duplicate submissions, rollback on failure, show an appropriate error, and reconcile with authoritative server state. Avoid optimistic behavior for payments, security-sensitive operations, or complex server validation when correctness is more important.

## Accessibility
Verify keyboard access, input labels, accessible names for icon-only buttons, semantic HTML, usable focus behavior, non-color-only state communication, and accessible dialogs/menus/sheets/popovers.

## Frontend Performance
Check for unnecessary React re-renders, bad effect dependencies, repeated expensive calculations, duplicate/client-only fetching, oversized client components, unnecessary large dependencies, unoptimized media, layout shifts, sequential requests that can run concurrently, and large-list rendering issues. Optimize only where benefit is clear. For cross-stack performance methodology such as measurement, caching, N+1 behavior, and resource leaks, use `performance-review`.

## Real Data and Fallbacks
Use real application data where expected. Verify derived values use correct records. Provide safe nullable handling, route/error boundaries where appropriate, loading/Suspense/empty states, retry actions, and graceful API failures. Never hide business errors behind misleading defaults.
