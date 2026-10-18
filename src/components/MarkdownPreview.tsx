"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  if (!content.trim()) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted">
        Nothing to preview. Start writing Markdown in Edit mode.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto rounded-md border border-border bg-surface p-6">
      <div className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="mb-4 mt-6 border-b border-border pb-2 text-2xl font-bold tracking-tight text-fg first:mt-0">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mb-3 mt-5 border-b border-border pb-1 text-xl font-semibold text-fg">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mb-2 mt-4 text-lg font-semibold text-fg">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="mb-2 mt-3 text-base font-semibold text-fg">
                {children}
              </h4>
            ),
            p: ({ children }) => (
              <p className="mb-4 leading-relaxed text-fg">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="mb-4 list-disc pl-6 space-y-1 text-fg">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-4 list-decimal pl-6 space-y-1 text-fg">{children}</ol>
            ),
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="my-4 border-l-4 border-accent pl-4 italic text-muted">
                {children}
              </blockquote>
            ),
            code: ({ className, children, ...props }) => {
              const isInline = !className && typeof children === "string" && !children.includes("\n");
              if (isInline) {
                return (
                  <code
                    className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-xs font-medium text-accent"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <div className="my-4 overflow-x-auto rounded-md border border-border bg-surface-subtle p-3">
                  <code className="font-mono text-xs leading-relaxed text-fg" {...props}>
                    {children}
                  </code>
                </div>
              );
            },
            pre: ({ children }) => <pre className="my-0 p-0 bg-transparent">{children}</pre>,
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
            table: ({ children }) => (
              <div className="my-4 w-full overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border border-border bg-surface-subtle px-3 py-2 font-semibold text-fg">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-border px-3 py-2 text-fg">{children}</td>
            ),
            hr: () => <hr className="my-6 border-border" />,
            input: ({ type, checked, ...props }) => {
              if (type === "checkbox") {
                return (
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="mr-2 inline-block rounded border-border"
                    {...props}
                  />
                );
              }
              return <input type={type} {...props} />;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
