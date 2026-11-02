"use client";

import React, { memo, useState } from "react";
import type { UIMessage } from "ai";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { PluggableList } from "unified";
import { Check, ChevronDown, ChevronRight, Copy, Lightbulb } from "lucide-react";
import { ToolCallCard } from "./ToolCallCard";
import { normalizeLatexMath } from "@/lib/math";

export interface ChatMessageActionProps {
  message: UIMessage;
  isUser: boolean;
  text: string;
}

export interface ChatMessageProps {
  message: UIMessage;
  actions?:
    | React.ReactNode
    | ((props: ChatMessageActionProps) => React.ReactNode);
}

const REMARK_PLUGINS: PluggableList = [remarkGfm, remarkMath];
const REHYPE_PLUGINS: PluggableList = [[rehypeKatex, { throwOnError: false }]];

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-lg font-bold text-fg first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-base font-bold text-fg first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-sm font-semibold text-fg first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-3 text-sm font-semibold text-fg first:mt-0">{children}</h4>
  ),
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  hr: () => <hr className="my-4 border-t border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2.5 border-l-2 border-accent/40 pl-3 text-muted">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="my-3 w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-subtle">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-border last:border-b-0">{children}</tr>,
  th: ({ children }) => (
    <th className="whitespace-nowrap px-3 py-2 font-semibold text-fg">{children}</th>
  ),
  td: ({ children }) => <td className="px-3 py-2 align-top text-fg">{children}</td>,
  p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-2.5 list-disc pl-5 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2.5 list-decimal pl-5 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  code: ({ className, children, ...props }) => {
    const isInline = !className && typeof children === "string" && !children.includes("\n");
    if (isInline) {
      return (
        <code
          className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-xs text-accent"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <div className="my-2.5 overflow-x-auto rounded-md border border-border bg-surface-subtle p-3">
        <code className="font-mono text-xs text-fg leading-relaxed" {...props}>
          {children}
        </code>
      </div>
    );
  },
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-accent underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
};

function getMessageText(message: UIMessage): string {
  if (Array.isArray(message.parts)) {
    const textParts = message.parts
      .filter(
        (p): p is { type: "text"; text: string } =>
          p.type === "text" && typeof p.text === "string",
      )
      .map((p) => p.text)
      .filter((t) => t.trim().length > 0);
    if (textParts.length > 0) {
      return textParts.join("\n\n");
    }
  }
  const content = (message as unknown as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }
  return "";
}

function ChatMessageComponent({ message, actions }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [showReasoning, setShowReasoning] = useState(false);
  const [copied, setCopied] = useState(false);

  const messageText = getMessageText(message);
  const hasText = messageText.trim().length > 0;
  const hasActions = hasText || !!actions;

  const handleCopy = async () => {
    if (!hasText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(messageText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = messageText;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy message:", err);
    }
  };

  return (
    <div
      className={`group/msg flex w-full gap-3 px-4 py-3 transition-colors ${
        isUser
          ? "bg-transparent justify-end"
          : "bg-surface/50 border-y border-border/40"
      }`}
    >
      <div
        className={`flex flex-col gap-1.5 max-w-[85%] ${
          isUser ? "items-end" : "items-start flex-1"
        }`}
      >
        <div
          className={`text-sm leading-relaxed ${
            isUser
              ? "rounded-2xl rounded-tr-xs bg-accent text-white px-4 py-2.5 shadow-xs"
              : "w-full text-fg"
          }`}
        >
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              if (isUser) {
                return (
                  <p key={index} className="whitespace-pre-wrap">
                    {part.text}
                  </p>
                );
              }
              return (
                <div key={index} className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed">
                  <ReactMarkdown
                    remarkPlugins={REMARK_PLUGINS}
                    rehypePlugins={REHYPE_PLUGINS}
                    components={MARKDOWN_COMPONENTS}
                  >
                    {normalizeLatexMath(part.text)}
                  </ReactMarkdown>
                </div>
              );
            }

            if (part.type === "reasoning") {
              return (
                <div key={index} className="my-2 rounded-md border border-border bg-surface-subtle/40 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowReasoning(!showReasoning)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left font-medium text-muted hover:text-fg"
                  >
                    <span className="flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5 text-warn" />
                      <span>Thinking Process</span>
                    </span>
                    {showReasoning ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  {showReasoning && (
                    <div className="border-t border-border/50 px-3 py-2 text-muted whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                      {part.text}
                    </div>
                  )}
                </div>
              );
            }

            // Tool parts
            if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
              const toolName =
                part.type === "dynamic-tool"
                  ? (part as unknown as { toolName: string }).toolName
                  : part.type.replace(/^tool-/, "");

              const toolPart = part as unknown as {
                state?: string;
                input?: Record<string, unknown>;
                output?: Record<string, unknown>;
                errorText?: string;
              };

              return (
                <ToolCallCard
                  key={index}
                  toolName={toolName}
                  state={toolPart.state}
                  input={toolPart.input}
                  output={toolPart.output}
                  errorText={toolPart.errorText}
                />
              );
            }

            return null;
          })}
        </div>

        {/* Function button section below message */}
        {hasActions && (
          <div
            className={`flex items-center gap-1 text-xs transition-opacity ${
              isUser ? "justify-end" : "justify-start"
            } ${
              copied
                ? "opacity-100"
                : "opacity-100 md:opacity-0 md:group-hover/msg:opacity-100 md:focus-within:opacity-100"
            }`}
          >
            {hasText && (
              <button
                type="button"
                onClick={handleCopy}
                title={copied ? "Copied message!" : "Copy message"}
                aria-label="Copy message"
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors cursor-pointer ${
                  copied
                    ? "text-ok bg-ok-soft"
                    : "text-muted hover:text-fg hover:bg-surface-subtle"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-ok" />
                    <span className="text-[11px] font-medium text-ok">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="sr-only">Copy message</span>
                  </>
                )}
              </button>
            )}

            {typeof actions === "function"
              ? actions({ message, isUser, text: messageText })
              : actions}
          </div>
        )}
      </div>
    </div>
  );
}

function areMessagePropsEqual(
  prevProps: ChatMessageProps,
  nextProps: ChatMessageProps,
): boolean {
  if (prevProps.actions !== nextProps.actions) return false;
  if (prevProps.message === nextProps.message) return true;
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.role !== nextProps.message.role) return false;

  const prevParts = prevProps.message.parts;
  const nextParts = nextProps.message.parts;

  if (prevParts === nextParts) return true;
  if (!prevParts || !nextParts) return false;
  if (prevParts.length !== nextParts.length) return false;

  for (let i = 0; i < prevParts.length; i++) {
    const p1 = prevParts[i];
    const p2 = nextParts[i];
    if (p1 === p2) continue;
    if (p1.type !== p2.type) return false;

    if (p1.type === "text") {
      if ((p1 as { text: string }).text !== (p2 as { text: string }).text) {
        return false;
      }
    } else if (p1.type === "reasoning") {
      if ((p1 as { text: string }).text !== (p2 as { text: string }).text) {
        return false;
      }
    } else {
      if (JSON.stringify(p1) !== JSON.stringify(p2)) {
        return false;
      }
    }
  }

  return true;
}

export const ChatMessage = memo(ChatMessageComponent, areMessagePropsEqual);

