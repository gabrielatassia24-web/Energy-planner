"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  Moon,
  PlayCircle,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EnergyLevel = "low" | "medium" | "high";
type TaskType = "deep work" | "physical" | "life admin" | "chore" | "recovery";
type SegmentKey = "morning" | "midday" | "afternoon" | "evening";
type EnergyStateValue = "tired" | "normal" | "energized";
type CreativityLevel = "low" | "medium" | "high";
type OutcomeType = "done" | "skipped";

interface EnergyState {
  value: EnergyStateValue;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  multiplier: number;
}

interface DaySegment {
  key: SegmentKey;
  label: string;
  start: number;
  end: number;
  energy: EnergyLevel;
  creativity: CreativityLevel;
  goodTypes: TaskType[];
}

interface Task {
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

interface RankedTask extends Task {
  score: number;
  learningBonus: number;
}

interface TaskForm {
  title: string;
  type: TaskType;
  energy: EnergyLevel;
  creativity: CreativityLevel;
  duration: number;
  importance: number;
  urgency: number;
  preferredSegment: SegmentKey;
}

interface FixedEvent {
  id: string;
  title: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

interface EventForm {
  title: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

interface Plan {
  segment: DaySegment;
  ranked: RankedTask[];
  nowTask: RankedTask | null;
  currentEvent: FixedEvent | null;
}

// Key: "{taskType}:{segmentKey}:{energyState}" → {done, skipped}
interface LearningCounts { done: number; skipped: number; }
type LearningMap = Record<string, LearningCounts>;

interface TaskLogEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  taskType: TaskType;
  taskDuration: number;
  outcome: OutcomeType;
  segment: SegmentKey;
  energyState: EnergyStateValue;
  timestamp: number;
  date: string; // "YYYY-MM-DD"
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ENERGY_STATES: EnergyState[] = [
  { value: "tired",     label: "Tired",     icon: Moon, multiplier: 0.7  },
  { value: "normal",    label: "Normal",    icon: Sun,  multiplier: 1    },
  { value: "energized", label: "Energized", icon: Zap,  multiplier: 1.25 },
];

const ENERGY_SCORE: Record<EnergyLevel, number>      = { low: 1, medium: 2, high: 3 };
const CREATIVITY_SCORE: Record<CreativityLevel, number> = { low: 1, medium: 2, high: 3 };
const TASK_TYPES: TaskType[] = ["deep work", "physical", "life admin", "chore", "recovery"];

const DAY_SEGMENTS: DaySegment[] = [
  { key: "morning",   label: "Morning",   start: 6,  end: 11, energy: "high",   creativity: "medium", goodTypes: ["physical", "deep work"]  },
  { key: "midday",    label: "Midday",    start: 11, end: 15, energy: "high",   creativity: "high",   goodTypes: ["deep work", "life admin"] },
  { key: "afternoon", label: "Afternoon", start: 15, end: 18, energy: "medium", creativity: "high",   goodTypes: ["life admin", "physical"]  },
  { key: "evening",   label: "Evening",   start: 18, end: 23, energy: "low",    creativity: "low",    goodTypes: ["chore", "recovery"]       },
];

const QUICK_TASK_MAX_DURATION = 15;
const LEARNING_MAX_BONUS = 8;
const LEARNING_MIN_EVENTS = 3;

const SK_TASKS    = "planner-tasks-v3";
const SK_EVENTS   = "planner-fixed-events-v2";
const SK_ENERGY   = "planner-energy-v1";
const SK_HOUR     = "planner-hour-v1";
const SK_MINUTE   = "planner-minute-v1";
const SK_SKIPPED  = "planner-skipped-v1";
const SK_LEARNING = "planner-learning-v1";
const SK_LOG      = "planner-log-v1";

// ─── Storage ──────────────────────────────────────────────────────────────────

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

function writeStorage(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.error("localStorage write failed", e); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function yesterdayStr(): string {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function toMinutes(h: number, m: number): number { return h * 60 + m; }

// ─── Learning ─────────────────────────────────────────────────────────────────

function lKey(type: TaskType, seg: SegmentKey, energy: EnergyStateValue): string {
  return `${type}:${seg}:${energy}`;
}

function getLearningBonus(lm: LearningMap, type: TaskType, seg: SegmentKey, energy: EnergyStateValue): number {
  const counts = lm[lKey(type, seg, energy)];
  if (!counts) return 0;
  const total = counts.done + counts.skipped;
  if (total < LEARNING_MIN_EVENTS) return 0;
  const centred = (counts.done / total - 0.5) * 2;
  const confidence = Math.min(total / 20, 1);
  return Math.round(centred * LEARNING_MAX_BONUS * confidence);
}

function recordOutcome(lm: LearningMap, type: TaskType, seg: SegmentKey, energy: EnergyStateValue, outcome: OutcomeType): LearningMap {
  const key = lKey(type, seg, energy);
  const prev = lm[key] ?? { done: 0, skipped: 0 };
  return { ...lm, [key]: { ...prev, [outcome]: prev[outcome] + 1 } };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreTask(
  task: Task, seg: DaySegment, es: EnergyState, lm: LearningMap, quickMode: boolean
): { base: number; learningBonus: number } {
  if (task.done) return { base: -9999, learningBonus: 0 };
  if (quickMode && task.duration > QUICK_TASK_MAX_DURATION) return { base: -500, learningBonus: 0 };

  let s = task.importance * 10 + task.urgency * 8;
  s += 24 - Math.abs(ENERGY_SCORE[seg.energy] * es.multiplier - ENERGY_SCORE[task.energy]) * 10;

  const cgap = Math.abs(CREATIVITY_SCORE[seg.creativity] - CREATIVITY_SCORE[task.creativity]);
  s += cgap === 0 ? 20 : cgap === 1 ? 8 : -8;

  if (task.preferredSegment === seg.key) s += 18;
  if (seg.goodTypes.includes(task.type))  s += 12;
  if (es.value === "tired"     && task.energy === "high") s -= 18;
  if (es.value === "energized" && task.energy === "low")  s -= 6;
  if (task.duration <= 30)                              s += 4;
  if (es.value === "tired" && task.duration > 60)       s -= 10;
  if (quickMode && task.duration <= QUICK_TASK_MAX_DURATION) s += 30;

  return { base: s, learningBonus: getLearningBonus(lm, task.type, seg.key, es.value) };
}

function buildPlan(
  tasks: Task[], hour: number, minute: number, es: EnergyState,
  skipped: string[], events: FixedEvent[], lm: LearningMap, quickMode: boolean
): Plan {
  const seg = DAY_SEGMENTS.find((s) => hour >= s.start && hour < s.end) ?? DAY_SEGMENTS[3];
  const now = toMinutes(hour, minute);
  const currentEvent = events.find((e) => now >= toMinutes(e.startHour, e.startMinute) && now < toMinutes(e.endHour, e.endMinute)) ?? null;
  const remaining = tasks.filter((t) => !t.done && !skipped.includes(t.id));
  const ranked: RankedTask[] = remaining
    .map((t) => { const { base, learningBonus } = scoreTask(t, seg, es, lm, quickMode); return { ...t, score: base + learningBonus, learningBonus }; })
    .sort((a, b) => b.score - a.score);
  return { segment: seg, ranked, nowTask: currentEvent ? null : ranked[0] ?? null, currentEvent };
}

// ─── Initial data ─────────────────────────────────────────────────────────────

function makeInitialTasks(): Task[] {
  return [
    { id: crypto.randomUUID(), title: "Gym",               type: "physical",   energy: "high",   creativity: "low",    duration: 60, importance: 5, urgency: 3, preferredSegment: "morning",   done: false },
    { id: crypto.randomUUID(), title: "Study for exam",    type: "deep work",  energy: "high",   creativity: "medium", duration: 90, importance: 5, urgency: 5, preferredSegment: "midday",    done: false },
    { id: crypto.randomUUID(), title: "Answer emails",     type: "life admin", energy: "medium", creativity: "low",    duration: 30, importance: 3, urgency: 4, preferredSegment: "afternoon", done: false },
    { id: crypto.randomUUID(), title: "Laundry",           type: "chore",      energy: "low",    creativity: "low",    duration: 30, importance: 2, urgency: 2, preferredSegment: "evening",   done: false },
    { id: crypto.randomUUID(), title: "Stretch & recover", type: "recovery",   energy: "low",    creativity: "low",    duration: 20, importance: 4, urgency: 2, preferredSegment: "evening",   done: false },
  ];
}

function makeInitialEvents(): FixedEvent[] {
  return [
    { id: crypto.randomUUID(), title: "Lecture",    startHour: 9,  startMinute: 0, endHour: 11, endMinute: 0 },
    { id: crypto.randomUUID(), title: "Work shift", startHour: 14, startMinute: 0, endHour: 16, endMinute: 0 },
  ];
}

const emptyTaskForm: TaskForm = { title: "", type: "deep work", energy: "medium", creativity: "medium", duration: 30, importance: 3, urgency: 3, preferredSegment: "midday" };
const emptyEventForm: EventForm = { title: "", startHour: 9, startMinute: 0, endHour: 10, endMinute: 0 };

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500";
const cardCls  = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm";

function btnCls(kind: "primary" | "secondary" | "ghost" = "primary"): string {
  if (kind === "secondary") return "inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50";
  if (kind === "ghost")     return "inline-flex items-center justify-center rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200";
  return "inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800";
}

function pillCls(active: boolean): string {
  return active
    ? "rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-left text-white"
    : "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-800 hover:bg-slate-50";
}

function energyBadgeCls(l: EnergyLevel): string {
  return l === "high" ? "border border-emerald-200 bg-emerald-100 text-emerald-800"
       : l === "medium" ? "border border-amber-200 bg-amber-100 text-amber-800"
       : "border border-slate-200 bg-slate-100 text-slate-800";
}

function creativityBadgeCls(l: CreativityLevel): string {
  return l === "high" ? "border border-purple-200 bg-purple-100 text-purple-800"
       : l === "medium" ? "border border-violet-200 bg-violet-100 text-violet-800"
       : "border border-slate-200 bg-slate-100 text-slate-600";
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

// A block on the timeline is either a scheduled task or a fixed event.
interface TimelineBlock {
  kind: "task" | "event" | "gap";
  id: string;
  title: string;
  startMin: number;   // minutes since midnight
  endMin: number;
  taskRef?: RankedTask;
  eventRef?: FixedEvent;
  done?: boolean;
  skipped?: boolean;
}

const TIMELINE_START = 6 * 60;   // 06:00
const TIMELINE_END   = 23 * 60;  // 23:00
const PX_PER_MIN     = 1.4;      // pixels per minute — controls overall height

/**
 * Builds an ordered list of timeline blocks:
 * 1. Fixed events are placed at their exact times.
 * 2. Remaining ranked tasks are scheduled sequentially starting from
 *    the later of (current time) or (end of last block), filling gaps
 *    between fixed events.
 */
function buildTimeline(
  rankedTasks: RankedTask[],
  fixedEvents: FixedEvent[],
  doneTasks: Task[],
  skippedIds: string[],
  currentHour: number,
  currentMinute: number,
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];

  // Sort fixed events by start time
  const sortedEvents = [...fixedEvents].sort(
    (a, b) => toMinutes(a.startHour, a.startMinute) - toMinutes(b.startHour, b.startMinute)
  );

  // Build a set of "busy windows" from fixed events
  const busy: { startMin: number; endMin: number }[] = sortedEvents.map((e) => ({
    startMin: toMinutes(e.startHour, e.startMinute),
    endMin: toMinutes(e.endHour, e.endMinute),
  }));

  // Add fixed event blocks
  for (const ev of sortedEvents) {
    blocks.push({
      kind: "event",
      id: ev.id,
      title: ev.title,
      startMin: toMinutes(ev.startHour, ev.startMinute),
      endMin: toMinutes(ev.endHour, ev.endMinute),
      eventRef: ev,
    });
  }

  // Schedule tasks: fill free windows starting from now
  const nowMin = toMinutes(currentHour, currentMinute);
  let cursor = Math.max(nowMin, TIMELINE_START);

  // tasks to schedule: done tasks go at their natural position (before now),
  // remaining tasks fill from now onward
  const doneIds = new Set(doneTasks.map((t) => t.id));

  // Place done tasks before now, packed backwards from now
  // (we show them greyed out above the now-line)
  let doneCursor = Math.max(TIMELINE_START, nowMin);
  for (const task of [...doneTasks].reverse()) {
    const dur = Math.max(task.duration, 5);
    const end = doneCursor;
    const start = Math.max(TIMELINE_START, end - dur);
    if (start >= TIMELINE_START) {
      blocks.push({
        kind: "task", id: `done-${task.id}`, title: task.title,
        startMin: start, endMin: end,
        taskRef: { ...task, score: 0, learningBonus: 0 },
        done: true,
      });
      doneCursor = start;
    }
  }

  // Schedule pending tasks from cursor forward, skipping busy windows
  for (const task of rankedTasks) {
    if (doneIds.has(task.id)) continue;
    const dur = Math.max(task.duration, 5);
    let placed = false;

    // Advance cursor past any overlapping busy window
    let safeStart = cursor;
    let iterations = 0;
    while (iterations < 20) {
      iterations++;
      const overlap = busy.find(
        (b) => safeStart < b.endMin && safeStart + dur > b.startMin
      );
      if (!overlap) break;
      safeStart = overlap.endMin;
    }

    if (safeStart + dur <= TIMELINE_END) {
      blocks.push({
        kind: "task", id: task.id, title: task.title,
        startMin: safeStart, endMin: safeStart + dur,
        taskRef: task,
        skipped: skippedIds.includes(task.id),
      });
      cursor = safeStart + dur;
      placed = true;
    }

    if (!placed) break; // no more room in the day
  }

  return blocks.sort((a, b) => a.startMin - b.startMin);
}

// Colour per task type
function taskTypeColor(type: TaskType): { bg: string; border: string; text: string } {
  switch (type) {
    case "deep work":  return { bg: "bg-violet-100",  border: "border-violet-300",  text: "text-violet-900"  };
    case "physical":   return { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-900" };
    case "life admin": return { bg: "bg-amber-100",   border: "border-amber-300",   text: "text-amber-900"   };
    case "chore":      return { bg: "bg-slate-100",   border: "border-slate-300",   text: "text-slate-700"   };
    case "recovery":   return { bg: "bg-rose-100",    border: "border-rose-300",    text: "text-rose-900"    };
  }
}

// Segment background colour bands
const SEGMENT_BANDS: { startMin: number; endMin: number; color: string; label: string }[] = [
  { startMin: 6*60,  endMin: 11*60, color: "bg-amber-50",   label: "Morning"   },
  { startMin: 11*60, endMin: 15*60, color: "bg-sky-50",     label: "Midday"    },
  { startMin: 15*60, endMin: 18*60, color: "bg-violet-50",  label: "Afternoon" },
  { startMin: 18*60, endMin: 23*60, color: "bg-slate-100",  label: "Evening"   },
];

// ─── Timer hook ───────────────────────────────────────────────────────────────

function useTaskTimer() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startTimer(id: string) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setActiveTaskId(id); setSecondsElapsed(0);
    intervalRef.current = setInterval(() => setSecondsElapsed((s) => s + 1), 1000);
  }
  function stopTimer() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setActiveTaskId(null); setSecondsElapsed(0);
  }
  function formatElapsed(): string {
    const m = Math.floor(secondsElapsed / 60), s = secondsElapsed % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return { activeTaskId, formatElapsed, startTimer, stopTimer };
}

// ─── DayTimeline component ────────────────────────────────────────────────────

interface DayTimelineProps {
  blocks: TimelineBlock[];
  currentHour: number;
  currentMinute: number;
  onTaskClick: (task: RankedTask) => void;
}

function DayTimeline({ blocks, currentHour, currentMinute, onTaskClick }: DayTimelineProps) {
  const totalMin  = TIMELINE_END - TIMELINE_START;
  const totalPx   = totalMin * PX_PER_MIN;
  const nowMin    = toMinutes(currentHour, currentMinute);
  const nowPx     = Math.min(Math.max((nowMin - TIMELINE_START) * PX_PER_MIN, 0), totalPx);

  // Hour labels to show on the left axis (every 2 hours)
  const hourLabels: number[] = [];
  for (let h = 6; h <= 23; h += 2) hourLabels.push(h);

  function minToPx(m: number): number {
    return (m - TIMELINE_START) * PX_PER_MIN;
  }

  function blockHeightPx(block: TimelineBlock): number {
    return Math.max((block.endMin - block.startMin) * PX_PER_MIN, 24);
  }

  return (
    <div className="relative select-none" style={{ height: `${totalPx}px` }}>

      {/* Segment colour bands */}
      {SEGMENT_BANDS.map((band) => (
        <div
          key={band.label}
          className={`absolute left-10 right-0 ${band.color}`}
          style={{
            top:    `${minToPx(band.startMin)}px`,
            height: `${(band.endMin - band.startMin) * PX_PER_MIN}px`,
          }}
        >
          <span className="absolute right-2 top-1 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            {band.label}
          </span>
        </div>
      ))}

      {/* Hour grid lines + labels */}
      {hourLabels.map((h) => {
        const top = minToPx(h * 60);
        return (
          <div key={h} className="absolute left-0 right-0 flex items-center" style={{ top: `${top}px` }}>
            <span className="w-9 shrink-0 text-right text-[10px] text-slate-400 pr-1 leading-none">
              {String(h).padStart(2, "0")}
            </span>
            <div className="flex-1 border-t border-slate-200" />
          </div>
        );
      })}

      {/* Timeline blocks */}
      {blocks.map((block) => {
        const top    = minToPx(block.startMin);
        const height = blockHeightPx(block);

        if (block.kind === "event") {
          return (
            <div
              key={block.id}
              className="absolute left-10 right-2 rounded-lg bg-slate-800 border border-slate-700 px-2 flex items-center overflow-hidden"
              style={{ top: `${top}px`, height: `${height}px` }}
              title={`${block.title} · ${formatTime(Math.floor(block.startMin / 60), block.startMin % 60)}–${formatTime(Math.floor(block.endMin / 60), block.endMin % 60)}`}
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-white truncate">{block.title}</div>
                {height > 28 && (
                  <div className="text-[10px] text-slate-400 truncate">
                    {formatTime(Math.floor(block.startMin / 60), block.startMin % 60)}–{formatTime(Math.floor(block.endMin / 60), block.endMin % 60)}
                  </div>
                )}
              </div>
            </div>
          );
        }

        if (block.kind === "task" && block.taskRef) {
          const task   = block.taskRef;
          const colors = taskTypeColor(task.type);
          const isDone    = block.done;
          const isSkipped = block.skipped;

          return (
            <button
              key={block.id}
              onClick={() => !isDone && onTaskClick(task)}
              className={`absolute left-10 right-2 rounded-lg border px-2 text-left overflow-hidden transition
                ${isDone    ? "opacity-40 cursor-default bg-slate-50 border-slate-200"
                : isSkipped ? "opacity-50 cursor-default bg-slate-50 border-dashed border-slate-300"
                : `${colors.bg} ${colors.border} hover:opacity-90 cursor-pointer`}`}
              style={{ top: `${top}px`, height: `${height}px` }}
              title={`${task.title} · ${task.duration} min · ${task.type}`}
            >
              <div className="flex items-start justify-between gap-1 h-full py-1">
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-medium truncate ${isDone || isSkipped ? "text-slate-500" : colors.text} ${isDone ? "line-through" : ""}`}>
                    {task.title}
                  </div>
                  {height > 30 && (
                    <div className={`text-[10px] truncate ${isDone || isSkipped ? "text-slate-400" : colors.text} opacity-70`}>
                      {task.duration} min · {task.type}
                    </div>
                  )}
                </div>
                {isDone && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />}
              </div>
            </button>
          );
        }

        return null;
      })}

      {/* Now indicator */}
      {nowMin >= TIMELINE_START && nowMin <= TIMELINE_END && (
        <div
          className="absolute left-0 right-0 flex items-center pointer-events-none z-10"
          style={{ top: `${nowPx}px` }}
        >
          <div className="w-9 flex justify-end pr-1">
            <div className="h-2 w-2 rounded-full bg-red-500" />
          </div>
          <div className="flex-1 border-t-2 border-red-400" />
          <span className="absolute left-10 -top-4 text-[10px] font-semibold text-red-500 bg-white px-1 rounded">
            {formatTime(currentHour, currentMinute)}
          </span>
        </div>
      )}
    </div>
  );
}


// ─── Component ────────────────────────────────────────────────────────────────

type TabKey = "now" | "tasks" | "timeline";

export default function DayPlannerDecidesForYou() {
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // ── Persisted state ──────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>(() => {
    const s = readStorage<Task[]>(SK_TASKS, []);
    return s.length > 0 ? s : makeInitialTasks();
  });
  const [fixedEvents, setFixedEvents] = useState<FixedEvent[]>(() => {
    const s = readStorage<FixedEvent[]>(SK_EVENTS, []);
    return s.length > 0 ? s : makeInitialEvents();
  });
  const [energyStateValue, setEnergyStateValue] = useState<EnergyStateValue>(() => {
    if (typeof window === "undefined") return "normal";
    const s = localStorage.getItem(SK_ENERGY);
    return (s === "tired" || s === "normal" || s === "energized") ? s : "normal";
  });
  const [currentHour,    setCurrentHour]    = useState<number>(() => { const s = readStorage<number|null>(SK_HOUR,   null); return s ?? new Date().getHours(); });
  const [currentMinute,  setCurrentMinute]  = useState<number>(() => { const s = readStorage<number|null>(SK_MINUTE, null); return s ?? new Date().getMinutes(); });
  const [skippedTaskIds, setSkippedTaskIds] = useState<string[]>(() => readStorage<string[]>(SK_SKIPPED, []));
  const [learningMap,    setLearningMap]    = useState<LearningMap>(() => readStorage<LearningMap>(SK_LEARNING, {}));
  const [taskLog,        setTaskLog]        = useState<TaskLogEntry[]>(() => readStorage<TaskLogEntry[]>(SK_LOG, []));

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [activeTab,         setActiveTab]         = useState<TabKey>("now");
  const [quickMode,         setQuickMode]         = useState(false);
  const [editingTaskId,     setEditingTaskId]     = useState<string | null>(null);
  const [taskForm,          setTaskForm]          = useState<TaskForm>(emptyTaskForm);
  const [eventForm,         setEventForm]         = useState<EventForm>(emptyEventForm);
  const [showTaskModal,     setShowTaskModal]     = useState(false);
  const [showEventModal,    setShowEventModal]    = useState(false);
  const [showLearning,      setShowLearning]      = useState(false);
  const [showHistory,       setShowHistory]       = useState(false);

  const timer       = useTaskTimer();
  const energyState = ENERGY_STATES.find((s) => s.value === energyStateValue) ?? ENERGY_STATES[1];

  const eventFormError = toMinutes(eventForm.endHour, eventForm.endMinute) <= toMinutes(eventForm.startHour, eventForm.startMinute)
    ? "End time must be after start time." : null;

  // ── Derived ───────────────────────────────────────────────────────────────────
  const plan = useMemo<Plan>(
    () => buildPlan(tasks, currentHour, currentMinute, energyState, skippedTaskIds, fixedEvents, learningMap, quickMode),
    [tasks, currentHour, currentMinute, energyState, skippedTaskIds, fixedEvents, learningMap, quickMode]
  );

  const doneTasks    = tasks.filter((t) => t.done);
  const skippedTasks = tasks.filter((t) => !t.done && skippedTaskIds.includes(t.id));

  const timelineBlocks = useMemo(
    () => buildTimeline(plan.ranked, fixedEvents, doneTasks, skippedTaskIds, currentHour, currentMinute),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan.ranked, fixedEvents, tasks, skippedTaskIds, currentHour, currentMinute]
  );

  const today        = todayStr();
  const yesterday    = yesterdayStr();
  const todayLog     = taskLog.filter((e) => e.date === today);
  const yesterdayLog = taskLog.filter((e) => e.date === yesterday);
  const todayDone    = todayLog.filter((e) => e.outcome === "done");
  const todaySkipped = todayLog.filter((e) => e.outcome === "skipped");
  const yestDone     = yesterdayLog.filter((e) => e.outcome === "done");
  const yestSkipped  = yesterdayLog.filter((e) => e.outcome === "skipped");

  const learningInsights = useMemo(() =>
    Object.entries(learningMap)
      .filter(([, c]) => c.done + c.skipped >= LEARNING_MIN_EVENTS)
      .map(([key, c]) => {
        const [type, segment, energy] = key.split(":") as [TaskType, SegmentKey, EnergyStateValue];
        const total = c.done + c.skipped;
        return { key, type, segment, energy, done: c.done, skipped: c.skipped, rate: Math.round((c.done / total) * 100) };
      })
      .sort((a, b) => b.rate - a.rate),
    [learningMap]
  );

  // ── Persist helpers ───────────────────────────────────────────────────────────
  function persistTasks(next: Task[])            { setTasks(next);          writeStorage(SK_TASKS,    next); }
  function persistEvents(next: FixedEvent[])     { setFixedEvents(next);    writeStorage(SK_EVENTS,   next); }
  function persistEnergy(next: EnergyStateValue) { setEnergyStateValue(next); writeStorage(SK_ENERGY, next); }
  function persistHour(next: number)             { setCurrentHour(next);    writeStorage(SK_HOUR,     next); }
  function persistMinute(next: number)           { setCurrentMinute(next);  writeStorage(SK_MINUTE,   next); }
  function persistSkipped(next: string[])        { setSkippedTaskIds(next); writeStorage(SK_SKIPPED,  next); }
  function persistLearning(next: LearningMap)    { setLearningMap(next);    writeStorage(SK_LEARNING, next); }

  function addLogEntry(task: Task, outcome: OutcomeType) {
    const entry: TaskLogEntry = {
      id: crypto.randomUUID(), taskId: task.id, taskTitle: task.title,
      taskType: task.type, taskDuration: task.duration, outcome,
      segment: plan.segment.key, energyState: energyStateValue,
      timestamp: Date.now(), date: todayStr(),
    };
    const next = [...taskLog, entry];
    setTaskLog(next); writeStorage(SK_LOG, next);
  }

  // ── Action handlers ───────────────────────────────────────────────────────────
  function markDone(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task) { addLogEntry(task, "done"); persistLearning(recordOutcome(learningMap, task.type, plan.segment.key, energyStateValue, "done")); }
    if (timer.activeTaskId === id) timer.stopTimer();
    persistTasks(tasks.map((t) => t.id === id ? { ...t, done: true } : t));
    persistSkipped(skippedTaskIds.filter((s) => s !== id));
  }

  function skipTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task) { addLogEntry(task, "skipped"); persistLearning(recordOutcome(learningMap, task.type, plan.segment.key, energyStateValue, "skipped")); }
    if (timer.activeTaskId === id) timer.stopTimer();
    persistSkipped(skippedTaskIds.includes(id) ? skippedTaskIds : [...skippedTaskIds, id]);
  }

  function unskipTask(id: string)  { persistSkipped(skippedTaskIds.filter((s) => s !== id)); }
  function unskipAll()             { persistSkipped([]); }

  function deleteTask(id: string) {
    if (timer.activeTaskId === id) timer.stopTimer();
    persistTasks(tasks.filter((t) => t.id !== id));
    persistSkipped(skippedTaskIds.filter((s) => s !== id));
    if (editingTaskId === id) closeTaskModal();
  }

  function resetDay() { persistTasks(tasks.map((t) => ({ ...t, done: false }))); persistSkipped([]); timer.stopTimer(); }

  function handleEnergyChange(val: EnergyStateValue) {
    persistEnergy(val);
    setQuickMode(val === "tired");
  }

  function syncToNow() { const n = new Date(); persistHour(n.getHours()); persistMinute(n.getMinutes()); }

  // ── Task modal helpers ────────────────────────────────────────────────────────
  function openAddTaskModal() {
    setEditingTaskId(null);
    setTaskForm(emptyTaskForm);
    setShowTaskModal(true);
  }

  function openEditTaskModal(task: Task) {
    setEditingTaskId(task.id);
    setTaskForm({ title: task.title, type: task.type, energy: task.energy, creativity: task.creativity, duration: task.duration, importance: task.importance, urgency: task.urgency, preferredSegment: task.preferredSegment });
    setShowTaskModal(true);
    setTimeout(() => titleInputRef.current?.focus(), 80);
  }

  function closeTaskModal() { setShowTaskModal(false); setEditingTaskId(null); setTaskForm(emptyTaskForm); }

  function saveTask() {
    if (!taskForm.title.trim()) return;
    if (editingTaskId) {
      persistTasks(tasks.map((t) => t.id === editingTaskId ? { ...t, ...taskForm, title: taskForm.title.trim(), duration: Number(taskForm.duration), importance: Number(taskForm.importance), urgency: Number(taskForm.urgency) } : t));
    } else {
      persistTasks([...tasks, { id: crypto.randomUUID(), done: false, ...taskForm, title: taskForm.title.trim(), duration: Number(taskForm.duration), importance: Number(taskForm.importance), urgency: Number(taskForm.urgency) }]);
    }
    closeTaskModal();
  }

  // ── Event modal helpers ───────────────────────────────────────────────────────
  function openAddEventModal() { setEventForm(emptyEventForm); setShowEventModal(true); }
  function closeEventModal()   { setShowEventModal(false); setEventForm(emptyEventForm); }

  function saveEvent() {
    if (!eventForm.title.trim() || eventFormError) return;
    persistEvents([...fixedEvents, { id: crypto.randomUUID(), ...eventForm, startHour: Number(eventForm.startHour), startMinute: Number(eventForm.startMinute), endHour: Number(eventForm.endHour), endMinute: Number(eventForm.endMinute) }]);
    closeEventModal();
  }

  function deleteFixedEvent(id: string) { persistEvents(fixedEvents.filter((e) => e.id !== id)); }
  function handleStartTask(id: string)  { if (timer.activeTaskId === id) timer.stopTimer(); else timer.startTimer(id); }

  // ── Shared sub-components ─────────────────────────────────────────────────────

  // Modal wrapper
  function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative z-10 w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <button onClick={onClose} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">Close</button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">{children}</div>
        </div>
      </div>
    );
  }

  // Compact task row for the "My day" list
  function TaskRow({ task, index }: { task: RankedTask; index: number }) {
    const isDone    = task.done;
    const isSkipped = skippedTaskIds.includes(task.id);
    const isTimer   = timer.activeTaskId === task.id;
    const colors    = taskTypeColor(task.type);

    return (
      <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${isDone ? "opacity-50 border-slate-100 bg-slate-50" : isSkipped ? "opacity-50 border-dashed border-slate-200" : "border-slate-200 bg-white"}`}>
        {/* Rank badge */}
        <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${isDone ? "bg-emerald-100 text-emerald-700" : "bg-slate-900 text-white"}`}>
          {isDone ? "✓" : index + 1}
        </span>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${isDone ? "line-through text-slate-400" : "text-slate-900"}`}>{task.title}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-[10px] rounded-full px-1.5 py-0.5 border ${colors.bg} ${colors.border} ${colors.text}`}>{task.type}</span>
            <span className="text-[10px] text-slate-400">{task.duration} min</span>
            {isTimer && <span className="text-[10px] text-emerald-600 font-medium">{timer.formatElapsed()}</span>}
            {task.learningBonus !== 0 && (
              <span className={`text-[10px] font-medium ${task.learningBonus > 0 ? "text-teal-600" : "text-rose-500"}`}>
                {task.learningBonus > 0 ? `+${task.learningBonus}` : task.learningBonus}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {!isDone && (
            <button onClick={() => markDone(task.id)} title="Done" className="rounded-xl bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
            </button>
          )}
          {!isDone && !isSkipped && (
            <button onClick={() => handleStartTask(task.id)} title={isTimer ? "Stop" : "Start"} className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
              <PlayCircle className="h-4 w-4" />
            </button>
          )}
          {!isDone && isSkipped  && <button onClick={() => unskipTask(task.id)} title="Restore" className="rounded-xl bg-amber-50 p-2 text-amber-700 hover:bg-amber-100 text-xs px-2 py-1.5 font-medium">↩</button>}
          {!isDone && !isSkipped && <button onClick={() => skipTask(task.id)}   title="Skip"    className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 text-xs">—</button>}
          <button onClick={() => openEditTaskModal(task)} title="Edit" className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
            <Sparkles className="h-4 w-4" />
          </button>
          <button onClick={() => deleteTask(task.id)} title="Delete" className="rounded-xl bg-rose-50 p-2 text-rose-500 hover:bg-rose-100">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // Compact event row
  function EventRow({ event }: { event: FixedEvent }) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{event.title}</div>
          <div className="text-xs text-slate-400 mt-0.5">{formatTime(event.startHour, event.startMinute)} – {formatTime(event.endHour, event.endMinute)}</div>
        </div>
        <button onClick={() => deleteFixedEvent(event.id)} className="rounded-xl bg-slate-700 p-2 text-slate-300 hover:bg-slate-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Log row used in timeline tab history
  function LogRow({ entry }: { entry: TaskLogEntry }) {
    const done = entry.outcome === "done";
    return (
      <div className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${done ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-500"}`}>
        <div className="flex items-center gap-2 min-w-0">
          {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <span className="text-slate-300 shrink-0">—</span>}
          <span className={`truncate ${!done ? "line-through" : ""}`}>{entry.taskTitle}</span>
          <span className="text-xs opacity-50 shrink-0">{entry.taskDuration} min</span>
        </div>
        <span className="text-xs opacity-50 shrink-0 ml-2">{entry.segment}</span>
      </div>
    );
  }

  // ── Tab: Now ──────────────────────────────────────────────────────────────────
  function TabNow() {
    return (
      <div className="space-y-4">
        {/* Do this now */}
        <div className="rounded-3xl border border-slate-900 bg-slate-900 p-6 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Brain className="h-4 w-4" /> Planner decision
            </div>
            {quickMode && (
              <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs text-amber-300">
                <Clock className="mr-1 inline h-3 w-3" /> Quick · ≤{QUICK_TASK_MAX_DURATION} min
              </span>
            )}
          </div>

          {plan.currentEvent ? (
            <>
              <h2 className="mt-3 text-2xl font-semibold">You have: {plan.currentEvent.title}</h2>
              <p className="mt-1 text-sm text-slate-400">This time is blocked by a fixed event.</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-white/10 px-3 py-1">{plan.segment.label}</span>
                <span className="rounded-full bg-white/10 px-3 py-1">
                  {formatTime(plan.currentEvent.startHour, plan.currentEvent.startMinute)}–{formatTime(plan.currentEvent.endHour, plan.currentEvent.endMinute)}
                </span>
              </div>
            </>
          ) : plan.nowTask ? (
            <>
              <h2 className="mt-3 text-2xl font-semibold leading-snug">Do this now:<br />{plan.nowTask.title}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {plan.nowTask.learningBonus > 0 ? "Boosted by your history." : plan.nowTask.learningBonus < 0 ? "You often skip this type here — still your best fit." : "Best fit for your energy and time."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-white/10 px-3 py-1">{plan.nowTask.duration} min</span>
                <span className="rounded-full bg-white/10 px-3 py-1">{plan.nowTask.type}</span>
                <span className="rounded-full bg-white/10 px-3 py-1">⚡ {plan.nowTask.energy}</span>
                <span className="rounded-full bg-white/10 px-3 py-1">✦ {plan.nowTask.creativity}</span>
                {plan.nowTask.learningBonus !== 0 && (
                  <span className={`rounded-full px-3 py-1 ${plan.nowTask.learningBonus > 0 ? "bg-teal-500/20 text-teal-300" : "bg-rose-500/20 text-rose-300"}`}>
                    <TrendingUp className="mr-1 inline h-3 w-3" />{plan.nowTask.learningBonus > 0 ? `+${plan.nowTask.learningBonus}` : plan.nowTask.learningBonus}
                  </span>
                )}
                {timer.activeTaskId === plan.nowTask.id && (
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-300">
                    <Timer className="mr-1 inline h-3 w-3" />{timer.formatElapsed()}
                  </span>
                )}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={() => plan.nowTask && markDone(plan.nowTask.id)} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Done
                </button>
                <button onClick={() => plan.nowTask && skipTask(plan.nowTask.id)} className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20">Skip</button>
                <button onClick={() => plan.nowTask && handleStartTask(plan.nowTask.id)} className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20">
                  <PlayCircle className="h-4 w-4" />
                  {timer.activeTaskId === plan.nowTask.id ? "Stop" : "Start"}
                </button>
              </div>
            </>
          ) : (
            <div className="mt-4 text-slate-400">
              {quickMode ? `No quick tasks left (≤${QUICK_TASK_MAX_DURATION} min). Turn off quick mode to see all.` : "You're done for today. Nice work."}
            </div>
          )}
        </div>

        {/* Energy picker */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">How are you feeling?</h2>
          <div className="mt-3 grid gap-2">
            {ENERGY_STATES.map((state) => {
              const Icon  = state.icon;
              const active = state.value === energyStateValue;
              return (
                <button key={state.value} onClick={() => handleEnergyChange(state.value)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"}`}>
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 shrink-0" />
                    <div>
                      <div className="font-medium text-sm">{state.label}</div>
                      <div className={`text-xs ${active ? "text-slate-400" : "text-slate-500"}`}>
                        {state.value === "tired" ? "Quick task mode auto-enabled." : "Planner adjusts difficulty."}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick mode toggle */}
          <button onClick={() => setQuickMode((q) => !q)}
            className={`mt-3 w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${quickMode ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" />
              <div>
                <div>Quick task mode {quickMode ? "ON" : "OFF"}</div>
                <div className={`text-xs font-normal ${quickMode ? "text-amber-700" : "text-slate-500"}`}>Only shows tasks ≤ {QUICK_TASK_MAX_DURATION} min</div>
              </div>
            </div>
          </button>
        </div>

        {/* Time picker */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">What time is it?</h2>
          <div className="mt-3 space-y-3">
            <input type="range" min="6" max="22" value={currentHour} onChange={(e) => persistHour(Number(e.target.value))} className="w-full" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Hour</label>
                <input className={inputCls} type="number" min={6} max={22} value={currentHour} onChange={(e) => persistHour(Math.min(22, Math.max(6, Number(e.target.value))))} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Minute</label>
                <input className={inputCls} type="number" min={0} max={59} value={currentMinute} onChange={(e) => persistMinute(Math.min(59, Math.max(0, Number(e.target.value))))} />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-900">{formatTime(currentHour, currentMinute)}</span>
              <span className="text-slate-500">{plan.segment.label} · creativity {plan.segment.creativity}</span>
            </div>
            <button onClick={syncToNow} className={`${btnCls("ghost")} w-full text-xs`}>
              Sync to now ({formatTime(new Date().getHours(), new Date().getMinutes())})
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Tab: My day (tasks + events list) ────────────────────────────────────────
  function TabTasks() {
    const allRanked = useMemo<RankedTask[]>(() => {
      return tasks.map((t) => {
        const { base, learningBonus } = scoreTask(t, plan.segment, energyState, learningMap, quickMode);
        return { ...t, score: base + learningBonus, learningBonus };
      }).sort((a, b) => b.score - a.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasks, plan.segment, energyState, learningMap, quickMode]);

    const pending  = allRanked.filter((t) => !t.done && !skippedTaskIds.includes(t.id));
    const skipped  = allRanked.filter((t) => !t.done && skippedTaskIds.includes(t.id));
    const done     = allRanked.filter((t) => t.done);

    return (
      <div className="space-y-4">
        {/* Action bar */}
        <div className="flex gap-3">
          <button onClick={openAddEventModal} className="flex-1 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 transition">
            + Fixed event
          </button>
          <button onClick={openAddTaskModal} className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50 transition shadow-sm">
            + Task
          </button>
        </div>

        {/* Utility bar */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={resetDay}  className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200">Reset day</button>
          <button onClick={unskipAll} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200">Unskip all</button>
          <button onClick={() => { if (window.confirm("Clear all tasks?")) { persistTasks([]); persistSkipped([]); timer.stopTimer(); } }} className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-100">Clear all</button>
        </div>

        {/* Fixed events */}
        {fixedEvents.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Fixed events</div>
            <div className="space-y-2">
              {[...fixedEvents].sort((a, b) => toMinutes(a.startHour, a.startMinute) - toMinutes(b.startHour, b.startMinute)).map((ev) => (
                <EventRow key={ev.id} event={ev} />
              ))}
            </div>
          </div>
        )}

        {/* Pending tasks */}
        {pending.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Tasks — {pending.length} remaining
            </div>
            <div className="space-y-2">
              {pending.map((task, i) => <TaskRow key={task.id} task={task} index={i} />)}
            </div>
          </div>
        )}

        {/* Skipped */}
        {skipped.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Skipped</div>
            <div className="space-y-2">
              {skipped.map((task, i) => <TaskRow key={task.id} task={task} index={i} />)}
            </div>
          </div>
        )}

        {/* Done */}
        {done.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Done today — {done.length}</div>
            <div className="space-y-2">
              {done.map((task, i) => <TaskRow key={task.id} task={task} index={i} />)}
            </div>
          </div>
        )}

        {pending.length === 0 && done.length === 0 && skipped.length === 0 && fixedEvents.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            Nothing here yet — add a task or a fixed event above.
          </div>
        )}
      </div>
    );
  }

  // ── Tab: Timeline ─────────────────────────────────────────────────────────────
  function TabTimeline() {
    return (
      <div className="space-y-4">
        {/* Timeline card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-slate-600" />
              <h2 className="text-base font-semibold text-slate-900">Day timeline</h2>
            </div>
            <span className="text-xs text-slate-400">from {formatTime(currentHour, currentMinute)}</span>
          </div>

          {/* Legend */}
          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
            {[
              { label: "deep work",  bg: "bg-violet-200",  border: "border-violet-300"  },
              { label: "physical",   bg: "bg-emerald-200", border: "border-emerald-300" },
              { label: "life admin", bg: "bg-amber-200",   border: "border-amber-300"   },
              { label: "chore",      bg: "bg-slate-200",   border: "border-slate-300"   },
              { label: "recovery",   bg: "bg-rose-200",    border: "border-rose-300"    },
              { label: "event",      bg: "bg-slate-800",   border: "border-slate-700"   },
            ].map(({ label, bg, border }) => (
              <span key={label} className="flex items-center gap-1">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${bg} ${border}`} />
                {label}
              </span>
            ))}
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-red-400" /> now</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <DayTimeline
              blocks={timelineBlocks}
              currentHour={currentHour}
              currentMinute={currentMinute}
              onTaskClick={(task) => { openEditTaskModal(task); setActiveTab("tasks"); }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">Tap a task block to edit it.</p>
        </div>

        {/* History */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <button onClick={() => setShowHistory((h) => !h)} className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-slate-500" />
              <span className="text-base font-semibold text-slate-900">History</span>
              {todayLog.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {todayDone.length}✓ {todaySkipped.length}✗ today
                </span>
              )}
            </div>
            {showHistory ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {showHistory && (
            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Today</div>
                {todayLog.length === 0
                  ? <div className="text-sm text-slate-400">No activity yet today.</div>
                  : <div className="space-y-1.5">{[...todayDone, ...todaySkipped].sort((a, b) => a.timestamp - b.timestamp).map((e) => <LogRow key={e.id} entry={e} />)}</div>}
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Yesterday{yesterdayLog.length > 0 ? ` — ${yestDone.length}✓ ${yestSkipped.length}✗` : ""}
                </div>
                {yesterdayLog.length === 0
                  ? <div className="text-sm text-slate-400">No activity logged yesterday.</div>
                  : <div className="space-y-1.5">{[...yestDone, ...yestSkipped].sort((a, b) => a.timestamp - b.timestamp).map((e) => <LogRow key={e.id} entry={e} />)}</div>}
              </div>
            </div>
          )}
        </div>

        {/* Learning insights */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <button onClick={() => setShowLearning((s) => !s)} className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-slate-500" />
              <span className="text-base font-semibold text-slate-900">What it&apos;s learned</span>
              {learningInsights.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{learningInsights.length} patterns</span>
              )}
            </div>
            {showLearning ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {showLearning && (
            <div className="mt-4">
              {learningInsights.length === 0
                ? <p className="text-sm text-slate-400">Complete or skip at least {LEARNING_MIN_EVENTS} tasks in a context to see patterns.</p>
                : <div className="space-y-3">
                    {learningInsights.map((ins) => (
                      <div key={ins.key} className="rounded-2xl border border-slate-100 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-slate-900 capitalize">{ins.type}</div>
                            <div className="text-xs text-slate-400 capitalize">{ins.segment} · {ins.energy} · {ins.done + ins.skipped} sessions</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-medium ${ins.rate >= 70 ? "text-emerald-700" : ins.rate <= 40 ? "text-rose-600" : "text-slate-700"}`}>{ins.rate}%</div>
                            <div className="text-xs text-slate-400">{ins.done}✓ {ins.skipped}✗</div>
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full rounded-full ${ins.rate >= 70 ? "bg-emerald-400" : ins.rate <= 40 ? "bg-rose-400" : "bg-amber-400"}`} style={{ width: `${ins.rate}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>}
              <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-400">
                Subtle ±{LEARNING_MAX_BONUS}pt nudge. Needs ≥{LEARNING_MIN_EVENTS} events per context.
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Task form (shared between modal and edit) ─────────────────────────────────
  function TaskFormFields() {
    return (
      <>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Task name</label>
          <input ref={titleInputRef} className={inputCls} placeholder="e.g. Write essay intro"
            value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
            <select className={inputCls} value={taskForm.type} onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value as TaskType })}>
              {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Best time</label>
            <select className={inputCls} value={taskForm.preferredSegment} onChange={(e) => setTaskForm({ ...taskForm, preferredSegment: e.target.value as SegmentKey })}>
              {DAY_SEGMENTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Energy needed</label>
            <select className={inputCls} value={taskForm.energy} onChange={(e) => setTaskForm({ ...taskForm, energy: e.target.value as EnergyLevel })}>
              {(["low", "medium", "high"] as EnergyLevel[]).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Creativity</label>
            <select className={inputCls} value={taskForm.creativity} onChange={(e) => setTaskForm({ ...taskForm, creativity: e.target.value as CreativityLevel })}>
              {(["low", "medium", "high"] as CreativityLevel[]).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Duration (minutes)</label>
          <input className={inputCls} type="text" inputMode="numeric" placeholder="e.g. 45"
            value={taskForm.duration === 0 ? "" : taskForm.duration}
            onChange={(e) => { const r = e.target.value.replace(/[^0-9]/g, ""); setTaskForm({ ...taskForm, duration: r === "" ? 0 : Number(r) }); }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Importance</label>
            <select className={inputCls} value={taskForm.importance} onChange={(e) => setTaskForm({ ...taskForm, importance: Number(e.target.value) })}>
              <option value={1}>1 — barely matters</option>
              <option value={2}>2 — nice to do</option>
              <option value={3}>3 — should do</option>
              <option value={4}>4 — important</option>
              <option value={5}>5 — critical</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Urgency</label>
            <select className={inputCls} value={taskForm.urgency} onChange={(e) => setTaskForm({ ...taskForm, urgency: Number(e.target.value) })}>
              <option value={1}>1 — no deadline</option>
              <option value={2}>2 — this week</option>
              <option value={3}>3 — in a few days</option>
              <option value={4}>4 — tomorrow</option>
              <option value={5}>5 — due today</option>
            </select>
          </div>
        </div>
        <button onClick={saveTask} disabled={!taskForm.title.trim()}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition">
          <Sparkles className="mr-2 inline h-4 w-4" />
          {editingTaskId ? "Save changes" : "Add task"}
        </button>
      </>
    );
  }

  // ── Event form fields ─────────────────────────────────────────────────────────
  function EventFormFields() {
    return (
      <>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Event name</label>
          <input className={inputCls} placeholder="e.g. Lecture"
            value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} />
        </div>
        {(["Start", "End"] as const).map((label) => {
          const isEnd = label === "End";
          return (
            <div key={label}>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{label} time</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Hour</label>
                  <input className={inputCls} type="number" min={6} max={isEnd ? 23 : 22}
                    value={isEnd ? eventForm.endHour : eventForm.startHour}
                    onChange={(e) => setEventForm({ ...eventForm, [isEnd ? "endHour" : "startHour"]: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Minute</label>
                  <input className={inputCls} type="number" min={0} max={59}
                    value={isEnd ? eventForm.endMinute : eventForm.startMinute}
                    onChange={(e) => setEventForm({ ...eventForm, [isEnd ? "endMinute" : "startMinute"]: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          );
        })}
        {eventFormError && <p className="text-xs text-red-600">{eventFormError}</p>}
        {!eventFormError && eventForm.title.trim() && (
          <p className="text-xs text-slate-400">{formatTime(eventForm.startHour, eventForm.startMinute)} → {formatTime(eventForm.endHour, eventForm.endMinute)}</p>
        )}
        <button onClick={saveEvent} disabled={!!eventFormError || !eventForm.title.trim()}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition">
          Add event
        </button>
      </>
    );
  }

  // ── Tab bar ───────────────────────────────────────────────────────────────────
  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "now",      label: "Now",      icon: <Brain className="h-5 w-5" />        },
    { key: "tasks",    label: "My day",   icon: <CheckCircle2 className="h-5 w-5" /> },
    { key: "timeline", label: "Timeline", icon: <CalendarDays className="h-5 w-5" /> },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Content area — padded so it doesn't hide behind the tab bar */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="mx-auto max-w-2xl px-4 pt-6">
          {activeTab === "now"      && <TabNow />}
          {activeTab === "tasks"    && <TabTasks />}
          {activeTab === "timeline" && <TabTimeline />}
        </div>
      </div>

      {/* Sticky bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl">
          {TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition ${activeTab === key ? "text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
            >
              <span className={`transition ${activeTab === key ? "text-slate-900" : "text-slate-400"}`}>{icon}</span>
              {label}
              {activeTab === key && <span className="h-1 w-6 rounded-full bg-slate-900" />}
            </button>
          ))}
        </div>
      </nav>

      {/* Modals */}
      {showTaskModal && (
        <Modal title={editingTaskId ? "Edit task" : "Add task"} onClose={closeTaskModal}>
          <TaskFormFields />
        </Modal>
      )}
      {showEventModal && (
        <Modal title="Add fixed event" onClose={closeEventModal}>
          <EventFormFields />
        </Modal>
      )}
    </div>
  );
}
