# git-catchup

AI-assisted CLI for safely catching up on incoming `main` changes after time away from your branch.

## Problem -> Solution

Coming back to a branch after a holiday, sprint break, or deep-focus week usually looks like this:

| Situation | What usually happens | What `git-catchup` does |
| --- | --- | --- |
| `main` moved while you were away | You skim `git log` and still don’t know what matters | Fetches, groups, and summarizes incoming work |
| You have local changes | Pulling blindly risks conflicts and context loss | Detects overlap between your files and incoming commits |
| The history is noisy | It’s hard to tell what is safe vs risky | Highlights hot areas, safe groups, and likely conflict zones |
| You need a next step | You guess between preview, pull, stash, or resolve | Recommends preview, isolate, resolve, and test workflows |

## What It Does

`git-catchup` helps answer:

1. What changed on `main`?
2. Which incoming commits touch my files?
3. What is safe to pull first?
4. Where are conflicts likely?
5. What should I do next?

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

Preview risky-file diffs only:

```bash
git-catchup --preview
```

## AI Setup

`git-catchup` auto-loads `.env` using `dotenv`.

### Zero-config first run

If no AI provider is configured and you run `git-catchup` in an interactive terminal, the CLI will:

1. ask whether you want to configure AI now
2. let you choose a provider in the terminal
3. prompt for your API key securely
4. save the selected provider config into the current project’s `.env`
5. continue the same analysis run with AI enabled

OpenAI is the default first option in the terminal setup flow.

### Manual `.env` setup

Create a `.env` file in the project you want to analyze:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```

### Provider priority

When multiple provider keys exist, provider selection currently prefers:

1. `OPENAI_API_KEY` -> `gpt-4o-mini`
2. `GEMINI_API_KEY` -> `gemini-2.5-flash`
3. `GROQ_API_KEY` -> `llama-3.3-70b-versatile`

Optional overrides:

```bash
export OPENAI_MODEL=gpt-4o-mini
export GEMINI_MODEL=gemini-2.5-flash
export GROQ_MODEL=llama-3.3-70b-versatile
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

Stash local changes and apply safe incoming commits first:

```bash
git-catchup --isolate
```

Print guided conflict-resolution steps and launch `git mergetool` if conflicts exist:

```bash
git-catchup --resolve
```

Detect and run relevant tests for affected files:

```bash
git-catchup --test
```

## User Flow

### 1. Start analysis

```bash
git-catchup
```

The CLI will:

1. optionally walk you through AI setup if no provider is configured
2. fetch the latest remote changes
3. detect your local uncommitted work
4. analyze incoming commits on `main`
5. group the changes with AI when available, or heuristics otherwise
6. predict risky conflicts
7. render the dashboard

### 2. Read the dashboard

The dashboard shows:

- AI status
- current branch and target branch
- grouped incoming work
- local file overlap
- conflict-risk explanations
- recommended next actions

### 3. Pick the next action

- `git-catchup --preview` to inspect risky diffs
- `git-catchup --isolate` to apply only safe commits first
- `git-catchup --resolve` to get guided conflict help
- `git-catchup --test` to run likely relevant tests

### 4. Optional chat mode

After the dashboard run, the CLI can prompt you to enter chat mode.

Chat mode lets you:

- ask questions about the incoming changes
- inspect context-aware AI suggestions
- ask for recommended commands using `--suggest`
- exit and then run one of the recommended real CLI actions

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

git-catchup v0.1.0
```

## Demo Flow

1. Run `git-catchup`
2. enable AI in-terminal if prompted
3. inspect grouped incoming work and local overlap
4. enter chat mode if you want AI-guided interpretation
5. run `--preview`, `--isolate`, `--resolve`, or `--test` as your next step

## Development

```bash
npm install
npm run lint
npm run build
npm start
```

## Roadmap

- Safer isolate mode with rollback checkpoints
- Richer project-specific test detection
- Better interactive conflict walkthroughs in Ink
- More structured AI merge plans
- Exportable catch-up reports for teams
