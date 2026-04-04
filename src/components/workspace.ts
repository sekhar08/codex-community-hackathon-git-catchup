import type { DashboardData } from "../commands/fetch.js";
import type { CommitGroup } from "../commands/analyze.js";
import type { ImpactAnalysisResult } from "../commands/impact.js";
import type { ConflictPrediction } from "../commands/predict.js";
import type { CommandActionResult } from "../commands/actions.js";

export const workspaceSections = ["overview", "incoming", "local", "conflicts", "actions"] as const;

export type WorkspaceSection = typeof workspaceSections[number];
export type PanelMode = "none" | "commands" | "help" | "result" | "chat";
export type WorkspaceCommandId = "preview" | "isolate" | "resolve" | "test" | "ask-ai" | "help" | "quit";

export interface WorkspaceAction {
  id: WorkspaceCommandId;
  label: string;
  shortcut: string;
  description: string;
  disabled: boolean;
  disabledReason?: string;
}

export interface WorkspaceModel {
  summary: {
    incomingCommits: number;
    groups: number;
    localChanges: number;
    conflictPredictions: number;
    riskyGroups: number;
    safeGroups: number;
    recommendation: string;
  };
  incoming: Array<{
    title: string;
    emoji: string;
    count: number;
    isRisky: boolean;
    files: string[];
    riskyFiles: string[];
  }>;
  local: Array<{
    path: string;
    status: string;
    message: string;
    overlapCount: number;
    isRisky: boolean;
  }>;
  conflicts: ConflictPrediction[];
  actions: WorkspaceAction[];
}

export interface WorkspaceState {
  activeSection: WorkspaceSection;
  selectedIndices: Record<WorkspaceSection, number>;
  panel: PanelMode;
  commandIndex: number;
  busy: boolean;
  statusLine: string;
  result: CommandActionResult | null;
  chatInput: string;
  chatOutput: string;
}

export type WorkspaceEvent =
  | { type: "section_delta"; delta: number }
  | { type: "item_delta"; delta: number }
  | { type: "open_commands" }
  | { type: "close_panel" }
  | { type: "command_delta"; delta: number }
  | { type: "set_panel"; panel: PanelMode }
  | { type: "set_busy"; busy: boolean; statusLine?: string }
  | { type: "set_status"; statusLine: string }
  | { type: "set_result"; result: CommandActionResult; statusLine?: string }
  | { type: "chat_append"; value: string }
  | { type: "chat_backspace" }
  | { type: "chat_clear" }
  | { type: "set_chat_output"; value: string };

export function buildWorkspaceModel(
  data: DashboardData,
  groups: CommitGroup[],
  impactData: ImpactAnalysisResult,
  conflictPredictions: ConflictPrediction[],
  aiEnabled: boolean
): WorkspaceModel {
  const riskyGroups = groups.filter((group) => group.isRisky).length;
  const safeGroups = groups.filter((group) => !group.isRisky).length;
  const recommendation =
    conflictPredictions.length > 0
      ? "Start with preview. You have local overlap that needs review."
      : safeGroups > 0 && impactData.localChanges.length > 0
        ? "Use isolate to bring in safe commits before touching risky areas."
        : data.commitCount > 0
          ? "Run tests after reviewing the incoming groups."
          : "You are already caught up. Scan local changes or quit.";

  return {
    summary: {
      incomingCommits: data.commitCount,
      groups: groups.length,
      localChanges: impactData.localChanges.length,
      conflictPredictions: conflictPredictions.length,
      riskyGroups,
      safeGroups,
      recommendation
    },
    incoming: groups.map((group) => ({
      title: group.title,
      emoji: group.emoji,
      count: group.count,
      isRisky: group.isRisky,
      files: group.files,
      riskyFiles: group.riskyFiles ?? []
    })),
    local: impactData.localChanges.map((change) => ({
      path: change.path,
      status: change.status,
      message: change.message ?? "",
      overlapCount: (impactData.impactedFiles.get(change.path) ?? []).length,
      isRisky: (impactData.impactedFiles.get(change.path) ?? []).length > 0
    })),
    conflicts: conflictPredictions,
    actions: [
      {
        id: "preview",
        label: "Preview Risky Diff",
        shortcut: "p",
        description: "Show incoming diff for files that overlap with your local work.",
        disabled: conflictPredictions.length === 0,
        disabledReason: "No risky overlap detected."
      },
      {
        id: "isolate",
        label: "Apply Safe Commits",
        shortcut: "i",
        description: "Stash local work and cherry-pick only safe incoming commits first.",
        disabled: safeGroups === 0,
        disabledReason: "There are no safe groups to apply."
      },
      {
        id: "resolve",
        label: "Conflict Guidance",
        shortcut: "r",
        description: "Show the highest-risk files and the safest resolve order.",
        disabled: conflictPredictions.length === 0,
        disabledReason: "No predicted conflict areas."
      },
      {
        id: "test",
        label: "Run Relevant Tests",
        shortcut: "t",
        description: "Try the repo test runner against the current change surface.",
        disabled: false
      },
      {
        id: "ask-ai",
        label: "Ask AI",
        shortcut: "a",
        description: "Open the in-app question panel for contextual guidance.",
        disabled: !aiEnabled,
        disabledReason: "AI is not configured for this project."
      },
      {
        id: "help",
        label: "Keyboard Help",
        shortcut: "?",
        description: "Show section navigation and command shortcuts.",
        disabled: false
      },
      {
        id: "quit",
        label: "Quit",
        shortcut: "q",
        description: "Exit the workspace.",
        disabled: false
      }
    ]
  };
}

