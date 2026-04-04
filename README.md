# git-catchup

`git-catchup` is a TypeScript CLI built with Ink for a polished terminal UI. Phase 0 focuses on fetching the latest remote refs and summarizing what changed on the target branch before you sync local work.

## Phase 0

This Ink-based starter currently:

- Fetch the latest remote refs
- Detect the current branch and upstream
- Inspect uncommitted local changes
- Count incoming commits on the selected target branch
- Render a clean terminal dashboard with friendly error handling

## Installation

```bash
npm install
```

## Usage

Build the CLI:

```bash
npm run build
```

Run it directly:

```bash
node dist/index.js
```

Run the linked binary after build:

```bash
npm link
git-catchup
```

Choose a specific comparison branch:

```bash
node dist/index.js --branch origin/main
```

Enable the preview flag reserved for future phases:

```bash
node dist/index.js --preview
```

## Structure

```text
src/
  commands/
  components/
  lib/
```
