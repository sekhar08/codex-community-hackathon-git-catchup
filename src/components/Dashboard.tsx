import React from "react";
import { Box, Newline, Text, useApp, useInput } from "ink";

import type { DashboardData } from "../commands/fetch.js";
import type { ImpactAnalysisResult } from "../commands/impact.js";
import type { CommitGroup } from "../commands/analyze.js";
import type { ConflictPrediction } from "../commands/predict.js";
import type { ChatContext } from "../lib/openai.js";
import { buildSystemPrompt, streamChat } from "../lib/openai.js";
import type { CommandActionResult } from "../commands/actions.js";
import {
  buildWorkspaceModel,
  createInitialWorkspaceState,
  workspaceReducer,
  type WorkspaceAction,
  type WorkspaceCommandId
} from "./workspace.js";

export interface DashboardActionHandlers {
  preview: () => Promise<CommandActionResult>;
  isolate: () => Promise<CommandActionResult>;
  resolve: () => Promise<CommandActionResult>;
  test: () => Promise<CommandActionResult>;
}

export interface DashboardProps {
  data: DashboardData;
  groups: CommitGroup[];
  impactData: ImpactAnalysisResult;
  conflictPredictions: ConflictPrediction[];
  aiStatus: string;
  actions: DashboardActionHandlers;
}

const divider = "────────────────────────────────────";
const statusColors: Record<string, string> = {
  info: "cyanBright",
  success: "green",
  warning: "yellow",
  danger: "redBright"
};

const statusEmojis: Record<string, string> = {
  modified: "📝",
  added: "➕",
  renamed: "🔀",
  deleted: "🗑️",
  untracked: "📄",
  changed: "📝"
};