export function createInitialWorkspaceState(model: WorkspaceModel, aiStatus: string): WorkspaceState {
  return {
    activeSection: "overview",
    selectedIndices: {
      overview: 0,
      incoming: clampIndex(0, model.incoming.length),
      local: clampIndex(0, model.local.length),
      conflicts: clampIndex(0, model.conflicts.length),
      actions: clampIndex(0, model.actions.length)
    },
    panel: "none",
    commandIndex: 0,
    busy: false,
    statusLine: aiStatus,
    result: null,
    chatInput: "",
    chatOutput: ""
  };
}

export function workspaceReducer(
  state: WorkspaceState,
  event: WorkspaceEvent,
  model: WorkspaceModel
): WorkspaceState {
  switch (event.type) {
    case "section_delta": {
      const currentIndex = workspaceSections.indexOf(state.activeSection);
      const nextSection = workspaceSections[(currentIndex + event.delta + workspaceSections.length) % workspaceSections.length];
      return {
        ...state,
        activeSection: nextSection
      };
    }

    case "item_delta": {
      const length = getSectionLength(state.activeSection, model);
      const currentIndex = state.selectedIndices[state.activeSection];
      return {
        ...state,
        selectedIndices: {
          ...state.selectedIndices,
          [state.activeSection]: clampIndex(currentIndex + event.delta, length)
        }
      };
    }

    case "open_commands":
      return {
        ...state,
        panel: "commands",
        commandIndex: 0
      };

    case "close_panel":
      return {
        ...state,
        panel: "none",
        busy: false
      };

    case "command_delta":
      return {
        ...state,
        commandIndex: clampIndex(state.commandIndex + event.delta, model.actions.length)
      };

    case "set_panel":
      return {
        ...state,
        panel: event.panel
      };

    case "set_busy":
      return {
        ...state,
        busy: event.busy,
        statusLine: event.statusLine ?? state.statusLine
      };

    case "set_status":
      return {
        ...state,
        statusLine: event.statusLine
      };

    case "set_result":
      return {
        ...state,
        panel: "result",
        busy: false,
        result: event.result,
        statusLine: event.statusLine ?? state.statusLine
      };

    case "chat_append":
      return {
        ...state,
        chatInput: state.chatInput + event.value
      };

    case "chat_backspace":
      return {
        ...state,
        chatInput: state.chatInput.slice(0, -1)
      };

    case "chat_clear":
      return {
        ...state,
        chatInput: "",
        chatOutput: ""
      };

    case "set_chat_output":
      return {
        ...state,
        chatOutput: event.value
      };

    default:
      return state;
  }
}

export function getSectionLength(section: WorkspaceSection, model: WorkspaceModel): number {
  switch (section) {
    case "incoming":
      return model.incoming.length;
    case "local":
      return model.local.length;
    case "conflicts":
      return model.conflicts.length;
    case "actions":
      return model.actions.length;
    default:
      return 1;
  }
}

function clampIndex(value: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(value, length - 1));
}
