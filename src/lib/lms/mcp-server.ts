import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  upsertProfile,
  getProfile,
  getSubjectBySlug,
  listNodes,
  listNodeEdges,
  getNodeById,
  getQuizById,
} from "./repo";
import {
  createLearningSubject,
  getSubjectOverview,
  LMSValidationError,
} from "./subjects";
import {
  ingestUserFile,
} from "./ingest";
import {
  startResearchSession,
  submitResearchDraft,
  validateResearchDraft,
  resolveResearchEscalation,
} from "./research";
import {
  searchRag,
} from "./rag";
import {
  startPlacementSession,
  submitPlacementStep,
} from "./placement.service";
import {
  draftLearningPath,
  getNextNodes,
  type LearningPathNodeInput,
} from "./path.service";
import {
  generateQuiz,
  submitQuizAttempt,
} from "./quiz.service";
import {
  getDueReviews,
  submitReviewAttempt,
} from "./review.service";
import {
  stripAnswerKey,
} from "./grading";
import {
  renderOrchestrateResearchPrompt,
  renderResearchAgentPrompt,
  renderValidationAgentPrompt,
} from "./prompts/research-prompts";
import {
  renderConductPlacementPrompt,
  renderTutorNodePrompt,
  renderDailyReviewPrompt,
} from "./prompts/learner-prompts";
import {
  quizSubmissionSchema,
  quizPromptPayloadSchema,
  type SourcePerspective,
} from "./types";

/**
 * Creates and configures a stateless MCP Server instance bound to the authenticated ownerId.
 * Multi-tenant isolation is strictly maintained through closures.
 */