export function Dashboard({
  data,
  groups,
  impactData,
  conflictPredictions,
  aiStatus,
  actions
}: DashboardProps): React.JSX.Element {
  const { exit } = useApp();
  const aiEnabled = aiStatus.startsWith("✨");
  const model = React.useMemo(
    () => buildWorkspaceModel(data, groups, impactData, conflictPredictions, aiEnabled),
    [aiEnabled, conflictPredictions, data, groups, impactData]
  );
  const [state, dispatchBase] = React.useReducer(
    (currentState: ReturnType<typeof createInitialWorkspaceState>, event: Parameters<typeof workspaceReducer>[1]) =>
      workspaceReducer(currentState, event, model),
    createInitialWorkspaceState(model, aiStatus)
  );
  const dispatch = React.useCallback(
    (event: Parameters<typeof workspaceReducer>[1]) => {
      dispatchBase(event);
    },
    [dispatchBase]
  );
  const chatContext = React.useMemo<ChatContext>(
    () => ({
      commits: data.incomingCommits,
      groups,
      localChanges: impactData.localChanges,
      conflicts: conflictPredictions,
      dashboardData: data
    }),
    [conflictPredictions, data, groups, impactData.localChanges]
  );

  const executeAction = React.useCallback(
    async (action: WorkspaceAction) => {
      if (action.disabled) {
        dispatch({
          type: "set_status",
          statusLine: action.disabledReason ?? `${action.label} is not available.`
        });
        return;
      }

      if (action.id === "quit") {
        exit();
        return;
      }

      if (action.id === "help") {
        dispatch({ type: "set_panel", panel: "help" });
        return;
      }

      if (action.id === "ask-ai") {
        dispatch({ type: "chat_clear" });
        dispatch({ type: "set_panel", panel: "chat" });
        dispatch({ type: "set_status", statusLine: aiEnabled ? "AI question panel ready." : aiStatus });
        return;
      }

      const runner = getActionRunner(action.id, actions);

      if (!runner) {
        return;
      }

      dispatch({
        type: "set_busy",
        busy: true,
        statusLine: `Running ${action.label.toLowerCase()}...`
      });

      try {
        const result = await runner();
        dispatch({
          type: "set_result",
          result,
          statusLine: result.summary
        });
      } catch (error) {
        dispatch({
          type: "set_result",
          result: {
            title: action.label,
            summary: error instanceof Error ? error.message : "Unknown action error",
            tone: "danger",
            lines: [error instanceof Error ? error.message : "Unknown action error"]
          },
          statusLine: error instanceof Error ? error.message : "Unknown action error"
        });
      }
    },
    [actions, aiEnabled, aiStatus, dispatch, exit]
  );

  const submitChat = React.useCallback(async () => {
    if (!aiEnabled) {
      dispatch({ type: "set_status", statusLine: aiStatus });
      return;
    }

    if (state.chatInput.trim().length === 0) {
      dispatch({ type: "set_status", statusLine: "Type a question for AI first." });
      return;
    }

    dispatch({ type: "set_busy", busy: true, statusLine: "AI is analyzing your catch-up context..." });
    dispatch({ type: "set_chat_output", value: "" });

    try {
      let fullResponse = "";

      await streamChat(
        [
          {
            role: "system",
            content: buildSystemPrompt(chatContext)
          },
          {
            role: "user",
            content: state.chatInput
          }
        ],
        (chunk) => {
          fullResponse += chunk;
          dispatch({ type: "set_chat_output", value: fullResponse });
        }
      );

      dispatch({ type: "set_busy", busy: false, statusLine: "AI response ready." });
    } catch (error) {
      dispatch({
        type: "set_busy",
        busy: false,
        statusLine: error instanceof Error ? error.message : "AI request failed."
      });
      dispatch({
        type: "set_chat_output",
        value: error instanceof Error ? error.message : "AI request failed."
      });
    }
  }, [aiEnabled, aiStatus, chatContext, dispatch, state.chatInput]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (state.panel === "chat") {
      if (key.escape) {
        dispatch({ type: "close_panel" });
        return;
      }

      if (key.return) {
        void submitChat();
        return;
      }

      if (key.backspace || key.delete) {
        dispatch({ type: "chat_backspace" });
        return;
      }

      if (input.length > 0 && !key.tab) {
        dispatch({ type: "chat_append", value: input });
      }

      return;
    }

    if (state.panel === "commands") {
      if (key.escape) {
        dispatch({ type: "close_panel" });
        return;
      }

      if (key.upArrow || input === "k") {
        dispatch({ type: "command_delta", delta: -1 });
        return;
      }

      if (key.downArrow || input === "j") {
        dispatch({ type: "command_delta", delta: 1 });
        return;
      }

      if (key.return) {
        void executeAction(model.actions[state.commandIndex] ?? model.actions[0]);
      }

      return;
    }

    if (state.panel === "help" || state.panel === "result") {
      if (key.escape || key.return || input === "q") {
        dispatch({ type: "close_panel" });
      }
      return;
    }

    if (input === ":" || input === "/") {
      dispatch({ type: "open_commands" });
      return;
    }

    if (input === "?") {
      dispatch({ type: "set_panel", panel: "help" });
      return;
    }

    if (input === "q") {
      exit();
      return;
    }

    const shortcutAction = model.actions.find((action) => action.shortcut === input);

    if (shortcutAction) {
      void executeAction(shortcutAction);
    }
  });

  return (
    <Box flexDirection="column">
      <Newline />

      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="white" bold>
          Git Catchup
        </Text>
        <Text color="white">Post-Holiday Merge Assistant</Text>
      </Box>

      <Newline />
      <Newline />

      <Text color={aiEnabled ? "yellow" : "gray"}>{aiStatus}</Text>

      <Newline />
      <Newline />

      <Text>
        <Text color="red">📍 </Text>
        <Text color="white" bold>{data.branch}</Text>
        <Text color="gray"> → </Text>
        <Text color="cyan">{data.targetBranch}</Text>
        {data.upstream ? <Text color="gray"> • upstream {data.upstream}</Text> : null}
      </Text>

      <Text>
        <Text color="red">📅 </Text>
        <Text color="white" bold>{data.timeSpanLabel} of changes</Text>
        <Text color="gray"> | </Text>
        <Text color="white" bold>{data.commitCount} commits</Text>
        <Text color="gray"> on main</Text>
      </Text>

      <Text color="gray">{divider}</Text>
      <Newline />

      <Text color="yellow" bold>
        📦 GROUPED BY FEATURE:
      </Text>
      <Newline />
      {groups.length === 0 ? (
        <Text color="green">└── ✨ All caught up! No incoming commits.</Text>
      ) : (
        groups.map((group, index) => (
          <FeatureGroup key={`${group.title}:${group.count}`} group={group} isLast={index === groups.length - 1} />
        ))
      )}

      <Newline />
      <Text color="gray">{divider}</Text>

      <Newline />
      <Text color="yellow" bold>
        ⚠️ YOUR LOCAL CHANGES:
      </Text>
      {impactData.localChanges.length === 0 ? (
        <Text color="green">No uncommitted files. Clean working tree!</Text>
      ) : (
        impactData.localChanges.map((change) => (
          <Text key={`${change.path}:${change.status}`}>
            <Text color={change.status === "untracked" ? "yellow" : "white"}>{change.path}</Text>
            <Text color="gray"> ({change.status}) → </Text>
            <Text color="white">"{change.message ?? ""}"</Text>
          </Text>
        ))
      )}

      <Newline />
      <Text color="yellow" bold>
        ⚠️ CONFLICT RISK:
      </Text>
      {conflictPredictions.length === 0 ? (
        <Text color="green">No likely conflict zones detected.</Text>
      ) : (
        conflictPredictions.slice(0, 3).map((prediction) => (
          <Box key={prediction.path} flexDirection="column">
            <Text>
              <Text color="white">• </Text>
              <Text color={prediction.severity === "high" ? "white" : "yellow"}>{prediction.path}</Text>
              <Text color="gray"> ({prediction.severity} risk)</Text>
            </Text>
            <Text color="gray">  {prediction.explanation}</Text>
          </Box>
        ))
      )}

      <Newline />
      <Text color="redBright" bold>
        🎯 RECOMMENDED ACTIONS:
      </Text>
      <Text color="gray">{divider}</Text>
      <Text>git catchup --preview → See full diff before merging</Text>
      <Text>git catchup --isolate → Pull safe commits first</Text>
      <Text>git catchup --resolve → Guided conflict resolution</Text>
      <Text>git catchup --test → Run relevant tests automatically</Text>
      <Text color="gray">{divider}</Text>

      <Newline />
      <Text color={state.result ? statusColors[state.result.tone] : "gray"}>{state.statusLine}</Text>
      <Text color="gray">Shortcuts: `:` commands • `a` ask AI • `?` help • `q` quit</Text>

      {state.panel !== "none" ? (
        <>
          <Newline />
          <OverlayPanel state={state} actions={model.actions} />
        </>
      ) : null}
    </Box>
  );
}

