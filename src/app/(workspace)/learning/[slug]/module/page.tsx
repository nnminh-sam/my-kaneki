import { redirect, notFound } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import { getSubjectBySlug, listNodes } from "@/lib/lms/repo";

interface ModuleRedirectPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ModuleRedirectPage({
  params,
}: ModuleRedirectPageProps) {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  const { slug } = await params;
  const subject = await getSubjectBySlug(owner, slug);
  if (!subject) {
    notFound();
  }

  const nodes = await listNodes(owner, subject.id);
  const firstActiveNode =
    nodes.find((n) => n.status === "in_progress") ||
    nodes.find((n) => n.status === "unlocked") ||
    (nodes.length > 0 ? nodes[0] : null);

  if (firstActiveNode) {
    redirect(`/learning/${slug}/module/${firstActiveNode.id}`);
  }

  redirect(`/learning/${slug}`);
}
