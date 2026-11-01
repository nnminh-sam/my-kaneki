"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Code2,
  HelpCircle,
  ListChecks,
  Loader2,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  QuizRow,
  QuizPromptPayload,
  QuizSubmission,
  NodeRow,
  SubjectRow,
  McqPromptPayload,
  OpenEndedPromptPayload,
  CodeChallengePromptPayload,
  ProjectTaskPromptPayload,
} from "@/lib/lms/types";
import { submitQuizAction, type SubmitQuizActionResult } from "@/actions/lms";

interface QuizRunnerProps {
  quiz: QuizRow;
  subject: SubjectRow;
  node: NodeRow | null;
  stepNumber?: number;
  maxSteps?: number;
}

export function QuizRunner({
  quiz,
  subject,
  node,
  stepNumber,
  maxSteps,
}: QuizRunnerProps) {
  const router = useRouter();
  const payload = quiz.prompt_payload as QuizPromptPayload;
  const initialSub = quiz.user_submission as QuizSubmission | null;

  // Submissions state initialized by matching modality
  const [selectedOption, setSelectedOption] = useState<string>(
    initialSub && initialSub.type === "mcq_4" ? initialSub.selectedOption : "",
  );
  const [writtenAnswer, setWrittenAnswer] = useState<string>(
    initialSub && initialSub.type === "open_ended" ? initialSub.response : "",
  );
  const [codeSnippet, setCodeSnippet] = useState<string>(
    initialSub && initialSub.type === "code_challenge"
      ? initialSub.code
      : payload.type === "code_challenge"
      ? payload.starterCode || ""
      : "",
  );
  const [checklist, setChecklist] = useState<number[]>(
    initialSub && initialSub.type === "project_task"
      ? initialSub.completedChecklistIndices
      : [],
  );
  const [prUrl, setPrUrl] = useState<string>(
    initialSub && initialSub.type === "project_task"
      ? initialSub.commitUrl || ""
      : "",
  );

  // Submission / evaluation state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitQuizActionResult | null>(
    quiz.completed_at
      ? {
          ok: true,
          purpose: quiz.quiz_purpose,
          passed: Boolean(quiz.passed),
          score: Number(quiz.score ?? 0),
          feedback: quiz.agent_feedback || undefined,
        }
      : null,
  );

  const isPlacement = quiz.quiz_purpose === "placement";
  const isMasteryGate = quiz.quiz_purpose === "mastery_gate";
  const isSpacedRepetition = quiz.quiz_purpose === "spaced_repetition";

  const handleToggleChecklist = (index: number) => {
    if (result) return;
    setChecklist((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  const isSubmitDisabled = () => {
    if (submitting) return true;
    switch (quiz.quiz_type) {
      case "mcq_4":
        return !selectedOption;
      case "open_ended":
        return !writtenAnswer.trim();
      case "code_challenge":
        return !codeSnippet.trim();
      case "project_task":
        return checklist.length === 0;
      default:
        return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled() || submitting) return;

    setSubmitting(true);
    setError(null);

    let submission: QuizSubmission;
    if (quiz.quiz_type === "mcq_4") {
      submission = {
        type: "mcq_4",
        selectedOption: selectedOption as "A" | "B" | "C" | "D",
      };
    } else if (quiz.quiz_type === "open_ended") {
      submission = {
        type: "open_ended",
        response: writtenAnswer.trim(),
      };
    } else if (quiz.quiz_type === "code_challenge") {
      submission = {
        type: "code_challenge",
        code: codeSnippet.trim(),
      };
    } else {
      submission = {
        type: "project_task",
        completedChecklistIndices: checklist,
        commitUrl: prUrl.trim() || undefined,
      };
    }

    try {
      const res = await submitQuizAction({
        quizId: quiz.id,
        submission,
      });

      if (!res.ok) {
        setError(res.error || "Grading submission failed. Please try again.");
      } else {
        setResult(res);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Network error. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setResult(null);
    setError(null);
  };

  const handleNextPlacementQuestion = (nextId: string) => {
    router.push(`/learning/${subject.slug}/quiz/${nextId}`);
  };

  // Header prompt text derived from discriminated union
  const promptQuestion =
    payload.type === "mcq_4"
      ? payload.question
      : payload.type === "open_ended"
      ? payload.prompt
      : payload.type === "code_challenge"
      ? payload.instruction
      : payload.specification;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
        {/* Header */}
        <div className="border-b border-border pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
                {isPlacement
                  ? "Diagnostic Placement"
                  : isSpacedRepetition
                  ? "Spaced Repetition Review"
                  : `Mastery Gate • Tier ${quiz.difficulty_level}`}
              </span>

              {isPlacement && stepNumber && maxSteps && (
                <span className="text-xs text-muted font-medium">
                  Question {stepNumber} of ≤ {maxSteps}
                </span>
              )}
            </div>

            <div className="text-xs text-muted">
              {isPlacement
                ? `Assessing Tier ${quiz.difficulty_level}`
                : isMasteryGate
                ? "100% required to advance"
                : "SM-2 Interval Refresh"}
            </div>
          </div>

          <h1 className="mt-3 text-lg font-bold text-fg">
            {node
              ? `${String(node.ordinal || 1).padStart(2, "0")}. ${node.title}`
              : isPlacement
              ? `Diagnostic Tier ${quiz.difficulty_level} Check`
              : "Knowledge Check"}
          </h1>
        </div>

        {/* Prompt Question */}
        <div className="py-5">
          <p className="text-sm font-semibold leading-relaxed text-fg">
            {promptQuestion || "Answer the prompt to proceed."}
          </p>

          {/* Constraints (for code challenges) */}
          {payload.type === "code_challenge" &&
            payload.constraints &&
            payload.constraints.length > 0 && (
              <div className="mt-3 rounded-lg bg-surface-subtle p-3 text-xs text-muted">
                <span className="font-semibold text-fg">Constraints:</span>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {payload.constraints.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

          {/* Rubric criteria (for open ended) */}
          {payload.type === "open_ended" &&
            payload.rubricCriteria &&
            payload.rubricCriteria.length > 0 && (
              <div className="mt-3 rounded-lg border border-accent/20 bg-accent-soft/40 p-3 text-xs text-accent">
                <span className="font-semibold">Evaluation Rubric:</span>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {payload.rubricCriteria.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
        </div>

        {/* Form Body Polymorphic by quiz_type */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. MCQ 4 */}
          {payload.type === "mcq_4" && payload.options && (
            <fieldset className="space-y-2.5" disabled={Boolean(result)}>
              <legend className="sr-only">Multiple Choice Options</legend>
              {payload.options.map((opt) => {
                const isSelected = selectedOption === opt.label;
                const isCorrect = (payload as McqPromptPayload).correctOption === opt.label;

                return (
                  <label
                    key={opt.label}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-xs font-medium cursor-pointer transition-colors ${
                      result && isCorrect
                        ? "border-ok bg-ok-soft text-fg"
                        : result && isSelected && !isCorrect
                        ? "border-danger bg-danger-soft text-fg"
                        : isSelected
                        ? "border-accent bg-accent-soft/50 text-fg"
                        : "border-border bg-surface text-fg hover:border-accent/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="mcq-option"
                      value={opt.label}
                      checked={isSelected}
                      onChange={() => setSelectedOption(opt.label)}
                      className="mt-0.5 h-4 w-4 border-border text-accent focus:ring-accent"
                    />
                    <div className="flex-1">
                      <span className="mr-1.5 font-bold">{opt.label}.</span>
                      <span>{opt.text}</span>
                    </div>
                  </label>
                );
              })}
            </fieldset>
          )}

          {/* 2. Open Ended */}
          {payload.type === "open_ended" && (
            <div>
              <label
                htmlFor="open-ended-answer"
                className="mb-1.5 block text-xs font-semibold text-fg"
              >
                Your Detailed Explanation
              </label>
              <textarea
                id="open-ended-answer"
                rows={5}
                disabled={Boolean(result)}
                value={writtenAnswer}
                onChange={(e) => setWrittenAnswer(e.target.value)}
                placeholder="Formulate your response thoroughly with concrete examples and technical trade-offs..."
                className="w-full rounded-xl border border-border bg-bg p-3 text-xs leading-relaxed text-fg placeholder:text-muted focus:border-accent focus:outline-hidden focus:ring-2 focus:ring-accent/20"
              />
            </div>
          )}

          {/* 3. Code Challenge */}
          {payload.type === "code_challenge" && (
            <div>
              <label
                htmlFor="code-challenge-solution"
                className="mb-1.5 flex items-center justify-between text-xs font-semibold text-fg"
              >
                <span>Solution Code</span>
                <span className="text-[11px] font-normal text-muted">
                  Write runnable, idiomatic code
                </span>
              </label>
              <textarea
                id="code-challenge-solution"
                rows={10}
                disabled={Boolean(result)}
                value={codeSnippet}
                onChange={(e) => setCodeSnippet(e.target.value)}
                placeholder="// Enter your solution here"
                className="w-full rounded-xl border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-fg placeholder:text-muted focus:border-accent focus:outline-hidden focus:ring-2 focus:ring-accent/20"
              />
            </div>
          )}

          {/* 4. Project Task */}
          {payload.type === "project_task" && (
            <div className="space-y-4">
              {payload.checklist && payload.checklist.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-fg">
                    Milestone Completion Checklist
                  </span>
                  {payload.checklist.map((item, idx) => {
                    const isChecked = checklist.includes(idx);
                    return (
                      <label
                        key={idx}
                        className={`flex items-start gap-3 rounded-xl border p-3 text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? "border-accent bg-accent-soft/40 text-fg"
                            : "border-border bg-surface text-fg hover:border-accent/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={Boolean(result)}
                          checked={isChecked}
                          onChange={() => handleToggleChecklist(idx)}
                          className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
                        />
                        <span>{item}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div>
                <label
                  htmlFor="pr-url"
                  className="mb-1.5 block text-xs font-semibold text-fg"
                >
                  GitHub PR, Branch, or Commit SHA (Optional)
                </label>
                <input
                  id="pr-url"
                  type="text"
                  disabled={Boolean(result)}
                  value={prUrl}
                  onChange={(e) => setPrUrl(e.target.value)}
                  placeholder="https://github.com/org/repo/pull/1 or sha abc1234"
                  className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-xs text-fg placeholder:text-muted focus:border-accent focus:outline-hidden focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </div>
          )}

          {/* Network / Execution Error */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft p-3.5 text-xs text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div>
                <span className="font-semibold">Grading Error:</span> {error}
              </div>
            </div>
          )}

          {/* Result Banner */}
          {result && (
            <div
              className={`rounded-xl border p-4 text-xs ${
                result.passed
                  ? "border-ok/30 bg-ok-soft text-fg"
                  : "border-danger/30 bg-danger-soft text-fg"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-ok" />
                  ) : (
                    <XCircle className="h-4 w-4 text-danger" />
                  )}
                  <strong className="text-sm">
                    {result.passed ? "Passed!" : "Needs Improvement"}
                  </strong>
                  {result.score != null && (
                    <span className="font-semibold text-muted">
                      (Score: {Math.round(result.score * 100)}%)
                    </span>
                  )}
                </div>

                {!result.passed && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg hover:bg-surface-subtle transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </button>
                )}
              </div>

              {result.feedback && (
                <div className="mt-2.5 leading-relaxed text-muted whitespace-pre-wrap">
                  {result.feedback}
                </div>
              )}

              {/* Placement Specific Next Flow */}
              {isPlacement && result.placementDone && (
                <div className="mt-3 border-t border-border/50 pt-2.5">
                  <p className="font-semibold text-ok">
                    🎯 Placement Diagnostic complete! Your curriculum has been initialized at Tier {result.resolvedLevel ?? 1}.
                  </p>
                  <Link
                    href={`/learning/${subject.slug}`}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90"
                  >
                    View Learning Path
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}

              {isPlacement && !result.placementDone && result.nextQuestionId && (
                <div className="mt-3 border-t border-border/50 pt-2.5">
                  <button
                    type="button"
                    onClick={() => handleNextPlacementQuestion(result.nextQuestionId!)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 cursor-pointer"
                  >
                    Next Diagnostic Question
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Mastery Gate Next Node Notification */}
              {result.passed && result.newlyUnlockedNodeIds && result.newlyUnlockedNodeIds.length > 0 && (
                <div className="mt-3 border-t border-border/50 pt-2.5 text-ok font-medium">
                  🎉 Unlocked next module(s)!
                  <div className="mt-2">
                    <Link
                      href={`/learning/${subject.slug}/module/${result.newlyUnlockedNodeIds[0]}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90"
                    >
                      Continue to Next Module
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submit Button (only when unsubmitted or retrying) */}
          {!result && (
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitDisabled()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 focus:outline-hidden focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-colors"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Evaluating Submission...
                  </>
                ) : (
                  <>
                    Submit Answer
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
