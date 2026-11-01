import { notFound, redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import {
  getSubjectBySlug,
  listSources,
  getSourceChunkCounts,
} from "@/lib/lms/repo";
import { ByosHubView } from "@/components/lms/ByosHubView";

interface SourcesPageProps {
  params: Promise<{ slug: string }>;
}

export default async function SourcesPage({ params }: SourcesPageProps) {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  const { slug } = await params;
  const subject = await getSubjectBySlug(owner, slug);
  if (!subject) {
    notFound();
  }

  const [sources, chunkCounts] = await Promise.all([
    listSources(owner, subject.id),
    getSourceChunkCounts(owner, subject.id),
  ]);

  return (
    <ByosHubView
      subject={subject}
      sources={sources}
      chunkCounts={chunkCounts}
    />
  );
}
