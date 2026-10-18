"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode,
  FileEdit,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreVertical,
  Move,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { TreeFileItem } from "@/actions/github";

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children?: TreeNode[];
}

function buildTree(files: TreeFileItem[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let currentLevel = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      let existing = currentLevel.find((node) => node.name === part);

      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          isFolder: !isFile,
          children: isFile ? undefined : [],
        };
        currentLevel.push(existing);
      }

      if (!isFile && existing.children) {
        currentLevel = existing.children;
      }
    }
  }

  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    return nodes
      .sort((a, b) => {
        if (a.isFolder === b.isFolder) {
          return a.name.localeCompare(b.name);
        }
        return a.isFolder ? -1 : 1;
      })
      .map((node) => {
        if (node.children) {
          node.children = sortNodes(node.children);
        }
        return node;
      });
  }

  return sortNodes(root);
}

interface FileTreeProps {
  files: TreeFileItem[];
  selectedPath: string;
  onSelectFile: (path: string) => void;
  onNewFile: (folderPrefix?: string) => void;
  onRenameFile: (path: string) => void;
  onMoveFile: (path: string) => void;
  onCopyFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  branchName?: string;
}

export function FileTree({
  files,
  selectedPath,
  onSelectFile,
  onNewFile,
  onRenameFile,
  onMoveFile,
  onCopyFile,
  onDeleteFile,
  onRefresh,
  isLoading,
  branchName,
}: FileTreeProps) {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    "": true,
  });
  const [activeMenuPath, setActiveMenuPath] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(files), [files]);

  const toggleFolder = (folderPath: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folderPath]: prev[folderPath] === undefined ? false : !prev[folderPath],
    }));
  };

  const isFolderOpen = (folderPath: string) => {
    return openFolders[folderPath] !== false;
  };

  const renderNode = (node: TreeNode, depth = 0) => {
    const isSelected = node.path === selectedPath;
    const isMarkdown = /\.(md|markdown)$/i.test(node.name);
    const isMenuOpen = activeMenuPath === node.path;

    if (node.isFolder) {
      const open = isFolderOpen(node.path);
      return (
        <div key={node.path}>
          <div className="group relative flex items-center justify-between rounded hover:bg-surface">
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              style={{ paddingLeft: `${depth * 12 + 6}px` }}
              className="flex flex-1 items-center gap-1.5 py-1 pr-2 text-xs font-medium text-muted hover:text-fg text-left"
            >
              {open ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
              {open ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-accent" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-accent" />
              )}
              <span className="truncate">{node.name}</span>
            </button>

            {/* Quick action: new file in this folder */}
            <button
              type="button"
              onClick={() => onNewFile(node.path)}
              title={`New file in ${node.path}`}
              className="hidden p-1 text-muted hover:text-fg group-hover:block mr-1 rounded"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
          </div>

          {open && node.children && (
            <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        className={`group relative flex items-center justify-between rounded transition-colors ${
          isSelected
            ? "bg-accent-soft font-medium text-accent"
            : "text-muted hover:bg-surface hover:text-fg"
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectFile(node.path)}
          style={{ paddingLeft: `${depth * 12 + 20}px` }}
          className="flex flex-1 items-center gap-1.5 py-1 pr-1 text-xs text-left truncate"
        >
          {isMarkdown ? (
            <FileText className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-accent" : "text-muted"}`} />
          ) : (
            <FileCode className="h-3.5 w-3.5 shrink-0 text-muted/60" />
          )}
          <span className="truncate">{node.name}</span>
        </button>

        {/* Action dropdown toggle button */}
        <div className="relative mr-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenuPath(isMenuOpen ? null : node.path);
            }}
            title="File options"
            className={`rounded p-1 text-muted hover:bg-surface-subtle hover:text-fg ${
              isMenuOpen ? "block" : "hidden group-hover:block"
            }`}
          >
            <MoreVertical className="h-3 w-3" />
          </button>


            {/* Context menu popup */}
            {isMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenuPath(null);
                  }}
                />
                <div
                  className="absolute right-0 top-6 z-50 w-36 rounded-md border border-border bg-surface p-1 shadow-md text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuPath(null);
                      onRenameFile(node.path);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-fg hover:bg-surface-subtle"
                  >
                    <FileEdit className="h-3 w-3 text-muted" />
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuPath(null);
                      onMoveFile(node.path);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-fg hover:bg-surface-subtle"
                  >
                    <Move className="h-3 w-3 text-muted" />
                    Move
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuPath(null);
                      onCopyFile(node.path);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-fg hover:bg-surface-subtle"
                  >
                    <Copy className="h-3 w-3 text-muted" />
                    Duplicate
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuPath(null);
                      onDeleteFile(node.path);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-danger hover:bg-danger-soft"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
      </div>
    );


  };

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface-subtle/50 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex flex-col">
          <span className="font-semibold text-fg">Files</span>
          {branchName && (
            <span className="font-mono text-[10px] text-muted">HEAD: {branchName}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNewFile()}
            title="Create new note"
            className="rounded p-1 text-muted hover:bg-surface hover:text-fg"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh files"
            disabled={isLoading}
            className="rounded p-1 text-muted hover:bg-surface hover:text-fg disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tree list */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {isLoading && files.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted">Loading tree…</div>
        ) : files.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted">No files found.</div>
        ) : (
          tree.map((node) => renderNode(node))
        )}
      </div>
    </div>
  );
}
