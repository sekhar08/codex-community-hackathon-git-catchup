# git-catchup

AI-assisted CLI for safely catching up on `main` after a long holiday, sprint break, or week of deep work.

## Problem -> Solution

Coming back to a branch after time away usually looks like this:

| Situation | What usually happens | What `git-catchup` does |
| --- | --- | --- |
| You were away for 10 days | `main` moved fast and nobody remembers what changed | Fetches and summarizes incoming commits |
| You have local uncommitted work | Pulling blindly risks conflicts and lost focus | Detects overlap between your files and incoming commits |
| The history is noisy | `git log` is technically correct but not decision-friendly | Groups changes into features, hot spots, and safe areas |
| You need a next step | You guess between pull, stash, rebase, or resolve | Recommends preview, isolate, resolve, or test workflows |

## Why It Exists

`git-catchup` is built for the moment when you come back from a holiday and need a fast answer to:

1. What changed on `main`?
2. Which of those changes touch my files?
3. What is safe to pull now?
4. Where will conflicts probably happen?

## Installation

Install globally from npm:

```bash
npm install -g git-catchup
```

Install locally for development:

```bash
npm install
npm run build
```

## Quick Start

Run inside any git repository that has a remote:

```bash
git-catchup
```

Compare against a specific branch:

```bash
git-catchup --branch origin/main
```

Preview risky-file diffs:

```bash
git-catchup --preview
```

## AI Setup

`git-catchup` automatically loads `.env` using `dotenv`.

Create a `.env` file:

```env
GEMINI_API_KEY=your_key_here
```

Or export a key in your shell:

```bash
export GEMINI_API_KEY=your_key_here
```

Provider priority:

1. `GEMINI_API_KEY` -> `gemini-2.5-flash`
2. `GROQ_API_KEY` -> `llama-3.3-70b-versatile`
3. `OPENAI_API_KEY` -> `gpt-4o-mini`

Optional overrides:

```bash
export GEMINI_MODEL=gemini-2.5-flash
export GROQ_MODEL=llama-3.3-70b-versatile
export OPENAI_MODEL=gpt-4o-mini
```

## Commands and Flags

Default analysis:

```bash
git-catchup
```

Choose a target branch:

```bash
git-catchup --branch origin/main
```

Show unified diff for risky files only:

```bash
git-catchup --preview
```

Apply safe incoming commits first:

```bash
git-catchup --isolate
```

Launch guided conflict resolution:

```bash
git-catchup --resolve
```

Run relevant tests for affected files:

```bash
git-catchup --test
```

## Dashboard Example

```text
╭──────────────────────────────────╮
│ Git Catchup                      │
│ Post-Holiday Merge Assistant     │
╰──────────────────────────────────╯

✨ AI enabled • Gemini 2.5 Flash

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

────────────────────────────────────

⚠️ YOUR LOCAL CHANGES:
src/notifications/notification-worker.ts (modified) → "Incoming overlap: feat: improve notification streaming"
README.md (untracked) → "README.md has untracked local changes with no matching incoming commits."

⚠️ CONFLICT RISK:
• src/notifications/notification-worker.ts (high risk)
  Multiple incoming commits touch this file, so both your local edits and upstream changes may need manual reconciliation.

🎯 RECOMMENDED ACTIONS:
─────────────────────────────────
git catchup --preview → See full diff before merging
git catchup --isolate → Pull safe commits first
git catchup --resolve → Guided conflict resolution
git catchup --test → Run relevant tests automatically
─────────────────────────────────
```

## Demo Flow

1. Run `git-catchup` to see grouped incoming work and local overlap.
2. Run `git-catchup --preview` to inspect risky diffs only.
3. Run `git-catchup --isolate` to stash local work and apply safe commits.
4. Run `git-catchup --resolve` if your branch already has merge conflicts.
5. Run `git-catchup --test` to verify the affected area.

## Development

```bash
npm install
npm run lint
npm run build
npm start
```

## Roadmap

- Smarter project-specific test detection
- Interactive conflict walkthroughs inside Ink
- AI-generated merge summaries per feature group
- Safer isolate mode with rollback checkpoints
- Exportable catch-up reports for teams
