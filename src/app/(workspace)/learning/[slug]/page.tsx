import { notFound, redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import {
  getSubjectBySlug,
  listNodes,
  listNodeEdges,
  getPlacementSession,
  listQuizzesForSubject,
} from "@/lib/lms/repo";
import { PlacementBanner } from "@/components/lms/PlacementBanner";
import { LearningPathDagView } from "@/components/lms/LearningPathDagView";
import { CapstoneBanner } from "@/components/lms/CapstoneBanner";
import { GitFork, Sparkles } from "lucide-react";
import Link from "next/link";
import type { NodeRow } from "@/lib/lms/types";

interface LearningPathPageProps {
  params: Promise<{ slug: string }>;
}

export default async function LearningPathPage({
  params,
}: LearningPathPageProps) {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  const { slug } = await params;
  const subject = await getSubjectBySlug(owner, slug);
  if (!subject) {
    notFound();
  }

  const [nodes, edges, placementSession, quizzes] = await Promise.all([
    listNodes(owner, subject.id),
    listNodeEdges(owner, subject.id),
    getPlacementSession(owner, subject.id),
    listQuizzesForSubject(owner, subject.id),
  ]);

  const allNodesMap = new Map<string, NodeRow>(nodes.map((n) => [n.id, n]));

  // Find first active node (in_progress or unlocked)
  const firstActiveNode =
    nodes.find((n) => n.status === "in_progress") ||
    nodes.find((n) => n.status === "unlocked") ||
    (nodes.length > 0 ? nodes[0] : null);

  // Find active placement quiz if in placement
  const activePlacementQuiz = quizzes.find(
    (q) => q.quiz_purpose === "placement" && !q.completed_at,
  );

  // Find pending mastery gate quiz
  const activeGateQuiz = quizzes.find(
    (q) =>
      q.quiz_purpose === "mastery_gate" &&
      !q.completed_at &&
      nodes.some((n) => n.id === q.node_id && n.status !== "locked"),
  );

  // Group nodes by difficulty_level
  const tierMap = new Map<number, NodeRow[]>();
  for (const node of nodes) {
    const list = tierMap.get(node.difficulty_level) ?? [];
    list.push(node);
    tierMap.set(node.difficulty_level, list);
  }

  // Sort tiers ascending
  const sortedTiers = Array.from(tierMap.keys()).sort((a, b) => a - b);
  // Sort nodes within tiers by ordinal
  for (const tier of sortedTiers) {
    tierMap.get(tier)?.sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Placement Status Banner */}
      <PlacementBanner
        subject={subject}
        placementSession={placementSession}
        firstActiveNode={firstActiveNode}
        activePlacementQuizId={activePlacementQuiz?.id}
      />

      {/* Nodes by Tiers / Mermaid DAG */}
      {nodes.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center shadow-xs">
          <GitFork className="mx-auto h-10 w-10 text-muted" />
          <h2 className="mt-3 text-sm font-semibold text-fg">
            Learning Path being drafted
          </h2>
          <p className="mt-1 text-xs text-muted max-w-md mx-auto">
            Your agent is currently analyzing ingested sources and constructing your personalized dependency DAG.
          </p>
          <div className="mt-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Ask Agent to Draft Path
            </Link>
          </div>
        </div>
      ) : (
        <LearningPathDagView
          nodes={nodes}
          edges={edges}
          subjectSlug={subject.slug}
          sortedTiers={sortedTiers}
          tierMap={tierMap}
          allNodesMap={allNodesMap}
        />
      )}

      {/* Capstone Project Banner */}
      <CapstoneBanner
        capstoneProject={subject.capstone_project}
        subjectSlug={subject.slug}
        nodes={nodes}
        activeQuizId={activeGateQuiz?.id}
      />
    </div>
  );
}
