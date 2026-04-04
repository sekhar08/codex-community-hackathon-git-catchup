import React from "react";
import { Box, Newline, Spacer, Text, useApp, useInput } from "ink";

import type { ConflictExplanation } from "../lib/openai.js";
import type { ConflictFileSession, ConflictHunk } from "../commands/resolve.js";

interface ResolverMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface InteractiveResolverProps {
  initialSessions: ConflictFileSession[];
  targetBranch: string;
  aiEnabled: boolean;
  mergeStartedByResolver: boolean;
  stashRef: string | null;
  onExplain: (
    session: ConflictFileSession,
    hunk: ConflictHunk,
    question: string
  ) => Promise<ConflictExplanation>;
  onApplyChoice: (
    session: ConflictFileSession,
    hunk: ConflictHunk,
    choice: "mine" | "theirs" | "both" | "suggestion",
    mergedText?: string
  ) => Promise<{ sessions: ConflictFileSession[]; message: string }>;
  onStageFile: (filePath: string) => Promise<string>;
  onRefresh: () => Promise<ConflictFileSession[]>;
  onAbort: () => Promise<string>;
}

export function InteractiveResolver({
  initialSessions,
  targetBranch,
  aiEnabled,
  mergeStartedByResolver,
  stashRef,
  onExplain,
  onApplyChoice,
  onStageFile,
  onRefresh,
  onAbort
}: InteractiveResolverProps): React.JSX.Element {
  const { exit } = useApp();
  const [sessions, setSessions] = React.useState(initialSessions);
  const [fileIndex, setFileIndex] = React.useState(0);
  const [hunkIndex, setHunkIndex] = React.useState(0);
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<ResolverMessage[]>([
    {
      role: "system",
      content:
        initialSessions.length > 0
          ? "Resolver ready. Ask why the conflict happened, request a suggestion, or use quick commands like keep-mine, keep-theirs, next, prev, stage, abort, or exit."
          : "No conflicted files are currently active."
    }
  ]);
  const [statusLine, setStatusLine] = React.useState(
    aiEnabled ? "AI resolver ready." : "AI unavailable. Falling back to deterministic guidance."
  );
  const [busy, setBusy] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Record<string, string>>({});

  const currentSession = sessions[Math.min(fileIndex, Math.max(0, sessions.length - 1))];
  const currentHunk = currentSession?.hunks[Math.min(hunkIndex, Math.max(0, currentSession.hunks.length - 1))];
  const suggestionKey = currentSession && currentHunk ? `${currentSession.filePath}:${currentHunk.id}` : null;

  const appendMessage = React.useCallback((message: ResolverMessage) => {
    setMessages((current) => [...current.slice(-13), message]);
  }, []);

  const refreshSessions = React.useCallback(async () => {
    const nextSessions = await onRefresh();
    setSessions(nextSessions);
    setFileIndex((current) => Math.min(current, Math.max(0, nextSessions.length - 1)));
    setHunkIndex(0);

    if (nextSessions.length === 0) {
      setStatusLine("All conflicts are resolved. Stage your files or finish the merge.");
      appendMessage({
        role: "system",
        content: "All conflicted files are clear. Stage the files you want to keep and finish the merge."
      });
    }
  }, [appendMessage, onRefresh]);

  const handleExplain = React.useCallback(async (question: string) => {
    if (!currentSession || !currentHunk) {
      return;
    }

    appendMessage({ role: "user", content: question });
    setBusy(true);
    setStatusLine("Analyzing the current conflict...");

    try {
      const explanation = await onExplain(currentSession, currentHunk, question);
      if (suggestionKey && explanation.mergedText) {
        setSuggestions((current) => ({
          ...current,
          [suggestionKey]: explanation.mergedText ?? ""
        }));
      }
      appendMessage({
        role: "assistant",
        content: [
          explanation.explanation,
          `Recommended action: ${explanation.recommendedAction}`,
          explanation.warnings.length > 0 ? `Warnings: ${explanation.warnings.join(" ")}` : null
        ]
          .filter((value): value is string => Boolean(value))
          .join("\n")
      });
      setStatusLine(`Resolver confidence: ${explanation.confidence}`);
    } catch (error) {
      appendMessage({
        role: "assistant",
        content: error instanceof Error ? error.message : "Failed to analyze the conflict."
      });
      setStatusLine("Conflict analysis failed.");
    } finally {
      setBusy(false);
    }
  }, [appendMessage, currentHunk, currentSession, onExplain, suggestionKey]);

  const applyChoice = React.useCallback(async (choice: "mine" | "theirs" | "both" | "suggestion") => {
    if (!currentSession || !currentHunk) {
      return;
    }

    setBusy(true);
    setStatusLine(`Applying ${choice}...`);

    try {
      const mergedText = choice === "suggestion" && suggestionKey ? suggestions[suggestionKey] : undefined;
      const result = await onApplyChoice(currentSession, currentHunk, choice, mergedText);
      appendMessage({ role: "system", content: result.message });
      setStatusLine(result.message);
      setSessions(result.sessions);
      setFileIndex((current) => Math.min(current, Math.max(0, result.sessions.length - 1)));
      setHunkIndex(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply the requested resolution.";
      appendMessage({ role: "assistant", content: message });
      setStatusLine(message);
    } finally {
      setBusy(false);
    }
  }, [appendMessage, currentHunk, currentSession, onApplyChoice, suggestionKey, suggestions]);

  const stageCurrentFile = React.useCallback(async () => {
    if (!currentSession) {
      return;
    }

    setBusy(true);

    try {
      const message = await onStageFile(currentSession.filePath);
      appendMessage({ role: "system", content: message });
      setStatusLine(message);
      await refreshSessions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to stage the current file.";
      appendMessage({ role: "assistant", content: message });
      setStatusLine(message);
    } finally {
      setBusy(false);
    }
  }, [appendMessage, currentSession, onStageFile, refreshSessions]);

  const abortSession = React.useCallback(async () => {
    setBusy(true);

    try {
      const message = await onAbort();
      appendMessage({ role: "system", content: message });
      setStatusLine(message);
      exit();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to abort the merge session.";
      appendMessage({ role: "assistant", content: message });
      setStatusLine(message);
    } finally {
      setBusy(false);
    }
  }, [appendMessage, exit, onAbort]);

  const runCommand = React.useCallback(async (commandText: string) => {
    const trimmed = commandText.trim();

    if (!trimmed) {
      return;
    }

    const normalized = trimmed.toLowerCase();

    if (normalized === "exit" || normalized === "quit" || normalized === "q") {
      exit();
      return;
    }

    if (normalized === "next") {
      setHunkIndex((current) =>
        currentSession ? Math.min(current + 1, Math.max(0, currentSession.hunks.length - 1)) : 0
      );
      setStatusLine("Moved to the next conflict hunk.");
      return;
    }

    if (normalized === "prev") {
      setHunkIndex((current) => Math.max(0, current - 1));
      setStatusLine("Moved to the previous conflict hunk.");
      return;
    }

    if (normalized === "next-file") {
      setFileIndex((current) => Math.min(current + 1, Math.max(0, sessions.length - 1)));
      setHunkIndex(0);
      setStatusLine("Moved to the next conflicted file.");
      return;
    }

    if (normalized === "prev-file") {
      setFileIndex((current) => Math.max(0, current - 1));
      setHunkIndex(0);
      setStatusLine("Moved to the previous conflicted file.");
      return;
    }

    if (normalized === "keep-mine") {
      await applyChoice("mine");
      return;
    }

    if (normalized === "keep-theirs") {
      await applyChoice("theirs");
      return;
    }

    if (normalized === "show-both") {
      await applyChoice("both");
      return;
    }

    if (normalized === "suggest") {
      await handleExplain("Suggest a good merge for this conflict.");
      return;
    }

    if (normalized === "apply-suggestion") {
      await applyChoice("suggestion");
      return;
    }

    if (normalized === "stage") {
      await stageCurrentFile();
      return;
    }

    if (normalized === "abort") {
      await abortSession();
      return;
    }

    await handleExplain(trimmed);
  }, [abortSession, applyChoice, currentSession, exit, handleExplain, sessions.length, stageCurrentFile]);

  useInput((value, key) => {
    if (busy) {
      return;
    }

    if (key.ctrl && value === "c") {
      exit();
      return;
    }

    if (key.return) {
      const submitted = input;
      setInput("");
      void runCommand(submitted);
      return;
    }

    if (key.backspace || key.delete) {
      setInput((current) => current.slice(0, -1));
      return;
    }

    if (key.upArrow) {
      void runCommand("prev");
      return;
    }

    if (key.downArrow) {
      void runCommand("next");
      return;
    }

    if (key.leftArrow) {
      void runCommand("prev-file");
      return;
    }

    if (key.rightArrow) {
      void runCommand("next-file");
      return;
    }

    if (value.length > 0 && !key.tab) {
      setInput((current) => current + value);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
        <Box>
          <Text color="cyanBright" bold>
            AI Conflict Resolver
          </Text>
          <Spacer />
          <Text color="gray">target {targetBranch}</Text>
        </Box>
        <Box>
          <Text color="gray">
            {currentSession
              ? `Resolving: ${currentSession.filePath} (${fileIndex + 1} of ${sessions.length})`
              : "No conflicted files"}
          </Text>
          <Spacer />
          <Text color={aiEnabled ? "yellow" : "gray"}>{aiEnabled ? "AI enabled" : "Fallback mode"}</Text>
        </Box>
        {mergeStartedByResolver ? (
          <Text color="gray">
            Guarded merge started by git-catchup{stashRef ? ` • savepoint ${stashRef}` : ""}
          </Text>
        ) : null}
      </Box>

      <Newline />

      {currentSession && currentHunk ? (
        <Box flexDirection="column">
          <Text color="white" bold>
            Hunk {hunkIndex + 1} of {currentSession.hunks.length}
          </Text>
          {currentSession.incomingCommit ? (
            <Text color="gray">
              Incoming: {currentSession.incomingCommit.hash.slice(0, 7)} by {currentSession.incomingCommit.author} •{" "}
              {currentSession.incomingCommit.message}
            </Text>
          ) : null}
          {currentHunk.surroundingContext.length > 0 ? (
            <Text color="gray">Context: {currentHunk.surroundingContext}</Text>
          ) : null}

          <Newline />

          <Box gap={2}>
            <Box width="50%" borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
              <Text color="yellow" bold>
                Mine ({currentHunk.currentLabel})
              </Text>
              {renderCodeBlock(currentHunk.currentText, "white")}
            </Box>
            <Box width="50%" borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
              <Text color="cyan" bold>
                Theirs ({currentHunk.incomingLabel})
              </Text>
              {renderCodeBlock(currentHunk.incomingText, "white")}
            </Box>
          </Box>
        </Box>
      ) : (
        <Text color="green">No active conflict hunks remain.</Text>
      )}

      <Newline />

      <Box borderStyle="round" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright" bold>
          Conversation
        </Text>
        {messages.slice(-8).map((message, index) => (
          <Box key={`${message.role}:${index}`} flexDirection="column">
            <Text color={message.role === "assistant" ? "magentaBright" : message.role === "user" ? "cyan" : "gray"} bold>
              {message.role === "assistant" ? "AI" : message.role === "user" ? "You" : "System"}
            </Text>
            <Text>{message.content}</Text>
          </Box>
        ))}
      </Box>

      <Newline />

      <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
        <Text color="gray">
          Commands: next, prev, next-file, prev-file, keep-mine, keep-theirs, show-both, suggest, apply-suggestion, stage, abort, exit
        </Text>
        <Text color={busy ? "yellow" : "gray"}>{statusLine}</Text>
        <Text color="white">{input.length > 0 ? input : "Ask why this conflicts, request a suggestion, or type a command..."}</Text>
      </Box>
    </Box>
  );
}

function renderCodeBlock(content: string, color: string): React.JSX.Element {
  const lines = content.length > 0 ? content.split("\n") : ["<empty>"];

  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Text key={`${line}:${index}`} color={color}>
          {line.length > 0 ? line : " "}
        </Text>
      ))}
    </Box>
  );
}
