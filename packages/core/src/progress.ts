/** Program progress for the admin dashboard: pure maths so every number is testable. */
export interface EnrollmentRow {
  user_id: string;
  status: string;
  started_at: string;
}
export interface LessonProgressRow {
  user_id: string;
  completed_at: string | null;
  play_count: number | null;
  last_watched_at: string | null;
}
export interface MemberProgress {
  userId: string;
  enrolledAt: string;
  completedLessons: number;
  totalLessons: number;
  percent: number;
  lastAccessed: string | null;
  sessions: number;
  finished: boolean;
}
export interface ProgressSummary {
  enrolled: number;
  started: number;
  completed: number;
  averagePercent: number;
  members: MemberProgress[];
}

export function summarizeProgress(
  enrollments: EnrollmentRow[],
  rows: LessonProgressRow[],
  totalLessons: number,
): ProgressSummary {
  const by = new Map<string, LessonProgressRow[]>();
  for (const r of rows) by.set(r.user_id, [...(by.get(r.user_id) ?? []), r]);
  const members = enrollments.map((e): MemberProgress => {
    const mine = by.get(e.user_id) ?? [];
    const done = mine.filter((r) => r.completed_at).length;
    const times = mine
      .flatMap((r) => [r.last_watched_at, r.completed_at])
      .filter((t): t is string => Boolean(t))
      .sort();
    const completedLessons = Math.min(done, totalLessons);
    return {
      userId: e.user_id,
      enrolledAt: e.started_at,
      completedLessons,
      totalLessons,
      percent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
      lastAccessed: times.length ? times[times.length - 1] : null,
      sessions: mine.reduce((n, r) => n + (r.play_count ?? 0), 0),
      finished: e.status === "completed" || (totalLessons > 0 && done >= totalLessons),
    };
  });
  const started = members.filter(
    (m) => m.completedLessons > 0 || m.sessions > 0 || m.lastAccessed,
  ).length;
  return {
    enrolled: members.length,
    started,
    completed: members.filter((m) => m.finished).length,
    averagePercent: members.length
      ? Math.round(members.reduce((n, m) => n + m.percent, 0) / members.length)
      : 0,
    members,
  };
}
