import type { SupabaseClient } from "@supabase/supabase-js";

export interface SavedReport {
  id: string;
  title: string;
  mode: string | null;
  source_type: string | null;
  created_at: string;
  report_data: Record<string, unknown> | null;
}

const saved = (db: SupabaseClient, userId: string) => db.from("reports")
  .select("id,title,mode,source_type,created_at,report_data")
  .eq("user_id", userId)
  .eq("cloud_saved", true)
  .eq("status", "complete");

export async function listSavedReports(db: SupabaseClient, userId: string, offset: number) {
  const { data, error } = await saved(db, userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 19);
  if (error) throw error;
  const reports = (data || []) as SavedReport[];
  return {
    reports: reports.map(({ id, title, mode, source_type, created_at, report_data }) => ({
      id, title, mode, source_type, created_at,
      summary: typeof report_data?.summary === "string" ? report_data.summary.slice(0, 600) : "",
    })),
    next_offset: reports.length === 20 ? offset + 20 : null,
  };
}

export async function getSavedReport(db: SupabaseClient, userId: string, reportId: string) {
  const { data, error } = await saved(db, userId).eq("id", reportId).maybeSingle<SavedReport>();
  if (error) throw error;
  return data;
}

export async function searchSavedReports(db: SupabaseClient, userId: string, query: string) {
  // The cloud library is currently small. Bound the scan so one tool call cannot
  // accidentally return every stored report or run unbounded JSON searches.
  const { data, error } = await saved(db, userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const needle = query.toLocaleLowerCase();
  const reports = ((data || []) as SavedReport[]).filter(report => {
    const body = JSON.stringify(report.report_data || {}).toLocaleLowerCase();
    return report.title.toLocaleLowerCase().includes(needle) || body.includes(needle);
  }).slice(0, 20);
  return {
    reports: reports.map(({ id, title, mode, created_at, report_data }) => ({
      id, title, mode, created_at,
      summary: typeof report_data?.summary === "string" ? report_data.summary.slice(0, 600) : "",
    })),
    searched_recent_reports: Math.min(data?.length || 0, 100),
    truncated: (data?.length || 0) === 100,
  };
}

export function reportOverview(report: SavedReport) {
  const body = report.report_data || {};
  return {
    id: report.id,
    title: report.title,
    mode: report.mode,
    created_at: report.created_at,
    source: body.source || null,
    prompt: body.prompt || null,
    summary: body.summary || null,
    findings: body.findings || [],
    recommendations: body.recommendations || [],
    tasks: body.tasks || [],
    questions_and_answers: body.qa || [],
    lesson: body.lesson || null,
    procedure: body.procedure || null,
    recipe: body.recipe || null,
    limitations: body.limitations || [],
    confidence: body.confidence || null,
    timeline_segment_count: Array.isArray((body.timeline as { segments?: unknown[] } | undefined)?.segments)
      ? (body.timeline as { segments: unknown[] }).segments.length : 0,
  };
}

export function reportTimeline(report: SavedReport, offset: number) {
  const body = report.report_data || {};
  const timeline = (body.timeline as { segments?: unknown[] } | undefined)?.segments;
  const segments = Array.isArray(timeline) ? timeline : [];
  return {
    report_id: report.id,
    title: report.title,
    segments: segments.slice(offset, offset + 25),
    next_offset: offset + 25 < segments.length ? offset + 25 : null,
    total: segments.length,
  };
}
