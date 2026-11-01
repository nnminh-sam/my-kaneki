import { notFound, redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import { getSubjectBySlug, listNodes, listNodeEdges } from "@/lib/lms/repo";
import { PresentationGraphView } from "@/components/lms/PresentationGraphView";

interface PresentationGraphPageProps {
  params: Promise<{ slug: string }>;
}

export default async function PresentationGraphPage({
  params,
}: PresentationGraphPageProps) {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  const { slug } = await params;
  const subject = await getSubjectBySlug(owner, slug);
  if (!subject) {
    notFound();
  }

  const [nodes, edges] = await Promise.all([
    listNodes(owner, subject.id),
    listNodeEdges(owner, subject.id),
  ]);

  return (
    <PresentationGraphView
      subject={subject}
      nodes={nodes}
      edges={edges}
    />
  );
}
