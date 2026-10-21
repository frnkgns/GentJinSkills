---
description: Handle a general-purpose software or laptop task with project discovery, guarded execution, and verification.
---

Accept a clear goal and optional project, path, or context. Discover the relevant project instructions and current state before acting, and use the narrowest available file, shell, browser, or GUI tools.

Treat conversational wording and synonyms as the same intent. Examples include `open Chrome`, `launch the browser`, `open VS Code`, `start the expeme project`, and `run npm dev`. Do not require the user to know a slash command or memorize fixed phrasing. Resolve the requested app or project from the environment; if multiple targets match or the action is unclear, ask one concise clarification before acting.

Support these branches under this command:

- `vscode [project]`: resolve the named project or active workspace, ensure Visual Studio Code is running, and open the project in a new window with `code --new-window <project-root>`. Never reuse or close an existing window.
- `dev [project]`: resolve the named project or active workspace, ensure Visual Studio Code is running, focus its integrated terminal, confirm the project-root working directory, and run `npm run dev`. Do not start a duplicate server when one is already listening.

Accept equivalent natural-language requests such as `/task vscode expeme`, `/task dev expeme`, "open expeme in VS Code", and "run dev in expeme". Handle all other goals with the general workflow below.

Before executing a recurring or reusable task, use the knowledge-vault skill to search the current project vault and the global Overgeared Skills workflow store by intent, target, and expected outcome. Reuse a matching workflow only when its scope, preconditions, and verification still match the current environment; current source and permissions take precedence.

Treat "remember this", "save this workflow", and "don't do that again" as requests to update workflow memory. After a new workflow succeeds, capture a concise note with trigger phrases, intent, preconditions, steps, verification, scope, and last-verified date. If the user says it did not work, mark the note for revision, preserve the failure reason, and update or replace it after verifying the new solution instead of creating duplicates.

Never store full transcripts, credentials, secrets, one-off requests, or unverified guesses. Store cross-project workflows in the global Overgeared Skills workflow store and project-specific workflows in the current project vault.

Plan the work and distinguish read-only, reversible, and side-effecting steps. Ask for confirmation before destructive or irreversible actions, external communications, credential or secret access, system-wide configuration changes, software installation, financial actions, or Git mutations unless the user explicitly authorized that exact action. Never treat a broad request as blanket authorization.

If the project or requested target is ambiguous, ask for clarification instead of guessing. Handle unavailable tools, permissions, missing data, and failures honestly; do not claim an action succeeded when it did not.

Execute the authorized steps, run the relevant verification available for the project, remove temporary debugging artifacts, and report the outcome with any limitations. Reuse specialized skills and existing commands when they apply instead of creating a new command for every task.
