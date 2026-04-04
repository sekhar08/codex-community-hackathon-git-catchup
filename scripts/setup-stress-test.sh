#!/usr/bin/env bash

set -euo pipefail

BASE_DIR="${1:-/tmp/git-catchup-stress}"
REMOTE_DIR="$BASE_DIR/remote.git"
SEED_DIR="$BASE_DIR/seed"
PREDICT_DIR="$BASE_DIR/predict-work"
MERGE_DIR="$BASE_DIR/merge-work"

rm -rf "$BASE_DIR"
mkdir -p "$BASE_DIR" "$SEED_DIR"

git init --bare "$REMOTE_DIR" >/dev/null

cd "$SEED_DIR"
git init -b main >/dev/null
git config user.name "Codex Stress Test"
git config user.email "codex-stress@example.com"

mkdir -p src/notifications src/payments src/auth src/search src/ui src/utils docs tests churn

cat > src/notifications/worker.ts <<'EOF_FILE'
export function processNotifications(items: string[]): string[] {
  return items.map((item) => item.trim());
}
EOF_FILE

cat > src/notifications/template.ts <<'EOF_FILE'
export const notificationTemplate = "base-template";
EOF_FILE

cat > src/payments/payment-flow.ts <<'EOF_FILE'
export function runPayment(amount: number): string {
  return `charge:${amount}`;
}
EOF_FILE

cat > src/payments/receipt.ts <<'EOF_FILE'
export function buildReceipt(id: string): string {
  return `receipt:${id}`;
}
EOF_FILE

cat > src/auth/session.ts <<'EOF_FILE'
export function loadSession(token: string): string {
  return `session:${token}`;
}
EOF_FILE

cat > src/auth/permissions.ts <<'EOF_FILE'
export const permissions = ["read"];
EOF_FILE

cat > src/search/index.ts <<'EOF_FILE'
export function search(query: string): string {
  return query.toLowerCase();
}
EOF_FILE

cat > src/search/ranking.ts <<'EOF_FILE'
export function rank(values: string[]): string[] {
  return values;
}
EOF_FILE

cat > src/ui/dashboard.ts <<'EOF_FILE'
export const dashboardTitle = "Git Catchup";
EOF_FILE

cat > src/ui/panel.ts <<'EOF_FILE'
export const panelPadding = 1;
EOF_FILE

cat > src/utils/date.ts <<'EOF_FILE'
export function formatDate(value: string): string {
  return value;
}
EOF_FILE

cat > src/utils/path.ts <<'EOF_FILE'
export function normalizePath(value: string): string {
  return value.replace(/\\\\/g, "/");
}
EOF_FILE

cat > docs/notes.md <<'EOF_FILE'
# Notes

Initial project notes.
EOF_FILE

cat > docs/merge-guide.md <<'EOF_FILE'
# Merge Guide

Follow the checklist.
EOF_FILE

cat > docs/api.md <<'EOF_FILE'
# API

Initial API overview.
EOF_FILE

cat > tests/notifications.test.ts <<'EOF_FILE'
export const notificationTest = "pending";
EOF_FILE

cat > tests/payments.test.ts <<'EOF_FILE'
export const paymentTest = "pending";
EOF_FILE

cat > package.json <<'EOF_FILE'
{
  "name": "dummy-stress-app",
  "private": true,
  "scripts": {
    "test": "echo running dummy tests"
  }
}
EOF_FILE

cat > README.md <<'EOF_FILE'
# Dummy Stress App
EOF_FILE

git add .
git commit -m "feat: initial 20-file project" >/dev/null
git remote add origin "$REMOTE_DIR"
git push -u origin main >/dev/null

git checkout -b feature/demo >/dev/null
cat > src/ui/feature-banner.ts <<'EOF_FILE'
export const featureBanner = "demo";
EOF_FILE
git add src/ui/feature-banner.ts
git commit -m "feat: start feature branch" >/dev/null
git push -u origin feature/demo >/dev/null

git checkout main >/dev/null

for i in $(seq 1 100); do
  case "$i" in
    8|18|28)
      cat > src/notifications/worker.ts <<EOF_FILE
export function processNotifications(items: string[]): string[] {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => "[main-$i] " + item);
}
EOF_FILE
      git add src/notifications/worker.ts
      git commit -m "feat: improve notifications batch $i" >/dev/null
      ;;
    12|36|72)
      cat > src/payments/payment-flow.ts <<EOF_FILE
