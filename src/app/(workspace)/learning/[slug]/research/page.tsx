import { notFound, redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import { getSubjectBySlug, listSources } from "@/lib/lms/repo";
import { ResearchDebateView } from "@/components/lms/ResearchDebateView";

interface ResearchPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ResearchPage({ params }: ResearchPageProps) {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  const { slug } = await params;
  const subject = await getSubjectBySlug(owner, slug);
  if (!subject) {
    notFound();
  }

  const sources = await listSources(owner, subject.id);

  return <ResearchDebateView subject={subject} sources={sources} />;
}
