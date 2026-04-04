# Stress Test Checklist

This repo includes a repeatable stress-test harness for `git-catchup`.

## Setup

Build the app first:

```bash
cd /home/chandra/Documents/git-catchup
npm run build
```

Create the dummy project:

```bash
bash scripts/setup-stress-test.sh
```

The script prints two workspaces:

- `predict-work`: for dashboard, preview, and isolate
- `merge-work`: for a real merge conflict + interactive resolver run

## Expected Repo Shape

- 20 tracked project files in the seeded app
- the feature workspaces still have 20 tracked files total
- `feature/demo` is 100 commits behind `origin/main`
- 5 active local files in `predict-work`
- 3 true merge-conflict files in `merge-work` after merging `origin/main`
- no AI key required for the baseline run

## Phase A: Prediction and Dashboard

```bash
cd /tmp/git-catchup-stress/predict-work
git rev-list --count HEAD..origin/main
git status --short
node /home/chandra/Documents/git-catchup/dist/index.js
node /home/chandra/Documents/git-catchup/dist/index.js --preview
node /home/chandra/Documents/git-catchup/dist/index.js --isolate
```

Expected observations:

- `git rev-list --count HEAD..origin/main` prints `100`
- `git status --short` shows exactly 5 modified tracked files
- the dashboard groups the 100 incoming commits into a small number of readable clusters
- the 3 hotspot files are surfaced as the likely conflict areas
- `--preview` shows only the risky-file diffs
- `--isolate` applies safe content first and reports that history may still differ because isolate cherry-picks

## Phase B: Real Merge + Resolver

```bash
cd /tmp/git-catchup-stress/merge-work
git merge origin/main || true
git status --short
node /home/chandra/Documents/git-catchup/dist/index.js --resolve
```

Expected observations:

- the merge creates exactly 3 real conflicted files:
  - `src/notifications/worker.ts`
  - `src/payments/payment-flow.ts`
  - `src/auth/session.ts`
- files such as `src/search/index.ts` and `docs/notes.md` should merge cleanly and must not appear as conflicted
- the interactive resolver opens on actual conflicted files only
- the resolver can answer fallback conflict questions even without AI
- commands like `next`, `prev`, `keep-mine`, `keep-theirs`, `show-both`, `stage`, and `abort` remain usable

## Optional AI Comparison

To compare AI-enhanced grouping and resolver explanations:

```bash
export OPENAI_API_KEY=your_key_here
export OPENAI_MODEL=gpt-4o-mini
```

Then rerun the same Phase A and Phase B commands.