export function runPayment(amount: number): string {
  const normalized = Math.round(amount * 100) / 100;
  return "charge-main-$i:" + normalized.toFixed(2);
}
EOF_FILE
      git add src/payments/payment-flow.ts
      git commit -m "fix: tighten payment flow $i" >/dev/null
      ;;
    14|44|84)
      cat > src/auth/session.ts <<EOF_FILE
export function loadSession(token: string): string {
  return "session-main-$i:" + token.trim();
}
EOF_FILE
      git add src/auth/session.ts
      git commit -m "feat: harden auth session $i" >/dev/null
      ;;
    22|48)
      cat > src/search/index.ts <<EOF_FILE
export function search(query: string): string {
  return query.trim().toLowerCase() + "-main-$i";
}
EOF_FILE
      git add src/search/index.ts
      git commit -m "feat: improve search normalization $i" >/dev/null
      ;;
    26|54)
      cat > docs/notes.md <<EOF_FILE
# Notes

Initial project notes.

Main branch note update $i.
EOF_FILE
      git add docs/notes.md
      git commit -m "docs: expand notes $i" >/dev/null
      ;;
    32|58)
      cat > src/ui/dashboard.ts <<EOF_FILE
export const dashboardTitle = "Git Catchup Main $i";
EOF_FILE
      git add src/ui/dashboard.ts
      git commit -m "feat: tune dashboard title $i" >/dev/null
      ;;
    *)
      printf 'main churn commit %s\n' "$i" > "churn/commit-$i.txt"
      git add "churn/commit-$i.txt"
      git commit -m "chore: mainline churn $i" >/dev/null
      ;;
  esac
done

git push origin main >/dev/null

git clone "$REMOTE_DIR" "$PREDICT_DIR" >/dev/null
cd "$PREDICT_DIR"
git checkout feature/demo >/dev/null
git config user.name "Codex Stress Test"
git config user.email "codex-stress@example.com"

cat > src/notifications/worker.ts <<'EOF_FILE'
export function processNotifications(items: string[]): string[] {
  return items
    .map((item) => item.trim())
    .map((item) => "[local-notify] " + item);
}
EOF_FILE

cat > src/payments/payment-flow.ts <<'EOF_FILE'
export function runPayment(amount: number): string {
  return "charge-local:" + amount;
}
EOF_FILE

cat > src/auth/session.ts <<'EOF_FILE'
export function loadSession(token: string): string {
  return "session-local:" + token;
}
EOF_FILE

cat > src/search/index.ts <<'EOF_FILE'
export function search(query: string): string {
  return "search-local:" + query;
}
EOF_FILE

cat > docs/notes.md <<'EOF_FILE'
# Notes

Initial project notes.

Local draft notes.
EOF_FILE

git clone "$REMOTE_DIR" "$MERGE_DIR" >/dev/null
cd "$MERGE_DIR"
git checkout feature/demo >/dev/null
git config user.name "Codex Stress Test"
git config user.email "codex-stress@example.com"

cat > src/notifications/worker.ts <<'EOF_FILE'
export function processNotifications(items: string[]): string[] {
  return items
    .map((item) => item.trim())
    .map((item) => "[merge-local-notify] " + item);
}
EOF_FILE

cat > src/payments/payment-flow.ts <<'EOF_FILE'
export function runPayment(amount: number): string {
  return "charge-merge-local:" + amount;
}
EOF_FILE

cat > src/auth/session.ts <<'EOF_FILE'
export function loadSession(token: string): string {
  return "session-merge-local:" + token;
}
EOF_FILE

git add src/notifications/worker.ts src/payments/payment-flow.ts src/auth/session.ts
git commit -m "feat: local conflicting edits for merge stress test" >/dev/null

cat <<EOF_SUMMARY

Stress test repo ready.
Base: $BASE_DIR
Prediction workspace: $PREDICT_DIR
Merge workspace: $MERGE_DIR

Expected shape:
- 20 tracked project files in each feature workspace
- feature/demo is 100 commits behind origin/main in prediction workspace
- 5 active local files in prediction workspace
- 3 true merge conflicts available after merging origin/main in merge workspace

Suggested commands:
cd $PREDICT_DIR
git rev-list --count HEAD..origin/main
git status --short
node /home/chandra/Documents/git-catchup/dist/index.js
node /home/chandra/Documents/git-catchup/dist/index.js --preview
node /home/chandra/Documents/git-catchup/dist/index.js --isolate

cd $MERGE_DIR
git merge origin/main || true
git status --short
node /home/chandra/Documents/git-catchup/dist/index.js --resolve
EOF_SUMMARY
