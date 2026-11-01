import { notFound, redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import {
  getSubjectBySlug,
  getNodeById,
  listNodes,
  getPendingQuizForNode,
} from "@/lib/lms/repo";
import { getKnowledgeFile } from "@/lib/lms/github-knowledge";
import { getChatSession } from "@/lib/chat-db";
import { ModuleReader } from "@/components/lms/ModuleReader";
import { TutorSidekick } from "@/components/lms/TutorSidekick";
import type { ChatSession } from "@/lib/chat-sessions";

interface ModulePageProps {
  params: Promise<{ slug: string; nodeId: string }>;
}

export default async function ModulePage({ params }: ModulePageProps) {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  const { slug, nodeId } = await params;
  const subject = await getSubjectBySlug(owner, slug);
  if (!subject) {
    notFound();
  }

  const node = await getNodeById(owner, nodeId);
  if (!node || node.subject_id !== subject.id) {
    notFound();
  }

  // Fetch all nodes to determine next unlocked node
  const allNodes = await listNodes(owner, subject.id);
  const nextUnlockedNode = allNodes.find(
    (n) =>
      (n.status === "unlocked" || n.status === "in_progress") &&
      n.id !== node.id &&
      (n.ordinal || 0) >= (node.ordinal || 0),
  );

  // Fetch pending mastery gate quiz if exists
  const gateQuiz = await getPendingQuizForNode(owner, node.id, "mastery_gate");

  // Load study guide markdown from GitHub
  let markdownContent: string | null = null;
  let loadError: string | null = null;

  if (node.github_md_path && node.github_md_path.trim()) {
    const fileRes = await getKnowledgeFile(node.github_md_path);
    if (fileRes.ok) {
      markdownContent = fileRes.text;
    } else {
      loadError = `Could not load ${node.github_md_path}: ${fileRes.error}`;
    }
  } else {
    loadError = "Study guide not yet committed to GitHub by agent.";
  }

  // Load or initialize scoped chat session for Tutor sidekick
  const sessionId = `lms_${subject.slug}_${node.id}`;
  const existingSession = await getChatSession(owner, sessionId);

  const initialSession: ChatSession = existingSession || {
    id: sessionId,
    title: `Tutor: ${subject.title} - ${node.title}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: `welcome_${Date.now()}`,
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `Hello! I'm your dedicated Socratic Tutor for **${node.title}**. What would you like to explore, or would you like a foundational analogy?`,
          },
        ],
      },
    ],
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full min-h-[750px]">
      {/* Left Column: Module Study Guide Reader */}
      <div className="flex-1 min-w-0">
        <ModuleReader
          node={node}
          subject={subject}
          markdownContent={markdownContent}
          loadError={loadError}
          gateQuizId={gateQuiz?.id}
          nextUnlockedNodeId={nextUnlockedNode?.id}
        />
      </div>

      {/* Right Column: Socratic Tutor Sidekick (collapses stacked on mobile) */}
      <div className="w-full lg:w-[420px] shrink-0 h-[600px] lg:h-full">
        <TutorSidekick
          subject={subject}
          node={node}
          initialSession={initialSession}
        />
      </div>
    </div>
  );
}
