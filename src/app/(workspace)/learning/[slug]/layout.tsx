import { notFound, redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import {
  getSubjectBySlug,
  listSubjects,
  getProfile,
  listNodes,
  getPlacementSession,
  listQuizzesForSubject,
} from "@/lib/lms/repo";
import { getSubjectOverview } from "@/lib/lms/subjects";
import { listEscalations } from "@/lib/lms/research";
import { LearningNav } from "@/components/lms/LearningNav";

interface SubjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function SubjectLayout({
  children,
  params,
}: SubjectLayoutProps) {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  const { slug } = await params;
  const subject = await getSubjectBySlug(owner, slug);
  if (!subject) {
    notFound();
  }

  const [
    subjects,
    profile,
    overview,
    nodes,
    placementSession,
    escalations,
    quizzes,
  ] = await Promise.all([
    listSubjects(owner),
    getProfile(owner),
    getSubjectOverview(owner, slug),
    listNodes(owner, subject.id),
    getPlacementSession(owner, subject.id),
    listEscalations(owner, slug),
    listQuizzesForSubject(owner, subject.id),
  ]);

  // Find first active node (in_progress or unlocked)
  const firstActiveNode =
    nodes.find((n) => n.status === "in_progress") ||
    nodes.find((n) => n.status === "unlocked") ||
    (nodes.length > 0 ? nodes[0] : null);

  // Find active gate or placement quiz if any
  const pendingGateQuiz = quizzes.find(
    (q) =>
      q.quiz_purpose === "mastery_gate" &&
      !q.completed_at &&
      nodes.some((n) => n.id === q.node_id && n.status !== "locked"),
  );
  const pendingPlacementQuiz = quizzes.find(
    (q) => q.quiz_purpose === "placement" && !q.completed_at,
  );
  const activeQuizId = pendingGateQuiz?.id || pendingPlacementQuiz?.id || null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <LearningNav
        subjects={subjects}
        currentSubject={subject}
        profile={profile}
        overview={overview}
        firstActiveNode={firstActiveNode}
        placementSession={placementSession}
        dueReviewsCount={overview.srs.dueReviewsCount}
        escalationCount={escalations.length}
        activeQuizId={activeQuizId}
      />

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">{children}</div>
    </div>
  );
}
