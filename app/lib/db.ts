// ─── db.ts ───────────────────────────────────────────────────────────────────
// All Supabase database operations for the Day Planner.
// Each function is self-contained and silently falls back on error so the UI
// never crashes due to a network issue.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";

// ─── Types (mirrored from page.tsx) ──────────────────────────────────────────

export type EnergyLevel       = "low" | "medium" | "high";
export type TaskType          = "deep work" | "physical" | "life admin" | "chore" | "recovery";
export type SegmentKey        = "morning" | "midday" | "afternoon" | "evening";
export type EnergyStateValue  = "tired" | "normal" | "energized";
export type CreativityLevel   = "low" | "medium" | "high";
export type OutcomeType       = "done" | "skipped";

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  energy: EnergyLevel;
  creativity: CreativityLevel;
  duration: number;
  importance: number;
  urgency: number;
  preferredSegment: SegmentKey;
  done: boolean;
}

export interface FixedEvent {
  id: string;
  title: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export interface TaskLogEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  taskType: TaskType;
  taskDuration: number;
  outcome: OutcomeType;
  segment: SegmentKey;
  energyState: EnergyStateValue;
  timestamp: number;
  date: string;
}

export interface LearningCounts { done: number; skipped: number; }
export type LearningMap = Record<string, LearningCounts>;

export interface UserPreferences {
  energyState: EnergyStateValue;
  skippedTaskIds: string[];
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function fetchTasks(userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) { console.error("fetchTasks", error); return []; }

  return (data ?? []).map((row) => ({
    id:               row.id,
    title:            row.title,
    type:             row.type as TaskType,
    energy:           row.energy as EnergyLevel,
    creativity:       row.creativity as CreativityLevel,
    duration:         row.duration,
    importance:       row.importance,
    urgency:          row.urgency,
    preferredSegment: row.preferred_segment as SegmentKey,
    done:             row.done,
  }));
}

export async function upsertTask(userId: string, task: Task): Promise<void> {
  const { error } = await supabase.from("tasks").upsert({
    id:                 task.id,
    user_id:            userId,
    title:              task.title,
    type:               task.type,
    energy:             task.energy,
    creativity:         task.creativity,
    duration:           task.duration,
    importance:         task.importance,
    urgency:            task.urgency,
    preferred_segment:  task.preferredSegment,
    done:               task.done,
  }, { onConflict: "id" });
  if (error) console.error("upsertTask", error);
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) console.error("deleteTask", error);
}

export async function markTaskDone(taskId: string, done: boolean): Promise<void> {
  const { error } = await supabase.from("tasks").update({ done }).eq("id", taskId);
  if (error) console.error("markTaskDone", error);
}

// ─── Fixed Events ─────────────────────────────────────────────────────────────

export async function fetchFixedEvents(userId: string): Promise<FixedEvent[]> {
  const { data, error } = await supabase
    .from("fixed_events")
    .select("*")
    .eq("user_id", userId)
    .order("start_hour", { ascending: true });

  if (error) { console.error("fetchFixedEvents", error); return []; }

  return (data ?? []).map((row) => ({
    id:          row.id,
    title:       row.title,
    startHour:   row.start_hour,
    startMinute: row.start_minute,
    endHour:     row.end_hour,
    endMinute:   row.end_minute,
  }));
}

export async function insertFixedEvent(userId: string, event: FixedEvent): Promise<void> {
  const { error } = await supabase.from("fixed_events").insert({
    id:           event.id,
    user_id:      userId,
    title:        event.title,
    start_hour:   event.startHour,
    start_minute: event.startMinute,
    end_hour:     event.endHour,
    end_minute:   event.endMinute,
  });
  if (error) console.error("insertFixedEvent", error);
}

export async function deleteFixedEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from("fixed_events").delete().eq("id", eventId);
  if (error) console.error("deleteFixedEvent", error);
}

// ─── Task Log ─────────────────────────────────────────────────────────────────

export async function fetchTaskLog(userId: string, sinceDate: string): Promise<TaskLogEntry[]> {
  const { data, error } = await supabase
    .from("task_log")
    .select("*")
    .eq("user_id", userId)
    .gte("log_date", sinceDate)
    .order("created_at", { ascending: true });

  if (error) { console.error("fetchTaskLog", error); return []; }

  return (data ?? []).map((row) => ({
    id:           row.id,
    taskId:       row.task_id ?? "",
    taskTitle:    row.task_title,
    taskType:     row.task_type as TaskType,
    taskDuration: row.task_duration,
    outcome:      row.outcome as OutcomeType,
    segment:      row.segment as SegmentKey,
    energyState:  row.energy_state as EnergyStateValue,
    timestamp:    new Date(row.created_at).getTime(),
    date:         row.log_date,
  }));
}

export async function insertLogEntry(userId: string, entry: TaskLogEntry): Promise<void> {
  const { error } = await supabase.from("task_log").insert({
    id:            entry.id,
    user_id:       userId,
    task_id:       entry.taskId || null,
    task_title:    entry.taskTitle,
    task_type:     entry.taskType,
    task_duration: entry.taskDuration,
    outcome:       entry.outcome,
    segment:       entry.segment,
    energy_state:  entry.energyState,
    log_date:      entry.date,
  });
  if (error) console.error("insertLogEntry", error);
}

// ─── Learning Map ─────────────────────────────────────────────────────────────

export async function fetchLearningMap(userId: string): Promise<LearningMap> {
  const { data, error } = await supabase
    .from("learning_map")
    .select("*")
    .eq("user_id", userId);

  if (error) { console.error("fetchLearningMap", error); return {}; }

  const map: LearningMap = {};
  for (const row of data ?? []) {
    map[row.key] = { done: row.done_count, skipped: row.skipped_count };
  }
  return map;
}

export async function upsertLearningEntry(
  userId: string,
  key: string,
  counts: LearningCounts
): Promise<void> {
  const { error } = await supabase.from("learning_map").upsert({
    user_id:       userId,
    key,
    done_count:    counts.done,
    skipped_count: counts.skipped,
  }, { onConflict: "user_id,key" });
  if (error) console.error("upsertLearningEntry", error);
}

// ─── User Preferences ─────────────────────────────────────────────────────────

export async function fetchPreferences(userId: string): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) { console.error("fetchPreferences", error); return null; }
  if (!data)  return null;

  return {
    energyState:    data.energy_state as EnergyStateValue,
    skippedTaskIds: data.skipped_task_ids ?? [],
  };
}

export async function savePreferences(userId: string, prefs: UserPreferences): Promise<void> {
  const { error } = await supabase.from("user_preferences").upsert({
    user_id:          userId,
    energy_state:     prefs.energyState,
    skipped_task_ids: prefs.skippedTaskIds,
  }, { onConflict: "user_id" });
  if (error) console.error("savePreferences", error);
}