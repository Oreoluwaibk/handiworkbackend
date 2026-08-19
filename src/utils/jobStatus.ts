export const JOB_PIPELINE_STATUSES = [
  "pending",
  "in_progress",
  "fulfilled",
  "delivered",
  "declined",
] as const;

export type JobPipelineStatus = (typeof JOB_PIPELINE_STATUSES)[number];

const QUOTE_TO_PIPELINE: Record<string, JobPipelineStatus> = {
  pending: "pending",
  replied: "pending",
  accepted: "in_progress",
  completed: "fulfilled",
  verified: "delivered",
  declined: "declined",
  in_progress: "in_progress",
  fulfilled: "fulfilled",
  delivered: "delivered",
};

const PIPELINE_TO_QUOTE: Record<string, string[]> = {
  pending: ["pending", "replied"],
  in_progress: ["accepted"],
  fulfilled: ["completed"],
  delivered: ["verified"],
  declined: ["declined"],
};

const PIPELINE_TO_CANONICAL: Record<string, string> = {
  pending: "pending",
  in_progress: "accepted",
  fulfilled: "completed",
  delivered: "verified",
  declined: "declined",
};

export function toPipelineStatus(status?: string | null): JobPipelineStatus {
  if (!status) return "pending";
  return QUOTE_TO_PIPELINE[status] || "pending";
}

export function quoteStatusQuery(status?: string | null): Record<string, unknown> {
  if (!status) return {};
  const mapped = PIPELINE_TO_QUOTE[status];
  if (mapped) return { status: { $in: mapped } };
  return { status };
}

export function toQuoteWorkflowStatus(status: string): string {
  return PIPELINE_TO_CANONICAL[status] || status;
}

export function pipelineCounts(rows: { _id: string | null; count: number }[]) {
  const counts: Record<string, number> = {
    pending: 0,
    in_progress: 0,
    fulfilled: 0,
    delivered: 0,
    declined: 0,
  };

  for (const row of rows) {
    const key = toPipelineStatus(row._id);
    counts[key] = (counts[key] || 0) + row.count;
  }

  return counts;
}
