# git-catchup

Interactive AI-assisted terminal for understanding incoming `main` changes, spotting risk early, and resolving merge conflicts with guidance instead of guesswork.

## What It Solves

When a developer returns to a long-running branch, three things are usually unclear:

1. What changed upstream while I was away?
2. Which of those changes overlap with my work?
3. What is the safest next step before I merge?

`git-catchup` answers those questions in one terminal workflow.

## Core Features

- Group incoming commits into readable feature clusters
- Detect overlap between local changes and upstream files
- Predict likely conflicts before merge
- Preview risky diffs only
- Apply safe commits first with `--isolate`
- Launch an interactive AI-guided conflict resolver with `--resolve`
- Run relevant tests when a supported runner exists

## Installation

```bash
npm install
npm run build
```

Run locally:

```bash
node dist/index.js
```

## AI Setup

`git-catchup` auto-loads `.env` with `dotenv`.

Example:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```

Supported providers:

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`

AI is optional. Without it, the tool falls back to heuristic commit grouping, conflict prediction, and deterministic resolver guidance.

## Commands

Default dashboard:

```bash
git-catchup
```

Preview risky diffs:

```bash
git-catchup --preview
```

Apply only safe incoming commits first:

```bash
git-catchup --isolate
```

Launch the interactive conflict resolver:

```bash
git-catchup --resolve
```

Run likely relevant tests:

```bash
git-catchup --test
```

## Interactive Resolver

`git-catchup --resolve` handles two cases:

- If a merge is already in progress, it opens the resolver on the real conflicted files
- If no merge is active, it starts a guarded merge against the target branch and opens the resolver only if conflicts occur

Inside the resolver you can:

- move between files and hunks
- ask natural questions like `why is this conflicting?`
- ask for `suggest` to get a merged proposal
- use `keep-mine`, `keep-theirs`, or `show-both`
- `stage` a resolved file
- `abort` the guarded merge session

## Dashboard Example

```text
╭──────────────────────────────────╮
│ Git Catchup                      │
│ Post-Holiday Merge Assistant     │
╰──────────────────────────────────╯

✨ AI enabled • GPT-4o Mini

📍 feature/demo → origin/main • upstream origin/main
📅 14 days of changes | 200 commits on main
────────────────────────────────────

📦 GROUPED BY FEATURE:
├── 🔥 Hot: Notifications (23 commits)
│   └── Changes: src/notifications/notification-worker.ts ← YOUR FILE (conflict likely)
├── 💳 Payments (12 commits)
│   └── Changes: src/payments/payment-flow.ts (safe to pull)
└── 📦 Dependencies (45 commits)
    └── Changes: package-lock.json (safe to pull)

⚠️ YOUR LOCAL CHANGES:
src/notifications/notification-worker.ts (modified) → "Incoming overlap: feat: improve notification streaming"

⚠️ CONFLICT RISK:
• src/notifications/notification-worker.ts (high risk)
  Multiple incoming commits touch this file, so both your local edits and upstream changes may need manual reconciliation.

🎯 RECOMMENDED ACTIONS:
git catchup --preview → See full diff before merging
git catchup --isolate → Pull safe commits first
git catchup --resolve → Launch AI-guided interactive conflict resolver
git catchup --test → Run relevant tests automatically
```

## Development

```bash
npm run lint
npm run build
npm test
```

## Stress Testing

Use the included repeatable stress-test harness to create a dummy project with 20 files, a feature branch 100 commits behind `main`, 5 active local files, and 3 true merge conflicts:

```bash
bash scripts/setup-stress-test.sh
```

The exact runbook and expected observations are documented in [STRESS_TEST.md](/home/chandra/Documents/git-catchup/STRESS_TEST.md).
