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
  copyFile,
  deleteFile,
  getNote,
  getRepoTree,
  renameFile,
  saveNote,
  type TreeFileItem,
} from "@/actions/github";
import { ActionModal, type ModalType } from "@/components/ActionModal";
import { FileTree } from "@/components/FileTree";
import { MarkdownPreview } from "@/components/MarkdownPreview";

interface NoteEditorProps {
  repoPath?: string;
}

type EditorViewMode = "edit" | "preview" | "split";

interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  description?: string;
  defaultValue?: string;
  inputPlaceholder?: string;
  confirmText?: string;
  isDestructive?: boolean;
  onConfirm: (inputValue?: string) => Promise<void> | void;
}

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
    commitSha?: string;
    commitUrl?: string;
  } | null>(null);

  // In-app modal state
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    type: "prompt",
    title: "",
    onConfirm: () => {},
  });
  const [modalLoading, setModalLoading] = useState(false);

  const isTypingRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeModal = () => {
    if (modalLoading) return;
    setModalState((prev) => ({ ...prev, isOpen: false }));
  };

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
          text: `Committed & pushed to ${branchInfo?.branch || "GitHub"}`,
          commitSha: res.commitSha,
          commitUrl: res.commitUrl,
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

  // Modal-based File Operations:

  const handleNewFile = (folderPrefix?: string) => {
    const defaultVal = folderPrefix ? `${folderPrefix}/new-note.md` : "notes/new-note.md";
    setModalState({
      isOpen: true,
      type: "prompt",
      title: "Create New Markdown Note",
      description: "Enter a relative repository path ending in .md or .markdown",
      defaultValue: defaultVal,
      inputPlaceholder: "notes/my-note.md",
      confirmText: "Create Note",
      onConfirm: (val) => {
        if (!val) return;
        const clean = val.trim();
        if (!/\.(md|markdown)$/i.test(clean)) {
          setStatusMessage({ type: "error", text: "File path must end with .md or .markdown" });
          return;
        }
        closeModal();
        setCurrentPath(clean);
      },
    });
  };

  const handleRenameFile = (path: string) => {
    setModalState({
      isOpen: true,
      type: "prompt",
      title: "Rename Note",
      description: `Enter the new path or filename for "${path}":`,
      defaultValue: path,
      inputPlaceholder: path,
      confirmText: "Rename & Commit",
      onConfirm: async (newVal) => {
        if (!newVal || newVal.trim() === path) {
          closeModal();
          return;
        }
        const cleanNew = newVal.trim();

        setModalLoading(true);
        // Pass current editor content if user is renaming the currently loaded file
        const contentToSend = currentPath === path ? content : undefined;
        const res = await renameFile(path, cleanNew, contentToSend);
        setModalLoading(false);

        if (res.ok) {
          closeModal();
          setStatusMessage({
            type: "success",
            text: `Renamed to ${cleanNew} and committed to GitHub`,
            commitSha: res.commitSha,
            commitUrl: res.commitUrl,
          });
          if (currentPath === path) {
            setCurrentPath(cleanNew);
            setSavedContent(content);
          }
          void loadTree();
        } else {
          setStatusMessage({ type: "error", text: res.error });
        }
      },
    });
  };

  const handleMoveFile = (path: string) => {
    setModalState({
      isOpen: true,
      type: "prompt",
      title: "Move Note",
      description: `Enter the destination directory or path for "${path}":`,
      defaultValue: path,
      inputPlaceholder: "folder/note.md",
      confirmText: "Move & Commit",
      onConfirm: async (destVal) => {
        if (!destVal || destVal.trim() === path) {
          closeModal();
          return;
        }
        const cleanDest = destVal.trim();

        setModalLoading(true);
        const contentToSend = currentPath === path ? content : undefined;
        const res = await renameFile(path, cleanDest, contentToSend);
        setModalLoading(false);

        if (res.ok) {
          closeModal();
          setStatusMessage({
            type: "success",
            text: `Moved to ${cleanDest} and committed to GitHub`,
            commitSha: res.commitSha,
            commitUrl: res.commitUrl,
          });
          if (currentPath === path) {
            setCurrentPath(cleanDest);
            setSavedContent(content);
          }
          void loadTree();
        } else {
          setStatusMessage({ type: "error", text: res.error });
        }
      },
    });
  };

  const handleCopyFile = (path: string) => {
    const extMatch = path.match(/\.[^.]+$/);
    const ext = extMatch ? extMatch[0] : "";
    const base = ext ? path.slice(0, -ext.length) : path;
    const defaultCopy = `${base}-copy${ext}`;

    setModalState({
      isOpen: true,
      type: "prompt",
      title: "Duplicate Note",
      description: `Enter the path for the duplicate note:`,
      defaultValue: defaultCopy,
      inputPlaceholder: defaultCopy,
      confirmText: "Duplicate & Commit",
      onConfirm: async (destVal) => {
        if (!destVal) return;
        const cleanDest = destVal.trim();

        setModalLoading(true);
        const res = await copyFile(path, cleanDest);
        setModalLoading(false);

        if (res.ok) {
          closeModal();
          setStatusMessage({
            type: "success",
            text: `Duplicated to ${cleanDest} and committed to GitHub`,
            commitSha: res.commitSha,
            commitUrl: res.commitUrl,
          });
          void loadTree();
        } else {
          setStatusMessage({ type: "error", text: res.error });
        }
      },
    });
  };

  const handleDeleteFile = (path: string) => {
    setModalState({
      isOpen: true,
      type: "confirm",
      title: "Delete File from GitHub",
      description: `Are you sure you want to permanently delete "${path}" and commit this change to GitHub?`,
      confirmText: "Delete & Commit",
      isDestructive: true,
      onConfirm: async () => {
        setModalLoading(true);
        const res = await deleteFile(path);
        setModalLoading(false);

        if (res.ok) {
          closeModal();
          setStatusMessage({
            type: "success",
            text: `Deleted ${path} from repository`,
            commitSha: res.commitSha,
            commitUrl: res.commitUrl,
          });
          if (currentPath === path) {
            setCurrentPath("notes/inbox.md");
          }
          void loadTree();
        } else {
          setStatusMessage({ type: "error", text: res.error });
        }
      },
    });
  };


  return (
    <div className="flex h-full w-full flex-1 overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      {/* Action Modal (replaces browser alerts) */}
      <ActionModal
        isOpen={modalState.isOpen}
        type={modalState.type}
        title={modalState.title}
        description={modalState.description}
        defaultValue={modalState.defaultValue}
        inputPlaceholder={modalState.inputPlaceholder}
        confirmText={modalState.confirmText}
        isDestructive={modalState.isDestructive}
        isLoading={modalLoading}
        onConfirm={modalState.onConfirm}
        onCancel={closeModal}
      />

      {/* Status / error / success notifications shown as a modal */}
      <ActionModal
        isOpen={!!statusMessage}
        type="alert"
        title={
          statusMessage?.type === "error"
            ? "Error"
            : statusMessage?.type === "success"
              ? "Success"
              : "Notice"
        }
        description={statusMessage?.text}
        isDestructive={statusMessage?.type === "error"}
        confirmText="OK"
        onConfirm={() => setStatusMessage(null)}
        onCancel={() => setStatusMessage(null)}
      >
        {statusMessage?.commitUrl && statusMessage.commitSha && (
          <a
            href={statusMessage.commitUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded bg-surface-subtle px-2 py-0.5 font-mono text-[11px] underline underline-offset-2 hover:opacity-80"
          >
            commit: {statusMessage.commitSha.slice(0, 7)} ↗
          </a>
        )}
      </ActionModal>

      {/* File Tree Sidebar (collapsible) */}
      {sidebarOpen && (
        <FileTree
          files={treeFiles}
          selectedPath={currentPath}
          onSelectFile={(path) => setCurrentPath(path)}
          onNewFile={handleNewFile}
          onRenameFile={handleRenameFile}
          onMoveFile={handleMoveFile}
          onCopyFile={handleCopyFile}
          onDeleteFile={handleDeleteFile}
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
              aria-label="Check remote sync status"
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-border bg-surface p-1.5 text-xs text-muted hover:text-fg disabled:opacity-50 sm:px-2.5 sm:py-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Check</span>
            </button>

            {/* Refresh button when out of sync */}
            {isOutOfSync && (
              <button
                type="button"
                onClick={() => void loadNote(currentPath)}
                disabled={isBusy}
                title="Refresh note from remote"
                aria-label="Refresh note from remote"
                className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-danger/30 bg-danger-soft p-1.5 text-xs font-medium text-danger hover:opacity-90 disabled:opacity-50 sm:px-2.5 sm:py-1"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            )}

            {/* Save Note Button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isBusy || (!isDirty && sha !== null)}
              title={saving ? "Saving note…" : "Save Note"}
              aria-label={saving ? "Saving note…" : "Save Note"}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-accent p-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3.5 sm:py-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="hidden sm:inline">Saving…</span>
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Save Note</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Editor & Preview Pane */}
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