function FeatureGroup({ group, isLast }: { group: CommitGroup; isLast: boolean }): React.JSX.Element {
  const branchPrefix = isLast ? "└──" : "├──";
  const childPrefix = isLast ? "    └──" : "│   └──";
  const file = group.riskyFiles?.[0] ?? group.files[0];
  const safeText = group.isRisky ? "← YOUR FILE (conflict likely)" : "(safe to pull)";

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="gray">{branchPrefix} </Text>
        {group.isRisky ? (
          <>
            <Text color="red">🔥 </Text>
            <Text color="white" bold>Hot: </Text>
            <Text color="white">{group.title}</Text>
          </>
        ) : (
          <>
            <Text>{group.emoji} </Text>
            <Text color="white">{group.title}</Text>
          </>
        )}
        <Text color="gray"> ({group.count} commits)</Text>
      </Text>
      {file ? (
        <Text>
          <Text color="gray">{childPrefix} </Text>
          <Text color="white">Changes: </Text>
          <Text color="white">{file}</Text>
          <Text color={group.isRisky ? "yellow" : "gray"}> {safeText}</Text>
        </Text>
      ) : null}
    </Box>
  );
}

function OverlayPanel({
  state,
  actions
}: {
  state: ReturnType<typeof createInitialWorkspaceState>;
  actions: WorkspaceAction[];
}): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
      {state.panel === "commands" ? (
        <>
          <Text color="magentaBright" bold>Command Palette</Text>
          <Text color="gray">Use j/k and Enter. Esc closes.</Text>
          {actions.map((action, index) => (
            <Text key={action.id} color={index === state.commandIndex ? "white" : "gray"}>
              {index === state.commandIndex ? "→ " : "  "}
              {action.label}
              <Text color="gray"> ({action.shortcut})</Text>
            </Text>
          ))}
        </>
      ) : null}

      {state.panel === "help" ? (
        <>
          <Text color="magentaBright" bold>Help</Text>
          <Text>`:` or `/` opens commands</Text>
          <Text>`a` opens AI panel</Text>
          <Text>`p` preview diff</Text>
          <Text>`i` isolate safe commits</Text>
          <Text>`r` conflict guidance</Text>
          <Text>`t` run tests</Text>
          <Text>`q` quits</Text>
        </>
      ) : null}

      {state.panel === "result" ? (
        <>
          <Text color={state.result ? statusColors[state.result.tone] : "magentaBright"} bold>
            {state.result?.title ?? "Result"}
          </Text>
          <Text color="gray">{state.result?.summary ?? ""}</Text>
          {(state.result?.lines ?? []).slice(0, 16).map((line, index) => (
            <Text key={`${line}:${index}`} color="gray">{line}</Text>
          ))}
          <Text color="gray">Press Enter or Esc to close.</Text>
        </>
      ) : null}

      {state.panel === "chat" ? (
        <>
          <Text color="magentaBright" bold>Ask AI</Text>
          <Text color="gray">Type a question and press Enter. Esc closes.</Text>
          <Text color="white">{state.chatInput.length > 0 ? state.chatInput : "What should I review first?"}</Text>
          <Newline />
          <Text>{state.chatOutput.length > 0 ? state.chatOutput : "No AI response yet."}</Text>
        </>
      ) : null}
    </Box>
  );
}

function getActionRunner(actionId: WorkspaceCommandId, actions: DashboardActionHandlers): (() => Promise<CommandActionResult>) | null {
  switch (actionId) {
    case "preview":
      return actions.preview;
    case "isolate":
      return actions.isolate;
    case "resolve":
      return actions.resolve;
    case "test":
      return actions.test;
    default:
      return null;
  }
}
