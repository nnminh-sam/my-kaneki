"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, ChevronDown, ChevronRight, Lightbulb, User } from "lucide-react";
import { ToolCallCard } from "./ToolCallCard";

interface ChatMessageProps {
  message: UIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div
      className={`flex w-full gap-3 px-4 py-3 transition-colors ${
        isUser ? "bg-transparent justify-end" : "bg-surface/50 border-y border-border/40"
      }`}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-xs">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className={`flex flex-col gap-2 max-w-[85%] ${isUser ? "items-end" : "items-start flex-1"}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-fg">
            {isUser ? "You" : "Kaneki Agent"}
          </span>
        </div>

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
                    remarkPlugins={[remarkGfm]}
                    components={{
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
                    }}
                  >
                    {part.text}
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
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-fg border border-border shadow-xs">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