export function createLmsMcpServer(ownerId: string): McpServer {
  const server = new McpServer(
    {
      name: "my_kaneki_lms",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  // ==========================================================================
  // Resources
  // ==========================================================================

  server.resource(
    "learner-profile",
    "lms://profile",
    async (uri) => {
      const profile = await getProfile(ownerId);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(profile || { owner_id: ownerId, learning_style: {}, preferred_languages: "" }, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    "subject-overview",
    new ResourceTemplate("lms://subjects/{slug}/overview", { list: undefined }),
    async (uri, { slug }) => {
      const overview = await getSubjectOverview(ownerId, String(slug));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(overview, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    "subject-graph",
    new ResourceTemplate("lms://subjects/{slug}/graph", { list: undefined }),
    async (uri, { slug }) => {
      const subject = await getSubjectBySlug(ownerId, String(slug));
      if (!subject) {
        throw new Error(`Subject "${slug}" not found`);
      }
      const nodes = await listNodes(ownerId, subject.id);
      const edges = await listNodeEdges(ownerId, subject.id);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ subject, nodes, edges }, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    "subject-node",
    new ResourceTemplate("lms://subjects/{slug}/nodes/{nodeId}", { list: undefined }),
    async (uri, { nodeId }) => {
      const node = await getNodeById(ownerId, String(nodeId));
      if (!node) {
        throw new Error(`Node "${nodeId}" not found`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(node, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    "due-reviews",
    "lms://reviews/due",
    async (uri) => {
      const due = await getDueReviews(ownerId);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(due, null, 2),
          },
        ],
      };
    },
  );

  // ==========================================================================
  // Prompts
  // ==========================================================================

  server.prompt(
    "lms-orchestrate-research",
    "Guides the Orchestrator Agent to spawn research & validation sub-agents, enforce 3-round peer review limit, and escalate if needed.",
    {
      subjectTitle: z.string(),
      subjectSlug: z.string(),
      topicTitle: z.string(),
      requiredPerspectives: z.string().describe("Comma-separated list of perspectives: theory, practical, critique, reference"),
      currentRound: z.string().describe("Current round number (1..3)"),
    },
    ({ subjectTitle, subjectSlug, topicTitle, requiredPerspectives, currentRound }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: renderOrchestrateResearchPrompt({
              subjectTitle,
              subjectSlug,
              topicTitle,
              requiredPerspectives: requiredPerspectives.split(",").map((s) => s.trim()) as SourcePerspective[],
              currentRound: parseInt(currentRound, 10) || 1,
            }),
          },
        },
      ],
    }),
  );

  server.prompt(
    "lms-research-agent",
    "Role prompt for Research Sub-Agent to perform multi-perspective research, cite sources with [n], and defend/revise against defects.",
    {
      topicTitle: z.string(),
      subjectTitle: z.string(),
      requiredPerspectives: z.string(),
      currentRound: z.string(),
      priorDefects: z.string().optional().describe("Comma or newline separated list of critique defects to address"),
    },
    ({ topicTitle, subjectTitle, requiredPerspectives, currentRound, priorDefects }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: renderResearchAgentPrompt({
              topicTitle,
              subjectTitle,
              requiredPerspectives: requiredPerspectives.split(",").map((s) => s.trim()) as SourcePerspective[],
              currentRound: parseInt(currentRound, 10) || 1,
              priorDefects: priorDefects ? priorDefects.split("\n").filter(Boolean) : undefined,
            }),
          },
        },
      ],
    }),
  );

  server.prompt(
    "lms-validate-agent",
    "Role prompt for Validation Sub-Agent to peer-review drafts for factual accuracy, bias, and objectively evaluate defense arguments.",
    {
      topicTitle: z.string(),
      draftMarkdown: z.string(),
      citations: z.string().describe("Newline separated list of primary source URLs"),
      currentRound: z.string(),
      defenseArgument: z.string().optional(),
    },
    ({ topicTitle, draftMarkdown, citations, currentRound, defenseArgument }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: renderValidationAgentPrompt({
              topicTitle,
              draftMarkdown,
              citations: citations.split("\n").filter(Boolean),
              currentRound: parseInt(currentRound, 10) || 1,
              defenseArgument,
            }),
          },
        },
      ],
    }),
  );

  server.prompt(
    "lms-conduct-placement",
    "Runs the interactive Binary Search diagnostic loop with the learner, testing one difficulty tier at a time.",
    {
      subjectTitle: z.string(),
      subjectSlug: z.string(),
      currentMid: z.string(),
      lowBound: z.string(),
      highBound: z.string(),
    },
    ({ subjectTitle, subjectSlug, currentMid, lowBound, highBound }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: renderConductPlacementPrompt({
              subjectTitle,
              subjectSlug,
              currentMid: parseInt(currentMid, 10) || 1,
              lowBound: parseInt(lowBound, 10) || 1,
              highBound: parseInt(highBound, 10) || 16,
            }),
          },
        },
      ],
    }),
  );

  server.prompt(
    "lms-tutor-node",
    "Guides the 1-on-1 Personal Tutor to teach a node concept in the user's preferred style, guide on capstones, and administer Mastery Gate.",
    {
      subjectTitle: z.string(),
      nodeTitle: z.string(),
      difficultyLevel: z.string(),
      learningStyleMode: z.string().optional(),
      projectMilestone: z.string().optional(),
      summary: z.string().optional(),
    },
    ({ subjectTitle, nodeTitle, difficultyLevel, learningStyleMode, projectMilestone, summary }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: renderTutorNodePrompt({
              subjectTitle,
              nodeTitle,
              difficultyLevel: parseInt(difficultyLevel, 10) || 1,
              learningStyleMode,
              projectMilestone,
              summary,
            }),
          },
        },
      ],
    }),
  );

  server.prompt(
    "lms-daily-review",
    "Checks lms://reviews/due and conducts a rapid spaced repetition quiz session with remediation on lapses.",
    {
      dueCount: z.string().optional(),
    },
    ({ dueCount }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: renderDailyReviewPrompt({
              dueCount: dueCount ? parseInt(dueCount, 10) : undefined,
            }),
          },
        },
      ],
    }),
  );

  // ==========================================================================
  // Tools: Group A (Profile & Subject Management)
  // ==========================================================================

  server.tool(
    "lms_get_or_update_learner_profile",
    "Retrieve or update the learner's profile, including learning style (first_principles, code_first, visual, analogy_heavy), pace, and preferred programming languages.",
    {
      learningStyle: z
        .object({
          mode: z.enum(["first_principles", "code_first", "visual", "analogy_heavy"]).optional(),
          pace: z.enum(["leisurely", "standard", "intensive"]).optional(),
          depth: z.enum(["introductory", "intermediate", "deep_mastery"]).optional(),
          notes: z.string().optional(),
        })
        .optional(),
      preferredLanguages: z.string().optional(),
    },
    async (args) => {
      try {
        if (args.learningStyle || args.preferredLanguages !== undefined) {
          await upsertProfile(ownerId, {
            learningStyle: args.learningStyle,
            preferredLanguages: args.preferredLanguages,
          });
        }
        const profile = await getProfile(ownerId);
        return {
          content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  server.tool(
    "lms_create_subject",
    "Create a new learning subject with a linear difficulty scale (1..N) and optional capstone project.",
    {
      title: z.string().min(1).describe("Human-readable title of the subject (e.g. Distributed Systems & Raft)"),
      slug: z.string().optional().describe("URL-safe slug; auto-generated if omitted"),
      difficultyScaleN: z.number().int().positive().optional().describe("Maximum difficulty tier N (default 16)"),
      capstoneProject: z
        .object({
          title: z.string(),
          description: z.string().optional(),
          milestones: z
            .array(
              z.object({
                title: z.string(),
                description: z.string().optional(),
                targetNodeId: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    },
    async (args) => {
      try {
        const subject = await createLearningSubject(ownerId, {
          title: args.title,
          slug: args.slug,
          difficultyScaleN: args.difficultyScaleN,
          capstoneProject: args.capstoneProject
            ? {
                title: args.capstoneProject.title,
                description: args.capstoneProject.description || "",
                milestones: (args.capstoneProject.milestones || []).map((m) => ({
                  title: m.title,
                  description: m.description,
                  targetNodeId: m.targetNodeId,
                  completed: false,
                })),
              }
            : undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(subject, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  // ==========================================================================
  // Tools: Group B (Ingestion, Multi-Agent Research & Validation)
  // ==========================================================================

  server.tool(
    "lms_ingest_user_file",
    "Ingest a user document (pdf, docx, xlsx, csv, md) into the subject's knowledge base. Stores the original binary file as-is and indexes it for RAG.",
    {
      subjectSlug: z.string().describe("Target subject slug"),
      filename: z.string().describe("Filename with extension (e.g. notes.md, spec.pdf)"),
      contentBase64: z.string().optional().describe("Base64-encoded binary content (for pdf, docx, xlsx)"),
      contentText: z.string().optional().describe("Plain text content (for md, csv)"),
    },
    async (args) => {
      try {
        let buffer: Buffer;
        if (args.contentBase64) {
          buffer = Buffer.from(args.contentBase64, "base64");
        } else if (args.contentText) {
          buffer = Buffer.from(args.contentText, "utf-8");
        } else {
          throw new LMSValidationError("Either contentBase64 or contentText must be supplied.");
        }

        const result = await ingestUserFile({
          ownerId,
          subjectSlug: args.subjectSlug,
          filename: args.filename,
          bytes: buffer,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  server.tool(
    "lms_start_research_session",
    "Initialize an agent-driven web research session for a topic within a learning subject.",
    {
      subjectSlug: z.string(),
      topicTitle: z.string(),
      originalUri: z.string().optional(),
      perspective: z.enum(["theory", "practical", "critique", "reference", "mixed"]).optional(),
    },
    async (args) => {
      try {
        const source = await startResearchSession(
          ownerId,
          args.subjectSlug,
          args.topicTitle,
          args.perspective ? [args.perspective] : ["mixed"],
        );
        return {
          content: [{ type: "text", text: JSON.stringify(source, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  server.tool(
    "lms_submit_research_draft",
    "Submit an authored or revised research draft with primary citations and optional counter-evidence / defense argument.",
    {
      sourceId: z.string(),
      draftMarkdown: z.string().describe("Synthesized structured markdown with numeric footnotes [1], [2]"),
      citations: z.array(z.string()).min(1).describe("Primary URLs corresponding to numeric citations"),
      defenseArgument: z.string().optional().describe("Defense against defects from prior peer review rounds"),
    },
    async (args) => {
      try {
        const result = await submitResearchDraft(ownerId, args.sourceId, {
          draftMarkdown: args.draftMarkdown,
          citations: args.citations,
          defenseArgument: args.defenseArgument,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  server.tool(
    "lms_validate_research_draft",
    "Validation Sub-Agent peer review tool: Accept draft or raise defects (enforces strict 3-round cap).",
    {
      sourceId: z.string(),
      decision: z.enum(["accept", "raise_issues"]),
      critiqueSummary: z.string().describe("Justification for acceptance or critique"),
      defects: z.array(z.string()).optional().describe("List of concrete flaws requiring revision or defense"),
    },
    async (args) => {
      try {
        const result = await validateResearchDraft(ownerId, args.sourceId, {
          decision: args.decision,
          critiqueSummary: args.critiqueSummary,
          defects: args.defects,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  server.tool(
    "lms_resolve_research_escalation",
    "Record human learner's decision on escalated research debate. Gated by confirmationToken.",
    {
      sourceId: z.string(),
      userDecision: z.enum(["approve_override", "edit_and_approve", "reject"]),
      userNotes: z.string().optional().describe("Notes or reason for human decision"),
      editedMarkdown: z.string().optional(),
      confirmationToken: z.string().optional().describe("Human user confirmation token"),
    },
    async (args) => {
      try {
        const result = await resolveResearchEscalation(ownerId, args.sourceId, {
          userDecision: args.userDecision,
          userNotes: args.userNotes || `Human decision: ${args.userDecision}`,
          editedMarkdown: args.editedMarkdown,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  server.tool(
    "lms_search_rag",
    "Hybrid vector and keyword search across the validated subject knowledge base.",
    {
      subjectSlug: z.string(),
      query: z.string(),
      track: z.enum(["byos", "agent_research"]).optional(),
      perspective: z.enum(["theory", "practical", "critique", "reference", "mixed"]).optional(),
      difficultyLevel: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    async (args) => {
      try {
        const results = await searchRag({
          ownerId,
          subjectSlug: args.subjectSlug,
          query: args.query,
          track: args.track,
          perspective: args.perspective,
          difficultyLevel: args.difficultyLevel,
          limit: args.limit ?? 5,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  // ==========================================================================
  // Tools: Group C (Binary Search Diagnostic Placement)
  // ==========================================================================

  server.tool(
    "lms_placement_start",
    "Initiate or restart an adaptive binary search diagnostic placement session. Returns initial midpoint question with answer key stripped.",
    {
      subjectSlug: z.string(),
    },
    async (args) => {
      try {
        const result = await startPlacementSession(ownerId, args.subjectSlug);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  server.tool(
    "lms_placement_submit_step",
    "Submit the learner's answer for the current diagnostic midpoint question.",
    {
      sessionId: z.string(),
      quizId: z.string(),
      submission: quizSubmissionSchema,
    },
    async (args) => {
      try {
        const result = await submitPlacementStep(ownerId, args.sessionId, {
          quizId: args.quizId,
          submission: args.submission,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  // ==========================================================================
  // Tools: Group D (Learning Path DAG & Progression)
  // ==========================================================================

  server.tool(
    "lms_draft_learning_path",
    "Validate and commit an ordered learning path DAG. Checks cycles, difficulty monotonicity, source grounding, and milestone linkage.",
    {
      subjectSlug: z.string(),
      nodes: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
            difficultyLevel: z.number().int().positive(),
            ordinal: z.number().int().optional(),
            summary: z.string().optional(),
            githubMdPath: z.string().optional(),
            projectMilestone: z.string().optional(),
            sourceIds: z.array(z.string()).optional(),
            studyGuideMarkdown: z.string().optional(),
          }),
        )
        .min(1),
      edges: z.array(
        z.object({
          nodeId: z.string(),
          dependsOnNodeId: z.string(),
        }),
      ),
      capstoneProject: z
        .object({
          title: z.string(),
          description: z.string().optional(),
          milestones: z
            .array(
              z.object({
                title: z.string(),
                description: z.string().optional(),
                targetNodeId: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
      attemptRound: z.number().int().optional(),
    },
    async (args) => {
      try {
        const result = await draftLearningPath(ownerId, args.subjectSlug, {
          nodes: args.nodes as LearningPathNodeInput[],
          edges: args.edges,
          capstoneProject: args.capstoneProject
            ? {
                title: args.capstoneProject.title,
                description: args.capstoneProject.description || "",
                milestones: (args.capstoneProject.milestones || []).map((m) => ({
                  title: m.title,
                  description: m.description,
                  targetNodeId: m.targetNodeId,
                  completed: false,
                })),
              }
            : undefined,
          attemptRound: args.attemptRound,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  server.tool(
    "lms_get_next_nodes",
    "Retrieve currently unlocked and in-progress learning nodes paired with relevant RAG context chunks.",
    {
      subjectSlug: z.string(),
    },
    async (args) => {
      try {
        const results = await getNextNodes(ownerId, args.subjectSlug);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  // ==========================================================================
  // Tools: Group E (Mastery Gate & Spaced Repetition Quizzes)
  // ==========================================================================

  server.tool(
    "lms_generate_quiz",
    "Register a quiz instance (mastery_gate or spaced_repetition). Answer keys are never echoed back to clients.",
    {
      subjectSlug: z.string(),
      nodeId: z.string().optional(),
      placementSessionId: z.string().optional(),
      quizPurpose: z.enum(["placement", "mastery_gate", "spaced_repetition"]),
      quizType: z.enum(["mcq_4", "open_ended", "code_challenge", "project_task"]),
      difficultyLevel: z.number().int().positive(),
      promptPayload: quizPromptPayloadSchema,
    },
    async (args) => {
      try {
        const quiz = await generateQuiz(ownerId, args.subjectSlug, {
          nodeId: args.nodeId,
          placementSessionId: args.placementSessionId,
          quizPurpose: args.quizPurpose,
          quizType: args.quizType,
          difficultyLevel: args.difficultyLevel,
          promptPayload: args.promptPayload,
        });

        // Strip answer key from echoed response so it never leaks
        const safeQuiz = {
          ...quiz,
          prompt_payload: stripAnswerKey(quiz.prompt_payload),
        };

        return {
          content: [{ type: "text", text: JSON.stringify(safeQuiz, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  server.tool(
    "lms_submit_quiz",
    "Submit an answer for a mastery gate or spaced repetition review quiz.",
    {
      quizId: z.string(),
      submission: quizSubmissionSchema,
    },
    async (args) => {
      try {
        const quiz = await getQuizById(ownerId, args.quizId);
        if (!quiz) {
          throw new LMSValidationError(`Quiz "${args.quizId}" not found.`);
        }

        if (quiz.quiz_purpose === "spaced_repetition") {
          const reviewResult = await submitReviewAttempt(ownerId, args.quizId, args.submission);
          return {
            content: [{ type: "text", text: JSON.stringify(reviewResult, null, 2) }],
          };
        }

        const gateResult = await submitQuizAttempt(ownerId, args.quizId, args.submission);
        return {
          content: [{ type: "text", text: JSON.stringify(gateResult, null, 2) }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  return server;
}
