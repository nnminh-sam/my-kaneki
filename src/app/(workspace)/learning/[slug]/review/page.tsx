import { notFound, redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import { getSubjectBySlug, getSubjectReviewStats } from "@/lib/lms/repo";
import { getDueReviews } from "@/lib/lms/review.service";
import { getSubjectOverview } from "@/lib/lms/subjects";
import { SrsQueueView } from "@/components/lms/SrsQueueView";

interface ReviewPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  const { slug } = await params;
  const subject = await getSubjectBySlug(owner, slug);
  if (!subject) {
    notFound();
  }

  const [dueReviews, reviewStats, overview] = await Promise.all([
    getDueReviews(owner, slug),
    getSubjectReviewStats(owner, subject.id),
    getSubjectOverview(owner, slug),
  ]);

  return (
    <SrsQueueView
      subject={subject}
      dueReviews={dueReviews}
      retentionRate={overview.srs.retentionRate}
      totalReviewsCompleted={reviewStats.passed}
    />
  );
}
