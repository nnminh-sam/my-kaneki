"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FileBox,
  FileCode,
  FileSpreadsheet,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { SourceRow, SubjectRow } from "@/lib/lms/types";
import { deleteSourceAction } from "@/actions/lms";
import { ModelSwitcher } from "@/components/ai/ModelSwitcher";

interface ByosHubViewProps {
  subject: SubjectRow;
  sources: SourceRow[];
  chunkCounts: Record<string, number>;
}

interface UploadingFile {
  id: string;
  name: string;
  progress: number;
  error?: string;
}

function SourceTypeIcon({ type }: { type: SourceRow["source_type"] }) {
  switch (type) {
    case "pdf":
    case "docx":
      return <FileText className="h-4 w-4 text-accent" />;
    case "xlsx":
    case "csv":
      return <FileSpreadsheet className="h-4 w-4 text-ok" />;
    case "markdown":
    default:
      return <FileCode className="h-4 w-4 text-muted" />;
  }
}

export function ByosHubView({
  subject,
  sources,
  chunkCounts,
}: ByosHubViewProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeEmbedding, setActiveEmbedding] = useState<{
    provider: string;
    model: string;
  } | null>(null);

  const byosSources = sources.filter((s) => s.track === "byos");

  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    for (const file of files) {
      const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      setUploadingFiles((prev) => [
        ...prev,
        { id: uploadId, name: file.name, progress: 20 },
      ]);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("subject", subject.slug);
      formData.append("perspective", "reference");
      if (activeEmbedding?.provider) {
        formData.append("embeddingProvider", activeEmbedding.provider);
      }
      if (activeEmbedding?.model) {
        formData.append("embeddingModel", activeEmbedding.model);
      }

      try {
        setUploadingFiles((prev) =>
          prev.map((f) => (f.id === uploadId ? { ...f, progress: 60 } : f)),
        );

        const res = await fetch("/api/lms/sources", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === uploadId
                ? { ...f, error: data.error || "Upload failed." }
                : f,
            ),
          );
        } else {
          setUploadingFiles((prev) => prev.filter((f) => f.id !== uploadId));
          router.refresh();
        }
      } catch (err) {
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === uploadId
              ? {
                  ...f,
                  error:
                    err instanceof Error ? err.message : "Network upload error.",
                }
              : f,
          ),
        );
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      void handleUploadFiles(e.dataTransfer.files);
    }
  };

  const handleDelete = async (sourceId: string) => {
    if (!confirm("Are you sure you want to remove this source and its RAG vectors?")) {
      return;
    }
    setDeletingId(sourceId);
    try {
      await deleteSourceAction(sourceId);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove source");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-fg">
            Track 1: Bring Your Own Sources (BYOS)
          </h1>
          <p className="text-xs text-muted">
            Upload PDF, DOCX, XLSX, CSV, or Markdown notes. Kaneki normalizes tables and chunks content into pgvector.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Embedding Model:</span>
          <ModelSwitcher
            mode="embedding"
            direction="down"
            onChange={(sel) => setActiveEmbedding(sel)}
          />
        </div>
      </div>

      {/* Native Drag & Drop Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
          isDragging
            ? "border-accent bg-accent-soft/40"
            : "border-border hover:border-accent/40 bg-surface"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx,.xls,.csv,.md,.markdown,.txt"
          onChange={(e) => {
            if (e.target.files) void handleUploadFiles(e.target.files);
          }}
          className="hidden"
        />

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-subtle text-muted shadow-xs">
          <UploadCloud className="h-6 w-6 text-accent" />
        </div>

        <h3 className="mt-3 text-sm font-semibold text-fg">
          Drag and drop study files here, or browse
        </h3>
        <p className="mt-1 text-xs text-muted">
          Supports .pdf, .docx, .xlsx, .csv, and .md (up to 50MB)
        </p>
      </div>

      {/* Uploading progress list */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-xs"
            >
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                <span className="font-medium text-fg">{f.name}</span>
                {f.error ? (
                  <span className="text-danger">({f.error})</span>
                ) : (
                  <span className="text-muted">Uploading & Indexing...</span>
                )}
              </div>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-subtle">
                <div
                  className={`h-full ${f.error ? "bg-danger" : "bg-accent"} transition-all`}
                  style={{ width: `${f.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ingested Sources Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="flex items-center justify-between border-b border-border bg-surface-subtle px-4 py-3">
          <span className="text-xs font-semibold text-fg">
            Ingested User Sources
          </span>
          <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted">
            {byosSources.length} Document{byosSources.length !== 1 ? "s" : ""}
          </span>
        </div>

        {byosSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileBox className="h-10 w-10 text-muted" />
            <h3 className="mt-3 text-sm font-semibold text-fg">
              No sources uploaded yet
            </h3>
            <p className="mt-1 max-w-sm text-xs text-muted">
              Add your course slides, textbooks, or notes above to anchor your adaptive curriculum in your own materials.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface-subtle/50 text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Filename</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Knowledge Path</th>
                  <th className="px-4 py-3 font-semibold">pgvector Chunks</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byosSources.map((s) => {
                  const chunks = chunkCounts[s.id] ?? 0;
                  const isDeleting = deletingId === s.id;

                  return (
                    <tr key={s.id} className="hover:bg-surface-subtle/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <SourceTypeIcon type={s.source_type} />
                          <span className="font-semibold text-fg">
                            {s.title || s.original_uri}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-muted uppercase">
                        {s.source_type}
                      </td>

                      <td className="px-4 py-3.5">
                        <code className="text-[11px] font-mono text-muted">
                          {s.github_md_path || "—"}
                        </code>
                      </td>

                      <td className="px-4 py-3.5 text-muted whitespace-nowrap">
                        {chunks} Chunk{chunks !== 1 ? "s" : ""}
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok border border-ok/20">
                          <CheckCircle2 className="h-3 w-3" />
                          Ready
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleDelete(s.id)}
                          className="inline-flex items-center gap-1 rounded-lg p-1.5 text-muted hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer"
                          title="Remove source"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
