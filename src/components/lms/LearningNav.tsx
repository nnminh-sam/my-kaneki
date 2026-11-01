"use client";

import { useState } from "react";
import { SubjectHeader } from "./SubjectHeader";
import { LmsTabs } from "./LmsTabs";
import { LearningMobileTopNav } from "./LearningMobileTopNav";
import { LearningInnerSidebar } from "./LearningInnerSidebar";
import type {
  SubjectRow,
  LearnerProfileRow,
  NodeRow,
  PlacementSessionRow,
} from "@/lib/lms/types";
import type { SubjectOverview } from "@/lib/lms/subjects";

export interface LearningNavProps {
  subjects: SubjectRow[];
  currentSubject: SubjectRow;
  profile: LearnerProfileRow | null;
  overview: SubjectOverview;
  firstActiveNode: NodeRow | null;
  placementSession: PlacementSessionRow | null;
  dueReviewsCount: number;
  escalationCount: number;
  activeQuizId?: string | null;
}

export function LearningNav({
  subjects,
  currentSubject,
  profile,
  overview,
  firstActiveNode,
  placementSession,
  dueReviewsCount,
  escalationCount,
  activeQuizId,
}: LearningNavProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <>
      {/* Desktop Navigation Header & Tabs */}
      <div className="hidden md:block">
        <SubjectHeader
          subjects={subjects}
          currentSubject={currentSubject}
          profile={profile}
          overview={overview}
          firstActiveNode={firstActiveNode}
          placementSession={placementSession}
        />
        <LmsTabs
          slug={currentSubject.slug}
          dueReviewsCount={dueReviewsCount}
          escalationCount={escalationCount}
          activeNodeId={firstActiveNode?.id}
          activeQuizId={activeQuizId}
        />
      </div>

      {/* Mobile Redesigned Top Nav Bar & Inner Sidebar */}
      <div className="md:hidden">
        <LearningMobileTopNav
          subjects={subjects}
          currentSubject={currentSubject}
          overview={overview}
          firstActiveNode={firstActiveNode}
          dueReviewsCount={dueReviewsCount}
          escalationCount={escalationCount}
          activeQuizId={activeQuizId}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
        />
        <LearningInnerSidebar
          subjects={subjects}
          currentSubject={currentSubject}
          profile={profile}
          overview={overview}
          firstActiveNode={firstActiveNode}
          placementSession={placementSession}
          dueReviewsCount={dueReviewsCount}
          escalationCount={escalationCount}
          activeQuizId={activeQuizId}
          mobileOpen={mobileSidebarOpen}
          onMobileOpenChange={setMobileSidebarOpen}
        />
      </div>
    </>
  );
}
