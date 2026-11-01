import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { currentOwnerId } from "@/lib/owner";
import {
  getSubjectBySlug,
  listQuizzesForSubject,
  listNodes,
} from "@/lib/lms/repo";
import { CheckCircle2, HelpCircle } from "lucide-react";

interface QuizRedirectPageProps {
  params: Promise<{ slug: string }>;
}

export default async function QuizRedirectPage({
  params,
}: QuizRedirectPageProps) {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  const { slug } = await params;
  const subject = await getSubjectBySlug(owner, slug);
  if (!subject) {
    notFound();
  }

  const [quizzes, nodes] = await Promise.all([
    listQuizzesForSubject(owner, subject.id),
    listNodes(owner, subject.id),
  ]);

  // 1. Check for pending placement quiz
  const pendingPlacementQuiz = quizzes.find(
    (q) => q.quiz_purpose === "placement" && !q.completed_at,
  );
  if (pendingPlacementQuiz) {
    redirect(`/learning/${slug}/quiz/${pendingPlacementQuiz.id}`);
  }

  // 2. Check for pending mastery gate quiz on an unlocked/in_progress node
  const pendingGateQuiz = quizzes.find(
    (q) =>
      q.quiz_purpose === "mastery_gate" &&
      !q.completed_at &&
      nodes.some((n) => n.id === q.node_id && n.status !== "locked"),
  );
  if (pendingGateQuiz) {
    redirect(`/learning/${slug}/quiz/${pendingGateQuiz.id}`);
  }

  // 3. Fallback: show list of quizzes or empty state
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-fg">
          Mastery Gates & Diagnostic Quizzes
        </h1>
        <p className="text-xs text-muted">
          All quizzes registered for subject &quot;{subject.title}&quot;.
        </p>
      </div>

      {quizzes.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center shadow-xs">
          <HelpCircle className="mx-auto h-10 w-10 text-muted" />
          <h2 className="mt-3 text-sm font-semibold text-fg">
            No quizzes generated yet
          </h2>
          <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
            Your agent generates Mastery Gates automatically as you complete study guides, or you can take the diagnostic placement test.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs">
          <div className="divide-y divide-border">
            {quizzes.map((quiz) => {
              const node = quiz.node_id ? nodeMap.get(quiz.node_id) : null;
              return (
                <div
                  key={quiz.id}
                  className="flex items-center justify-between p-4 hover:bg-surface-subtle/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-fg">
                        {node
                          ? `Node ${node.ordinal}: ${node.title}`
                          : quiz.quiz_purpose === "placement"
                          ? `Diagnostic Check (Tier ${quiz.difficulty_level})`
                          : "Quiz"}
                      </span>
                      <span className="rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[10px] uppercase font-mono text-muted">
                        {quiz.quiz_type}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                      <span className="capitalize">{quiz.quiz_purpose.replace(/_/g, " ")}</span>
                      <span>•</span>
                      <span>Tier {quiz.difficulty_level}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {quiz.completed_at ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                          quiz.passed
                            ? "bg-ok-soft text-ok border border-ok/20"
                            : "bg-danger-soft text-danger border border-danger/20"
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {quiz.passed ? "Passed" : "Retake Available"}
                      </span>
                    ) : null}

                    <Link
                      href={`/learning/${slug}/quiz/${quiz.id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 transition-colors"
                    >
                      {quiz.completed_at ? "Review" : "Take Quiz"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
