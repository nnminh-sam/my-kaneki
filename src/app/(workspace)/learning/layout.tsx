import { notFound, redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import { isFeatureEnabled } from "@/lib/features";

export default async function LearningLayout({ children }: { children: React.ReactNode }) {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  if (!(await isFeatureEnabled(owner, "lms"))) {
    notFound();
  }

  return <>{children}</>;
}
