import { notFound, redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import {
  getSubjectBySlug,
  getNodeById,
  getPlacementSession,
} from "@/lib/lms/repo";
import { getSafeQuiz } from "@/lib/lms/quiz.service";
import { QuizRunner } from "@/components/lms/QuizRunner";

interface QuizPageProps {
  params: Promise<{ slug: string; quizId: string }>;
}

export default async function QuizPage({ params }: QuizPageProps) {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  const { slug, quizId } = await params;
  const subject = await getSubjectBySlug(owner, slug);
  if (!subject) {
    notFound();
  }

  const quiz = await getSafeQuiz(owner, quizId);
  if (!quiz || quiz.subject_id !== subject.id) {
    notFound();
  }

  const node = quiz.node_id ? await getNodeById(owner, quiz.node_id) : null;

  let stepNumber: number | undefined;
  let maxSteps: number | undefined;

  if (quiz.quiz_purpose === "placement") {
    const placementSession = await getPlacementSession(owner, subject.id);
    const historyCount = placementSession?.history?.length ?? 0;
    stepNumber = historyCount + 1;
    maxSteps = Math.ceil(Math.log2(Math.max(subject.difficulty_scale_n, 2)));
  }

  return (
    <div className="py-4">
      <QuizRunner
        quiz={quiz}
        subject={subject}
        node={node}
        stepNumber={stepNumber}
        maxSteps={maxSteps}
      />
    </div>
  );
}
