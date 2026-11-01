import { redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/owner";
import { listSubjects } from "@/lib/lms/repo";

export default async function GlobalReviewPage() {
  const owner = await currentOwnerId();
  if (owner === null) {
    redirect("/login");
  }

  const subjects = await listSubjects(owner);
  if (subjects.length === 0) {
    redirect("/learning");
  }

  redirect(`/learning/${subjects[0].slug}/review`);
}
