"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Columns2,
  Eye,
  GitBranch,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  RefreshCw,
  Save,
} from "lucide-react";
import {
  checkBranch,
  getNote,
  getRepoTree,
  saveNote,
  type TreeFileItem,
} from "@/actions/github";
import { FileTree } from "@/components/FileTree";
import { MarkdownPreview } from "@/components/MarkdownPreview";

interface NoteEditorProps {
  repoPath?: string;
}

type EditorViewMode = "edit" | "preview" | "split";

export function NoteEditor({ repoPath = "notes/inbox.md" }: NoteEditorProps) {
  const [currentPath, setCurrentPath] = useState(repoPath);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [sha, setSha] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, startSave] = useTransition();

  const [viewMode, setViewMode] = useState<EditorViewMode>("split");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [treeFiles, setTreeFiles] = useState<TreeFileItem[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);

  const [branchInfo, setBranchInfo] = useState<{
    branch: string;
    exists: boolean;
  } | null>(null);
  const [isOutOfSync, setIsOutOfSync] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const isTypingRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load branch information
  const loadBranch = useCallback(async () => {
    const res = await checkBranch();
    if (res.ok) {
      setBranchInfo({ branch: res.branch, exists: res.exists });
    }
  }, []);

  // Load HEAD commit file tree
  const loadTree = useCallback(async () => {
    setLoadingTree(true);
    const res = await getRepoTree();
    if (res.ok) {
      setTreeFiles(res.files);
    }
    setLoadingTree(false);
  }, []);

  // Load note content
  const loadNote = useCallback(async (path: string) => {
    setLoading(true);
    setStatusMessage(null);
    setIsOutOfSync(false);

    const res = await getNote(path);
    if (res.ok) {
      setContent(res.content);
      setSavedContent(res.content);
      setSha(res.sha);
    } else {
      setStatusMessage({ type: "error", text: res.error });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadBranch();
    void loadTree();
  }, [loadBranch, loadTree]);

  useEffect(() => {
    void loadNote(currentPath);
  }, [currentPath, loadNote]);

  // Check sync status using conditional GET (/api/notes/sync-status) with 304 ETag caching
  const checkRemoteSync = useCallback(async () => {
    if (!sha || loading || saving) return;

    try {
      const url = `/api/notes/sync-status?path=${encodeURIComponent(currentPath)}&sha=${encodeURIComponent(sha)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;

      const data = (await res.json()) as { isOutOfSync?: boolean; latestSha?: string };
      if (data.isOutOfSync) {
        setIsOutOfSync(true);
      }
    } catch {
      // Ignore background network blips
    }
  }, [currentPath, sha, loading, saving]);

  // Background polling every 30s
  useEffect(() => {
    if (!sha || loading) return;

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && (document.hidden || !document.hasFocus())) {
        return;
      }
      if (isTypingRef.current) {
        return;
      }
      void checkRemoteSync();
    }, 30_000);

    return () => clearInterval(interval);
  }, [sha, loading, checkRemoteSync]);

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    isTypingRef.current = true;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 2000);
  };

  const isDirty = content !== savedContent;
  const isBusy = loading || saving;

  const handleSave = () => {
    startSave(async () => {
      setStatusMessage(null);
      const res = await saveNote(currentPath, content, sha);
      if (res.ok) {
        setSavedContent(content);
        setSha(res.sha);
        setIsOutOfSync(false);
        setStatusMessage({
          type: "success",
          text: `Saved & committed to ${branchInfo?.branch || "GitHub"}`,
        });
        void loadTree();
      } else {
        if (res.code === "CONFLICT") {
          setIsOutOfSync(true);
        }
        setStatusMessage({ type: "error", text: res.error });
      }
    });
  };

  const handleNewFile = () => {
    const name = window.prompt("Enter new file path (e.g. notes/todo.md):", "notes/new-note.md");
    if (!name) return;
    const clean = name.trim();
    if (!clean.endsWith(".md") && !clean.endsWith(".markdown")) {
      alert("Note must end in .md or .markdown");
      return;
    }
    setCurrentPath(clean);
  };

  return (
    <div className="flex h-full w-full flex-1 overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      {/* File Tree Sidebar (collapsible) */}
      {sidebarOpen && (
        <FileTree
          files={treeFiles}
          selectedPath={currentPath}
          onSelectFile={(path) => setCurrentPath(path)}
          onNewFile={handleNewFile}
          onRefresh={() => void loadTree()}
          isLoading={loadingTree}
          branchName={branchInfo?.branch}
        />
      )}

      {/* Editor & Preview Main Area */}
      <div className="flex flex-1 flex-col overflow-hidden p-3 sm:p-4">
        {/* Top action / status bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle File Tree Button */}
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              title={sidebarOpen ? "Hide File Tree" : "Show File Tree"}
              className="rounded-md border border-border bg-surface p-1.5 text-muted hover:text-fg"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftOpen className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Current Path */}
            <span className="rounded bg-surface-subtle px-2.5 py-1 font-mono text-xs font-medium text-fg">
              {currentPath}
            </span>

            {/* Branch badge */}
            {branchInfo && (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-mono ${
                  branchInfo.exists
                    ? "bg-surface-subtle text-muted"
                    : "bg-danger-soft text-danger"
                }`}
                title={branchInfo.exists ? `Branch: ${branchInfo.branch}` : `Branch '${branchInfo.branch}' missing`}
              >
                <GitBranch className="h-3 w-3" />
                {branchInfo.branch}
                {!branchInfo.exists && " (missing)"}
              </span>
            )}

            {/* Sync badge */}
            {isOutOfSync ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger">
                <AlertCircle className="h-3 w-3 animate-pulse" />
                Out of Sync. Refresh to update.
              </span>
            ) : isDirty ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                Unsaved edits
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-medium text-ok">
                <CheckCircle2 className="h-3 w-3" />
                In sync
              </span>
            )}
          </div>

          {/* Action buttons & View toggles */}
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-md border border-border bg-surface-subtle p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("edit")}
                title="Edit mode only"
                className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${
                  viewMode === "edit"
                    ? "bg-surface text-fg shadow-xs"
                    : "text-muted hover:text-fg"
                }`}
              >
                <PenLine className="h-3 w-3" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => setViewMode("split")}
                title="Split view (Edit + Preview)"
                className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${
                  viewMode === "split"
                    ? "bg-surface text-fg shadow-xs"
                    : "text-muted hover:text-fg"
                }`}
              >
                <Columns2 className="h-3 w-3" />
                Split
              </button>
              <button
                type="button"
                onClick={() => setViewMode("preview")}
                title="Preview mode only"
                className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${
                  viewMode === "preview"
                    ? "bg-surface text-fg shadow-xs"
                    : "text-muted hover:text-fg"
                }`}
              >
                <Eye className="h-3 w-3" />
                Preview
              </button>
            </div>

            {/* Check Sync Button */}
            <button
              type="button"
              onClick={() => void checkRemoteSync()}
              disabled={isBusy}
              title="Check remote sync status"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Check
            </button>

            {/* Refresh button when out of sync */}
            {isOutOfSync && (
              <button
                type="button"
                onClick={() => void loadNote(currentPath)}
                disabled={isBusy}
                className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger hover:opacity-90 disabled:opacity-50"
              >
                Refresh
              </button>
            )}

            {/* Save Note Button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isBusy || (!isDirty && sha !== null)}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Save Note
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status banner */}
        {statusMessage && (
          <div
            className={`mt-2 flex items-center justify-between rounded-md px-3 py-2 text-xs ${
              statusMessage.type === "error"
                ? "bg-danger-soft text-danger"
                : statusMessage.type === "success"
                  ? "bg-ok-soft text-ok"
                  : "bg-surface-subtle text-muted"
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="ml-2 font-bold hover:opacity-75"
            >
              ✕
            </button>
          </div>
        )}

        {/* Editor & Preview Pane taking full remaining height */}
        <div className="relative mt-3 flex flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading {currentPath} from GitHub…
            </div>
          ) : (
            <div className="flex h-full w-full gap-3 overflow-hidden">
              {/* Textarea Editor Pane */}
              {(viewMode === "edit" || viewMode === "split") && (
                <div
                  className={`flex h-full flex-col overflow-hidden ${
                    viewMode === "split" ? "w-1/2" : "w-full"
                  }`}
                >
                  <textarea
                    value={content}
                    onChange={handleTextChange}
                    disabled={saving}
                    spellCheck={false}
                    placeholder="Write markdown here... (auto-synced with GitHub)"
                    className="h-full w-full resize-none rounded-md border border-border bg-surface p-4 font-mono text-sm leading-relaxed outline-none focus:border-accent"
                  />
                </div>
              )}

              {/* Rendered Markdown Preview Pane */}
              {(viewMode === "preview" || viewMode === "split") && (
                <div
                  className={`flex h-full flex-col overflow-hidden ${
                    viewMode === "split" ? "w-1/2" : "w-full"
                  }`}
                >
                  <MarkdownPreview content={content} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
