"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type TabKey = "now" | "tasks" | "timeline";

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
  date: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ENERGY_STATES: EnergyState[] = [
  { value: "tired",     label: "Tired",     icon: Moon, multiplier: 0.7  },
  { value: "normal",    label: "Normal",    icon: Sun,  multiplier: 1    },
  { value: "energized", label: "Energized", icon: Zap,  multiplier: 1.25 },
];

const ENERGY_SCORE: Record<EnergyLevel, number>         = { low: 1, medium: 2, high: 3 };
const CREATIVITY_SCORE: Record<CreativityLevel, number> = { low: 1, medium: 2, high: 3 };
const TASK_TYPES: TaskType[] = ["deep work", "physical", "life admin", "chore", "recovery"];

const DAY_SEGMENTS: DaySegment[] = [
  { key: "morning",   label: "Morning",   start: 6,  end: 11, energy: "high",   creativity: "medium", goodTypes: ["physical", "deep work"]  },
  { key: "midday",    label: "Midday",    start: 11, end: 15, energy: "high",   creativity: "high",   goodTypes: ["deep work", "life admin"] },
  { key: "afternoon", label: "Afternoon", start: 15, end: 18, energy: "medium", creativity: "high",   goodTypes: ["life admin", "physical"]  },
  { key: "evening",   label: "Evening",   start: 18, end: 23, energy: "low",    creativity: "low",    goodTypes: ["chore", "recovery"]       },
];

const QUICK_TASK_MAX_DURATION = 15;
const LEARNING_MAX_BONUS      = 8;
const LEARNING_MIN_EVENTS     = 3;

const SK_TASKS    = "planner-tasks-v3";
const SK_EVENTS   = "planner-fixed-events-v2";
const SK_ENERGY   = "planner-energy-v1";
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
  const centred    = (counts.done / total - 0.5) * 2;
  const confidence = Math.min(total / 20, 1);
  return Math.round(centred * LEARNING_MAX_BONUS * confidence);
}

function recordOutcome(lm: LearningMap, type: TaskType, seg: SegmentKey, energy: EnergyStateValue, outcome: OutcomeType): LearningMap {
  const key  = lKey(type, seg, energy);
  const prev = lm[key] ?? { done: 0, skipped: 0 };
  return { ...lm, [key]: { ...prev, [outcome]: prev[outcome] + 1 } };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreTask(
  task: Task, seg: DaySegment, es: EnergyState, lm: LearningMap,
  quickMode: boolean, nowMin: number, events: FixedEvent[]
): { base: number; learningBonus: number } {
  if (task.done) return { base: -9999, learningBonus: 0 };
  if (quickMode && task.duration > QUICK_TASK_MAX_DURATION) return { base: -500, learningBonus: 0 };

  // FIX: penalise tasks that would overlap an upcoming fixed event
  const taskEndMin = nowMin + task.duration;
  const overlapsEvent = events.some((e) => {
    const evStart = toMinutes(e.startHour, e.startMinute);
    const evEnd   = toMinutes(e.endHour,   e.endMinute);
    return nowMin < evEnd && taskEndMin > evStart;
  });
  if (overlapsEvent) return { base: -200, learningBonus: 0 };

  let s = task.importance * 10 + task.urgency * 8;
  s += 24 - Math.abs(ENERGY_SCORE[seg.energy] * es.multiplier - ENERGY_SCORE[task.energy]) * 10;

  const cgap = Math.abs(CREATIVITY_SCORE[seg.creativity] - CREATIVITY_SCORE[task.creativity]);
  s += cgap === 0 ? 20 : cgap === 1 ? 8 : -8;

  if (task.preferredSegment === seg.key) s += 18;
  if (seg.goodTypes.includes(task.type))  s += 12;
  if (es.value === "tired"     && task.energy === "high") s -= 18;
  if (es.value === "energized" && task.energy === "low")  s -= 6;
  if (task.duration <= 30)                                s += 4;
  if (es.value === "tired" && task.duration > 60)         s -= 10;
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
  const remaining    = tasks.filter((t) => !t.done && !skipped.includes(t.id));
  const ranked: RankedTask[] = remaining
    .map((t) => {
      const { base, learningBonus } = scoreTask(t, seg, es, lm, quickMode, now, events);
      return { ...t, score: base + learningBonus, learningBonus };
    })
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

const emptyTaskForm: TaskForm   = { title: "", type: "deep work", energy: "medium", creativity: "medium", duration: 30, importance: 3, urgency: 3, preferredSegment: "midday" };
const emptyEventForm: EventForm = { title: "", startHour: 9, startMinute: 0, endHour: 10, endMinute: 0 };

// ─── Styles ───────────────────────────────────────────────────────────────────

// FIX: py-3 text-base → ~48px height, number pad on mobile
const inputCls = "w-full rounded-xl border border-[#F5CF82] bg-white px-3 py-3 text-base outline-none transition focus:border-[#82A8F5]";
const cardCls  = "rounded-3xl border border-[#F5CF82] bg-white p-4 shadow-sm";

function btnCls(kind: "primary" | "secondary" | "ghost" = "primary"): string {
  if (kind === "secondary") return "inline-flex items-center justify-center min-h-[44px] rounded-2xl border border-[#F5CF82] bg-white px-4 py-2 text-sm font-medium text-[#3D2B1F] transition hover:bg-[#FFFBF0]";
  if (kind === "ghost")     return "inline-flex items-center justify-center min-h-[44px] rounded-2xl bg-[#FFFBF0] px-4 py-2 text-sm font-medium text-[#3D2B1F] transition hover:bg-[#FFF5D6]";
  return "inline-flex items-center justify-center min-h-[44px] rounded-2xl bg-[#F5CF82] px-4 py-2 text-sm font-medium text-[#3D2B1F] transition hover:bg-[#E8BB60]";
}

function pillCls(active: boolean): string {
  return active
    ? "rounded-2xl border border-[#F5CF82] bg-[#F5CF82] px-4 py-3 text-left text-[#3D2B1F] min-h-[52px] w-full"
    : "rounded-2xl border border-[#F5CF82] bg-white px-4 py-3 text-left text-[#3D2B1F] hover:bg-[#FFFBF0] min-h-[52px] w-full";
}

function taskTypeColor(type: TaskType): { bg: string; border: string; text: string } {
  switch (type) {
    case "deep work":  return { bg: "bg-[#ED98C3]", border: "border-[#D870A8]", text: "text-[#3D2B1F]" };
    case "physical":   return { bg: "bg-[#ED9898]", border: "border-[#D86868]", text: "text-[#3D2B1F]" };
    case "life admin": return { bg: "bg-[#EDC398]", border: "border-[#D8A068]", text: "text-[#3D2B1F]" };
    case "chore":      return { bg: "bg-[#F9E5AB]", border: "border-[#E8C860]", text: "text-[#3D2B1F]" };
    case "recovery":   return { bg: "bg-[#DBED9D]", border: "border-[#A8D860]", text: "text-[#3D2B1F]" };
  }
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

interface TimelineBlock {
  kind: "task" | "event" | "gap";
  id: string;
  title: string;
  startMin: number;
  endMin: number;
  taskRef?: RankedTask;
  eventRef?: FixedEvent;
  done?: boolean;
  skipped?: boolean;
}

const TIMELINE_START = 6 * 60;
const TIMELINE_END   = 23 * 60;
const PX_PER_MIN     = 1.4;

const SEGMENT_BANDS = [
  { startMin: 6*60,  endMin: 11*60, color: "bg-[#FFFBF0]", label: "Morning"   },
  { startMin: 11*60, endMin: 15*60, color: "bg-[#F0F4FF]", label: "Midday"    },
  { startMin: 15*60, endMin: 18*60, color: "bg-[#FFFBF0]", label: "Afternoon" },
  { startMin: 18*60, endMin: 23*60, color: "bg-[#F0F4FF]", label: "Evening"   },
];

function buildTimeline(
  rankedTasks: RankedTask[], fixedEvents: FixedEvent[], doneTasks: Task[],
  skippedIds: string[], currentHour: number, currentMinute: number
): TimelineBlock[] {
  const blocks       = [] as TimelineBlock[];
  const sortedEvents = [...fixedEvents].sort((a, b) => toMinutes(a.startHour, a.startMinute) - toMinutes(b.startHour, b.startMinute));
  const busy         = sortedEvents.map((e) => ({ startMin: toMinutes(e.startHour, e.startMinute), endMin: toMinutes(e.endHour, e.endMinute) }));

  for (const ev of sortedEvents) {
    blocks.push({ kind: "event", id: ev.id, title: ev.title, startMin: toMinutes(ev.startHour, ev.startMinute), endMin: toMinutes(ev.endHour, ev.endMinute), eventRef: ev });
  }

  const doneIds  = new Set(doneTasks.map((t) => t.id));
  const nowMin   = toMinutes(currentHour, currentMinute);
  let doneCursor = Math.max(TIMELINE_START, nowMin);

  for (const task of [...doneTasks].reverse()) {
    const dur = Math.max(task.duration, 5);
    const end = doneCursor;
    const start = Math.max(TIMELINE_START, end - dur);
    if (start >= TIMELINE_START) {
      blocks.push({ kind: "task", id: `done-${task.id}`, title: task.title, startMin: start, endMin: end, taskRef: { ...task, score: 0, learningBonus: 0 }, done: true });
      doneCursor = start;
    }
  }

  let cursor = Math.max(nowMin, TIMELINE_START);
  for (const task of rankedTasks) {
    if (doneIds.has(task.id)) continue;
    const dur = Math.max(task.duration, 5);
    let safeStart = cursor;
    let iters = 0;
    while (iters < 20) {
      iters++;
      const overlap = busy.find((b) => safeStart < b.endMin && safeStart + dur > b.startMin);
      if (!overlap) break;
      safeStart = overlap.endMin;
    }
    if (safeStart + dur <= TIMELINE_END) {
      blocks.push({ kind: "task", id: task.id, title: task.title, startMin: safeStart, endMin: safeStart + dur, taskRef: task, skipped: skippedIds.includes(task.id) });
      cursor = safeStart + dur;
    } else break;
  }

  return blocks.sort((a, b) => a.startMin - b.startMin);
}

// ─── Timer hook ───────────────────────────────────────────────────────────────

function useTaskTimer() {
  const [activeTaskId,   setActiveTaskId]   = useState<string | null>(null);
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

// ─── DayTimeline — defined OUTSIDE main component so it never re-mounts ───────

interface DayTimelineProps {
  blocks: TimelineBlock[];
  currentHour: number;
  currentMinute: number;
  onTaskClick: (task: RankedTask) => void;
}

function DayTimeline({ blocks, currentHour, currentMinute, onTaskClick }: DayTimelineProps) {
  const totalPx  = (TIMELINE_END - TIMELINE_START) * PX_PER_MIN;
  const nowMin   = toMinutes(currentHour, currentMinute);
  const nowPx    = Math.min(Math.max((nowMin - TIMELINE_START) * PX_PER_MIN, 0), totalPx);
  const hourLabels: number[] = [];
  for (let h = 6; h <= 23; h += 2) hourLabels.push(h);
  const minToPx    = (m: number) => (m - TIMELINE_START) * PX_PER_MIN;
  const blockH     = (b: TimelineBlock) => Math.max((b.endMin - b.startMin) * PX_PER_MIN, 24);

  return (
    <div className="relative select-none" style={{ height: `${totalPx}px` }}>
      {SEGMENT_BANDS.map((band) => (
        <div key={band.label} className={`absolute left-10 right-0 ${band.color}`}
          style={{ top: `${minToPx(band.startMin)}px`, height: `${(band.endMin - band.startMin) * PX_PER_MIN}px` }}>
          <span className="absolute right-2 top-1 text-[10px] font-medium text-[#B8CCFA] uppercase tracking-wider">{band.label}</span>
        </div>
      ))}
      {hourLabels.map((h) => (
        <div key={h} className="absolute left-0 right-0 flex items-center" style={{ top: `${minToPx(h * 60)}px` }}>
          <span className="w-9 shrink-0 text-right text-[10px] text-[#B8CCFA] pr-1 leading-none">{String(h).padStart(2, "0")}</span>
          <div className="flex-1 border-t border-[#F5CF82]" />
        </div>
      ))}
      {blocks.map((block) => {
        const top    = minToPx(block.startMin);
        const height = blockH(block);
        if (block.kind === "event") {
          return (
            <div key={block.id} className="absolute left-10 right-2 rounded-lg bg-[#F5CF82] border border-[#E8BB60] px-2 flex items-center overflow-hidden"
              style={{ top: `${top}px`, height: `${height}px` }}>
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#3D2B1F] truncate">{block.title}</div>
                {height > 28 && <div className="text-[10px] text-[#7A6050] truncate">{formatTime(Math.floor(block.startMin/60), block.startMin%60)}–{formatTime(Math.floor(block.endMin/60), block.endMin%60)}</div>}
              </div>
            </div>
          );
        }
        if (block.kind === "task" && block.taskRef) {
          const task = block.taskRef;
          const colors = taskTypeColor(task.type);
          const isDone = block.done, isSkipped = block.skipped;
          return (
            <button key={block.id} onClick={() => !isDone && onTaskClick(task)}
              className={`absolute left-10 right-2 rounded-lg border px-2 text-left overflow-hidden transition ${
                isDone    ? "opacity-40 cursor-default bg-white border-[#F5CF82]"
                : isSkipped ? "opacity-50 cursor-default bg-white border-dashed border-[#E8BB60]"
                : `${colors.bg} ${colors.border} hover:opacity-90 cursor-pointer`}`}
              style={{ top: `${top}px`, height: `${height}px` }}>
              <div className="flex items-start h-full py-1">
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-medium truncate ${isDone || isSkipped ? "text-[#B8CCFA]" : colors.text} ${isDone ? "line-through" : ""}`}>{task.title}</div>
                  {height > 30 && <div className={`text-[10px] truncate ${isDone || isSkipped ? "text-[#B8CCFA]" : colors.text} opacity-70`}>{task.duration} min</div>}
                </div>
                {isDone && <CheckCircle2 className="h-3 w-3 text-[#82A8F5] shrink-0 mt-0.5" />}
              </div>
            </button>
          );
        }
        return null;
      })}
      {nowMin >= TIMELINE_START && nowMin <= TIMELINE_END && (
        <div className="absolute left-0 right-0 flex items-center pointer-events-none z-10" style={{ top: `${nowPx}px` }}>
          <div className="w-9 flex justify-end pr-1"><div className="h-2 w-2 rounded-full bg-[#82A8F5]" /></div>
          <div className="flex-1 border-t-2 border-[#82A8F5]" />
          <span className="absolute left-10 -top-4 text-[10px] font-semibold text-[#4070CC] bg-white px-1 rounded">{formatTime(currentHour, currentMinute)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Modal — defined OUTSIDE main component ───────────────────────────────────

interface ModalProps { title: string; onClose: () => void; children: React.ReactNode; }

function Modal({ title, onClose, children }: ModalProps) {
  // FIX: lock body scroll while modal open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#FFF5D6] px-6 py-4">
          <h2 className="text-base font-semibold text-[#3D2B1F]">{title}</h2>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#FFFBF0] text-sm font-medium text-[#7A6050] hover:bg-[#FFF5D6] px-3">
            Close
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

// ─── Form components — defined OUTSIDE to fix the typing/focus-loss bug ───────

interface TaskFormFieldsProps {
  taskForm: TaskForm;
  setTaskForm: React.Dispatch<React.SetStateAction<TaskForm>>;
  editingTaskId: string | null;
  onSave: () => void;
  titleRef: React.RefObject<HTMLInputElement | null>;
}

function TaskFormFields({ taskForm, setTaskForm, editingTaskId, onSave, titleRef }: TaskFormFieldsProps) {
  return (
    <>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">Task name</label>
        <input ref={titleRef} className={inputCls} placeholder="e.g. Write essay intro"
          value={taskForm.title}
          autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck={false}
          onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">Type</label>
          <select className={inputCls} value={taskForm.type} onChange={(e) => setTaskForm((f) => ({ ...f, type: e.target.value as TaskType }))}>
            {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">Best time</label>
          <select className={inputCls} value={taskForm.preferredSegment} onChange={(e) => setTaskForm((f) => ({ ...f, preferredSegment: e.target.value as SegmentKey }))}>
            {DAY_SEGMENTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">Energy needed</label>
          <select className={inputCls} value={taskForm.energy} onChange={(e) => setTaskForm((f) => ({ ...f, energy: e.target.value as EnergyLevel }))}>
            {(["low", "medium", "high"] as EnergyLevel[]).map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">Creativity</label>
          <select className={inputCls} value={taskForm.creativity} onChange={(e) => setTaskForm((f) => ({ ...f, creativity: e.target.value as CreativityLevel }))}>
            {(["low", "medium", "high"] as CreativityLevel[]).map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">Duration (minutes)</label>
        <input className={inputCls} type="text" inputMode="numeric" placeholder="e.g. 45"
          value={taskForm.duration === 0 ? "" : taskForm.duration}
          onChange={(e) => { const r = e.target.value.replace(/[^0-9]/g, ""); setTaskForm((f) => ({ ...f, duration: r === "" ? 0 : Number(r) })); }} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">Importance</label>
          <select className={inputCls} value={taskForm.importance} onChange={(e) => setTaskForm((f) => ({ ...f, importance: Number(e.target.value) }))}>
            <option value={1}>1 — barely matters</option>
            <option value={2}>2 — nice to do</option>
            <option value={3}>3 — should do</option>
            <option value={4}>4 — important</option>
            <option value={5}>5 — critical</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">Urgency</label>
          <select className={inputCls} value={taskForm.urgency} onChange={(e) => setTaskForm((f) => ({ ...f, urgency: Number(e.target.value) }))}>
            <option value={1}>1 — no deadline</option>
            <option value={2}>2 — this week</option>
            <option value={3}>3 — in a few days</option>
            <option value={4}>4 — tomorrow</option>
            <option value={5}>5 — due today</option>
          </select>
        </div>
      </div>
      <button onClick={onSave} disabled={!taskForm.title.trim()}
        className="w-full min-h-[48px] rounded-2xl bg-[#F5CF82] px-4 text-base font-medium text-[#3D2B1F] hover:bg-[#E8BB60] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2">
        <Sparkles className="h-4 w-4" />
        {editingTaskId ? "Save changes" : "Add task"}
      </button>
    </>
  );
}

interface EventFormFieldsProps {
  eventForm: EventForm;
  setEventForm: React.Dispatch<React.SetStateAction<EventForm>>;
  eventFormError: string | null;
  onSave: () => void;
}

function EventFormFields({ eventForm, setEventForm, eventFormError, onSave }: EventFormFieldsProps) {
  return (
    <>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">Event name</label>
        <input className={inputCls} placeholder="e.g. Lecture"
          value={eventForm.title}
          autoComplete="off" autoCorrect="off" spellCheck={false}
          onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))} />
      </div>
      {(["Start", "End"] as const).map((label) => {
        const isEnd = label === "End";
        return (
          <div key={label}>
            <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">{label} time</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[#B8CCFA]">Hour (0–23)</label>
                <input className={inputCls} type="text" inputMode="numeric"
                  value={isEnd ? eventForm.endHour : eventForm.startHour}
                  onChange={(e) => {
                    const v = Math.min(23, Math.max(0, Number(e.target.value.replace(/[^0-9]/g, "") || "0")));
                    setEventForm((f) => ({ ...f, [isEnd ? "endHour" : "startHour"]: v }));
                  }} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#B8CCFA]">Minute (0–59)</label>
                <input className={inputCls} type="text" inputMode="numeric"
                  value={isEnd ? eventForm.endMinute : eventForm.startMinute}
                  onChange={(e) => {
                    const v = Math.min(59, Math.max(0, Number(e.target.value.replace(/[^0-9]/g, "") || "0")));
                    setEventForm((f) => ({ ...f, [isEnd ? "endMinute" : "startMinute"]: v }));
                  }} />
              </div>
            </div>
          </div>
        );
      })}
      {eventFormError && <p className="text-sm text-red-500">{eventFormError}</p>}
      {!eventFormError && eventForm.title.trim() && (
        <p className="text-sm text-[#B8CCFA]">{formatTime(eventForm.startHour, eventForm.startMinute)} → {formatTime(eventForm.endHour, eventForm.endMinute)}</p>
      )}
      <button onClick={onSave} disabled={!!eventFormError || !eventForm.title.trim()}
        className="w-full min-h-[48px] rounded-2xl bg-[#F5CF82] px-4 text-base font-medium text-[#3D2B1F] hover:bg-[#E8BB60] disabled:opacity-40 disabled:cursor-not-allowed transition">
        Add event
      </button>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DayPlannerDecidesForYou() {
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [tasks,          setTasks]          = useState<Task[]>(() => { const s = readStorage<Task[]>(SK_TASKS, []); return s.length > 0 ? s : makeInitialTasks(); });
  const [fixedEvents,    setFixedEvents]    = useState<FixedEvent[]>(() => { const s = readStorage<FixedEvent[]>(SK_EVENTS, []); return s.length > 0 ? s : makeInitialEvents(); });
  const [energyStateValue, setEnergyStateValue] = useState<EnergyStateValue>(() => {
    if (typeof window === "undefined") return "normal";
    const s = localStorage.getItem(SK_ENERGY);
    return (s === "tired" || s === "normal" || s === "energized") ? s : "normal";
  });
  const [currentHour,    setCurrentHour]    = useState(() => new Date().getHours());
  const [currentMinute,  setCurrentMinute]  = useState(() => new Date().getMinutes());
  const [skippedTaskIds, setSkippedTaskIds] = useState<string[]>(() => readStorage<string[]>(SK_SKIPPED, []));
  const [learningMap,    setLearningMap]    = useState<LearningMap>(() => readStorage<LearningMap>(SK_LEARNING, {}));
  const [taskLog,        setTaskLog]        = useState<TaskLogEntry[]>(() => readStorage<TaskLogEntry[]>(SK_LOG, []));

  // Auto-sync clock
  useEffect(() => {
    function tick() { const n = new Date(); setCurrentHour(n.getHours()); setCurrentMinute(n.getMinutes()); }
    const msUntilNext = (60 - new Date().getSeconds()) * 1000;
    const t = setTimeout(() => { tick(); const i = setInterval(tick, 60_000); return () => clearInterval(i); }, msUntilNext);
    return () => clearTimeout(t);
  }, []);

  const [activeTab,      setActiveTab]      = useState<TabKey>("now");
  const [quickMode,      setQuickMode]      = useState(false);
  const [editingTaskId,  setEditingTaskId]  = useState<string | null>(null);
  const [taskForm,       setTaskForm]       = useState<TaskForm>(emptyTaskForm);
  const [eventForm,      setEventForm]      = useState<EventForm>(emptyEventForm);
  const [showTaskModal,  setShowTaskModal]  = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showLearning,   setShowLearning]   = useState(false);
  const [showHistory,    setShowHistory]    = useState(false);

  const timer       = useTaskTimer();
  const energyState = ENERGY_STATES.find((s) => s.value === energyStateValue) ?? ENERGY_STATES[1];

  const eventFormError = toMinutes(eventForm.endHour, eventForm.endMinute) <= toMinutes(eventForm.startHour, eventForm.startMinute)
    ? "End time must be after start time." : null;

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

  const today     = todayStr();
  const yesterday = yesterdayStr();
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

  const nowMin = toMinutes(currentHour, currentMinute);

  const allRanked = useMemo<RankedTask[]>(() =>
    tasks.map((t) => {
      const { base, learningBonus } = scoreTask(t, plan.segment, energyState, learningMap, quickMode, nowMin, fixedEvents);
      return { ...t, score: base + learningBonus, learningBonus };
    }).sort((a, b) => b.score - a.score),
    [tasks, plan.segment, energyState, learningMap, quickMode, nowMin, fixedEvents] // eslint-disable-line
  );

  const pending = allRanked.filter((t) => !t.done && !skippedTaskIds.includes(t.id));
  const skipped = allRanked.filter((t) => !t.done &&  skippedTaskIds.includes(t.id));
  const done    = allRanked.filter((t) => t.done);

  // Persist
  function persistTasks(next: Task[])            { setTasks(next);          writeStorage(SK_TASKS,    next); }
  function persistEvents(next: FixedEvent[])     { setFixedEvents(next);    writeStorage(SK_EVENTS,   next); }
  function persistEnergy(next: EnergyStateValue) { setEnergyStateValue(next); writeStorage(SK_ENERGY, next); }
  function persistSkipped(next: string[])        { setSkippedTaskIds(next); writeStorage(SK_SKIPPED,  next); }
  function persistLearning(next: LearningMap)    { setLearningMap(next);    writeStorage(SK_LEARNING, next); }

  function addLogEntry(task: Task, outcome: OutcomeType) {
    const entry: TaskLogEntry = {
      id: crypto.randomUUID(), taskId: task.id, taskTitle: task.title, taskType: task.type,
      taskDuration: task.duration, outcome, segment: plan.segment.key, energyState: energyStateValue,
      timestamp: Date.now(), date: todayStr(),
    };
    const next = [...taskLog, entry];
    setTaskLog(next); writeStorage(SK_LOG, next);
  }

  // Action handlers — wrapped in useCallback so TaskRow doesn't force re-renders
  const markDone = useCallback((id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (task) { addLogEntry(task, "done"); persistLearning(recordOutcome(learningMap, task.type, plan.segment.key, energyStateValue, "done")); }
    if (timer.activeTaskId === id) timer.stopTimer();
    persistTasks(tasks.map((t) => t.id === id ? { ...t, done: true } : t));
    persistSkipped(skippedTaskIds.filter((s) => s !== id));
  }, [tasks, skippedTaskIds, learningMap, energyStateValue, plan.segment.key, timer]); // eslint-disable-line

  const skipTask = useCallback((id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (task) { addLogEntry(task, "skipped"); persistLearning(recordOutcome(learningMap, task.type, plan.segment.key, energyStateValue, "skipped")); }
    if (timer.activeTaskId === id) timer.stopTimer();
    persistSkipped(skippedTaskIds.includes(id) ? skippedTaskIds : [...skippedTaskIds, id]);
  }, [tasks, skippedTaskIds, learningMap, energyStateValue, plan.segment.key, timer]); // eslint-disable-line

  const unskipTask   = useCallback((id: string) => persistSkipped(skippedTaskIds.filter((s) => s !== id)), [skippedTaskIds]); // eslint-disable-line
  const unskipAll    = useCallback(() => persistSkipped([]), []); // eslint-disable-line

  const deleteTask = useCallback((id: string) => {
    if (timer.activeTaskId === id) timer.stopTimer();
    persistTasks(tasks.filter((t) => t.id !== id));
    persistSkipped(skippedTaskIds.filter((s) => s !== id));
    if (editingTaskId === id) closeTaskModal();
  }, [tasks, skippedTaskIds, timer, editingTaskId]); // eslint-disable-line

  const handleStartTask = useCallback((id: string) => {
    if (timer.activeTaskId === id) timer.stopTimer(); else timer.startTimer(id);
  }, [timer]);

  function handleEnergyChange(val: EnergyStateValue) { persistEnergy(val); setQuickMode(val === "tired"); }
  function resetDay() { persistTasks(tasks.map((t) => ({ ...t, done: false }))); persistSkipped([]); timer.stopTimer(); }

  function openAddTaskModal()  { setEditingTaskId(null); setTaskForm(emptyTaskForm); setShowTaskModal(true); setTimeout(() => titleInputRef.current?.focus(), 100); }
  function openEditTaskModal(task: Task) {
    setEditingTaskId(task.id);
    setTaskForm({ title: task.title, type: task.type, energy: task.energy, creativity: task.creativity, duration: task.duration, importance: task.importance, urgency: task.urgency, preferredSegment: task.preferredSegment });
    setShowTaskModal(true);
    setTimeout(() => titleInputRef.current?.focus(), 100);
  }
  function closeTaskModal()  { setShowTaskModal(false); setEditingTaskId(null); setTaskForm(emptyTaskForm); }

  function saveTask() {
    if (!taskForm.title.trim()) return;
    if (editingTaskId) {
      persistTasks(tasks.map((t) => t.id === editingTaskId ? { ...t, ...taskForm, title: taskForm.title.trim(), duration: Number(taskForm.duration) } : t));
    } else {
      persistTasks([...tasks, { id: crypto.randomUUID(), done: false, ...taskForm, title: taskForm.title.trim(), duration: Number(taskForm.duration) }]);
    }
    closeTaskModal();
  }

  function openAddEventModal() { setEventForm(emptyEventForm); setShowEventModal(true); }
  function closeEventModal()   { setShowEventModal(false); setEventForm(emptyEventForm); }
  function saveEvent() {
    if (!eventForm.title.trim() || eventFormError) return;
    persistEvents([...fixedEvents, { id: crypto.randomUUID(), ...eventForm }]);
    closeEventModal();
  }
  function deleteFixedEvent(id: string) { persistEvents(fixedEvents.filter((e) => e.id !== id)); }

  // ── Task row — uses stable callbacks from above ────────────────────────────
  function TaskRow({ task, index }: { task: RankedTask; index: number }) {
    const isDone    = task.done;
    const isSkipped = skippedTaskIds.includes(task.id);
    const isActive  = timer.activeTaskId === task.id;
    const colors    = taskTypeColor(task.type);

    return (
      <div className={`flex items-center gap-2 rounded-2xl border px-3 py-2 transition ${
        isDone ? "opacity-50 border-[#FFF5D6]" : isSkipped ? "opacity-50 border-dashed border-[#F5CF82]" : "border-[#F5CF82]"}`}>
        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${isDone ? "bg-[#EEF3FE] text-[#3D2B1F]" : "bg-[#F5CF82] text-[#3D2B1F]"}`}>
          {isDone ? "✓" : index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${isDone ? "line-through text-[#B8CCFA]" : "text-[#3D2B1F]"}`}>{task.title}</div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={`text-[10px] rounded-full px-1.5 py-0.5 border ${colors.bg} ${colors.border} ${colors.text}`}>{task.type}</span>
            <span className="text-[10px] text-[#B8CCFA]">{task.duration} min</span>
            {isActive && <span className="text-[10px] text-[#3D2B1F] font-medium">{timer.formatElapsed()}</span>}
          </div>
        </div>
        {/* FIX: all buttons 44×44px */}
        <div className="flex items-center gap-1 shrink-0">
          {!isDone && (
            <button onClick={() => markDone(task.id)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#DBED9D] text-[#3D2B1F] hover:opacity-80">
              <CheckCircle2 className="h-5 w-5" />
            </button>
          )}
          {!isDone && !isSkipped && (
            <button onClick={() => handleStartTask(task.id)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFFBF0] text-[#7A6050] hover:bg-[#FFF5D6]">
              {isActive ? <Timer className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
            </button>
          )}
          {!isDone && isSkipped && (
            <button onClick={() => unskipTask(task.id)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFFBF0] text-[#3D2B1F] text-base hover:bg-[#FFF5D6]">↩</button>
          )}
          {!isDone && !isSkipped && (
            <button onClick={() => skipTask(task.id)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFFBF0] text-[#7A6050] hover:bg-[#FFF5D6] text-base font-medium">—</button>
          )}
          <button onClick={() => openEditTaskModal(task)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFFBF0] text-[#7A6050] hover:bg-[#FFF5D6]">
            <Sparkles className="h-5 w-5" />
          </button>
          <button onClick={() => deleteTask(task.id)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFE8E0] text-[#D86868] hover:opacity-80">
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  function EventRow({ event }: { event: FixedEvent }) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[#F5CF82] bg-[#F5CF82] px-4 py-3 min-h-[56px]">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[#3D2B1F] truncate">{event.title}</div>
          <div className="text-xs text-[#7A6050] mt-0.5">{formatTime(event.startHour, event.startMinute)} – {formatTime(event.endHour, event.endMinute)}</div>
        </div>
        <button onClick={() => deleteFixedEvent(event.id)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/50 text-[#7A6050] hover:bg-white/80">
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    );
  }

  function LogRow({ entry }: { entry: TaskLogEntry }) {
    const done = entry.outcome === "done";
    return (
      <div className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${done ? "bg-[#FFF5D6] text-[#3D2B1F]" : "bg-[#FFFBF0] text-[#7A6050]"}`}>
        <div className="flex items-center gap-2 min-w-0">
          {done ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <span className="text-[#B8CCFA] shrink-0">—</span>}
          <span className={`truncate ${!done ? "line-through" : ""}`}>{entry.taskTitle}</span>
          <span className="text-xs opacity-50 shrink-0">{entry.taskDuration} min</span>
        </div>
        <span className="text-xs opacity-50 shrink-0 ml-2">{entry.segment}</span>
      </div>
    );
  }

  // ── "Do this now" card ────────────────────────────────────────────────────────
  const nowCard = plan.currentEvent ? (
    <div className="rounded-3xl border border-[#E8BB60] bg-[#F5CF82] px-5 py-4 shadow-sm">
      <div className="text-xs text-[#3D2B1F]/50 uppercase tracking-wide mb-1">Fixed event now</div>
      <div className="text-xl font-semibold text-[#3D2B1F]">{plan.currentEvent.title}</div>
      <div className="text-sm text-[#7A6050] mt-0.5">
        {formatTime(plan.currentEvent.startHour, plan.currentEvent.startMinute)} – {formatTime(plan.currentEvent.endHour, plan.currentEvent.endMinute)}
      </div>
    </div>
  ) : plan.nowTask ? (
    <div className="rounded-3xl border border-[#E8BB60] bg-[#F5CF82] px-5 py-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-[#3D2B1F]/50 mb-1">
        <Brain className="h-3.5 w-3.5" /> Do this now
        {quickMode && <span className="ml-auto rounded-full bg-[#82A8F5]/20 px-2 py-0.5 text-[#2A50A0]"><Clock className="mr-1 inline h-3 w-3" />Quick</span>}
      </div>
      <div className="text-xl font-semibold text-[#3D2B1F] leading-tight">{plan.nowTask.title}</div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="rounded-full bg-white/40 px-2 py-0.5 text-xs text-[#3D2B1F]">{plan.nowTask.duration} min</span>
        <span className="rounded-full bg-white/40 px-2 py-0.5 text-xs text-[#3D2B1F]">{plan.nowTask.type}</span>
        {plan.nowTask.learningBonus !== 0 && (
          <span className="rounded-full bg-[#82A8F5]/25 px-2 py-0.5 text-xs text-[#2A50A0]">
            <TrendingUp className="mr-1 inline h-3 w-3" />{plan.nowTask.learningBonus > 0 ? `+${plan.nowTask.learningBonus}` : plan.nowTask.learningBonus}
          </span>
        )}
        {timer.activeTaskId === plan.nowTask.id && (
          <span className="rounded-full bg-[#82A8F5]/25 px-2 py-0.5 text-xs text-[#2A50A0]">
            <Timer className="mr-1 inline h-3 w-3" />{timer.formatElapsed()}
          </span>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => plan.nowTask && markDone(plan.nowTask.id)}
          className="flex-1 min-h-[44px] rounded-2xl bg-white px-3 text-sm font-medium text-[#3D2B1F] hover:bg-[#FFFBF0] flex items-center justify-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-[#82A8F5]" /> Done
        </button>
        <button onClick={() => plan.nowTask && skipTask(plan.nowTask.id)}
          className="min-h-[44px] rounded-2xl bg-white/40 px-4 text-sm font-medium text-[#3D2B1F] hover:bg-white/60">Skip</button>
        <button onClick={() => plan.nowTask && handleStartTask(plan.nowTask.id)}
          className="min-h-[44px] rounded-2xl bg-white/40 px-3 text-sm font-medium text-[#3D2B1F] hover:bg-white/60 flex items-center gap-1.5">
          <PlayCircle className="h-4 w-4" />{timer.activeTaskId === plan.nowTask.id ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  ) : (
    <div className="rounded-3xl border border-[#E8BB60] bg-[#F5CF82] px-5 py-4 shadow-sm text-[#7A6050] text-sm">
      {quickMode ? `No quick tasks ≤ ${QUICK_TASK_MAX_DURATION} min. Turn off quick mode.` : "You're done for today. Nice work."}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "now",      label: "Now",      icon: <Brain className="h-5 w-5" />        },
    { key: "tasks",    label: "My day",   icon: <CheckCircle2 className="h-5 w-5" /> },
    { key: "timeline", label: "Timeline", icon: <CalendarDays className="h-5 w-5" /> },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="mx-auto max-w-2xl px-4 pt-5">

          {/* ── Now tab ── */}
          {activeTab === "now" && (
            <div className="space-y-3">
              {nowCard}

              <div className={cardCls}>
                <h2 className="text-sm font-semibold text-[#3D2B1F] mb-3">How are you feeling?</h2>
                <div className="grid gap-2">
                  {ENERGY_STATES.map((state) => {
                    const Icon   = state.icon;
                    const active = state.value === energyStateValue;
                    return (
                      <button key={state.value} onClick={() => handleEnergyChange(state.value)} className={pillCls(active)}>
                        <div className="flex items-center gap-3">
                          <Icon className="h-5 w-5 shrink-0" />
                          <div>
                            <div className="text-sm font-medium">{state.label}</div>
                            <div className={`text-xs ${active ? "text-[#7A6050]" : "text-[#B8CCFA]"}`}>
                              {state.value === "tired" ? "Quick mode auto-enabled." : "Planner adjusts difficulty."}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  <button onClick={() => setQuickMode((q) => !q)}
                    className={`min-h-[52px] w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${quickMode ? "border-[#82A8F5] bg-[#EEF3FE] text-[#2A50A0]" : "border-[#F5CF82] bg-white text-[#3D2B1F] hover:bg-[#FFFBF0]"}`}>
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 shrink-0" />
                      <div>
                        <div>Quick task mode {quickMode ? "ON" : "OFF"}</div>
                        <div className={`text-xs font-normal ${quickMode ? "text-[#4070CC]" : "text-[#B8CCFA]"}`}>Only shows tasks ≤ {QUICK_TASK_MAX_DURATION} min</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className={cardCls}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-semibold text-[#3D2B1F] tracking-tight">{formatTime(currentHour, currentMinute)}</div>
                    <div className="text-sm text-[#7A6050] mt-0.5">{plan.segment.label} · creativity {plan.segment.creativity}</div>
                  </div>
                  <div className="rounded-xl bg-[#EEF3FE] px-3 py-1.5 text-xs text-[#4070CC] font-medium">Auto-synced</div>
                </div>
              </div>
            </div>
          )}

          {/* ── My day tab ── */}
          {activeTab === "tasks" && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <button onClick={openAddEventModal} className="flex-1 min-h-[48px] rounded-2xl bg-[#F5CF82] border border-[#E8BB60] px-4 text-sm font-medium text-[#3D2B1F] hover:bg-[#E8BB60] transition">
                  + Fixed event
                </button>
                <button onClick={openAddTaskModal} className="flex-1 min-h-[48px] rounded-2xl bg-white border border-[#F5CF82] px-4 text-sm font-medium text-[#3D2B1F] hover:bg-[#FFFBF0] transition">
                  + Task
                </button>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button onClick={resetDay} className="min-h-[40px] rounded-xl bg-[#FFFBF0] px-3 text-xs text-[#7A6050] hover:bg-[#FFF5D6]">Reset day</button>
                <button onClick={unskipAll} className="min-h-[40px] rounded-xl bg-[#FFFBF0] px-3 text-xs text-[#7A6050] hover:bg-[#FFF5D6]">Unskip all</button>
                <button onClick={() => { if (window.confirm("Clear all tasks?")) { persistTasks([]); persistSkipped([]); timer.stopTimer(); } }}
                  className="min-h-[40px] rounded-xl bg-[#FFE8E0] px-3 text-xs text-[#D86868] hover:opacity-80">Clear all</button>
              </div>

              {fixedEvents.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#B8CCFA]">Fixed events</div>
                  <div className="space-y-2">
                    {[...fixedEvents].sort((a, b) => toMinutes(a.startHour, a.startMinute) - toMinutes(b.startHour, b.startMinute)).map((ev) => (
                      <EventRow key={ev.id} event={ev} />
                    ))}
                  </div>
                </div>
              )}

              {pending.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#B8CCFA]">Tasks — {pending.length} remaining</div>
                  <div className="space-y-2">{pending.map((task, i) => <TaskRow key={task.id} task={task} index={i} />)}</div>
                </div>
              )}

              {skipped.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#B8CCFA]">Skipped</div>
                  <div className="space-y-2">{skipped.map((task, i) => <TaskRow key={task.id} task={task} index={i} />)}</div>
                </div>
              )}

              {done.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#B8CCFA]">Done — {done.length}</div>
                  <div className="space-y-2">{done.map((task, i) => <TaskRow key={task.id} task={task} index={i} />)}</div>
                </div>
              )}

              {pending.length === 0 && done.length === 0 && skipped.length === 0 && fixedEvents.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[#F5CF82] p-8 text-center text-sm text-[#B8CCFA]">
                  Nothing here yet — add a task or event above.
                </div>
              )}
            </div>
          )}

          {/* ── Timeline tab ── */}
          {activeTab === "timeline" && (
            <div className="space-y-3">
              <div className={cardCls}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-[#7A6050]" />
                    <h2 className="text-base font-semibold text-[#3D2B1F]">Day timeline</h2>
                  </div>
                  <span className="text-xs text-[#B8CCFA]">from {formatTime(currentHour, currentMinute)}</span>
                </div>
                <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#B8CCFA]">
                  {[
                    { label: "deep work",  bg: "bg-[#ED98C3]", border: "border-[#D870A8]" },
                    { label: "physical",   bg: "bg-[#ED9898]", border: "border-[#D86868]" },
                    { label: "life admin", bg: "bg-[#EDC398]", border: "border-[#D8A068]" },
                    { label: "chore",      bg: "bg-[#F9E5AB]", border: "border-[#E8C860]" },
                    { label: "recovery",   bg: "bg-[#DBED9D]", border: "border-[#A8D860]" },
                    { label: "event",      bg: "bg-[#F5CF82]", border: "border-[#E8BB60]" },
                  ].map(({ label, bg, border }) => (
                    <span key={label} className="flex items-center gap-1">
                      <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${bg} ${border}`} />
                      {label}
                    </span>
                  ))}
                  <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-[#82A8F5]" /> now</span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-[#FFF5D6]">
                  <DayTimeline blocks={timelineBlocks} currentHour={currentHour} currentMinute={currentMinute}
                    onTaskClick={(task) => { openEditTaskModal(task); setActiveTab("tasks"); }} />
                </div>
                <p className="mt-2 text-xs text-[#B8CCFA]">Tap a task block to edit it.</p>
              </div>

              <div className={cardCls}>
                <button onClick={() => setShowHistory((h) => !h)} className="flex w-full items-center justify-between min-h-[44px]">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-[#7A6050]" />
                    <span className="text-base font-semibold text-[#3D2B1F]">History</span>
                    {todayLog.length > 0 && <span className="rounded-full bg-[#FFFBF0] px-2 py-0.5 text-xs text-[#7A6050]">{todayDone.length}✓ {todaySkipped.length}✗</span>}
                  </div>
                  {showHistory ? <ChevronUp className="h-4 w-4 text-[#B8CCFA]" /> : <ChevronDown className="h-4 w-4 text-[#B8CCFA]" />}
                </button>
                {showHistory && (
                  <div className="mt-3 space-y-4">
                    <div>
                      <div className="mb-2 text-xs font-semibold text-[#B8CCFA] uppercase tracking-wide">Today</div>
                      {todayLog.length === 0 ? <div className="text-sm text-[#B8CCFA]">No activity yet.</div>
                        : <div className="space-y-1.5">{[...todayDone, ...todaySkipped].sort((a, b) => a.timestamp - b.timestamp).map((e) => <LogRow key={e.id} entry={e} />)}</div>}
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-semibold text-[#B8CCFA] uppercase tracking-wide">
                        Yesterday{yesterdayLog.length > 0 ? ` — ${yestDone.length}✓ ${yestSkipped.length}✗` : ""}
                      </div>
                      {yesterdayLog.length === 0 ? <div className="text-sm text-[#B8CCFA]">No activity yesterday.</div>
                        : <div className="space-y-1.5">{[...yestDone, ...yestSkipped].sort((a, b) => a.timestamp - b.timestamp).map((e) => <LogRow key={e.id} entry={e} />)}</div>}
                    </div>
                  </div>
                )}
              </div>

              <div className={cardCls}>
                <button onClick={() => setShowLearning((s) => !s)} className="flex w-full items-center justify-between min-h-[44px]">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-[#7A6050]" />
                    <span className="text-base font-semibold text-[#3D2B1F]">What it&apos;s learned</span>
                    {learningInsights.length > 0 && <span className="rounded-full bg-[#FFFBF0] px-2 py-0.5 text-xs text-[#7A6050]">{learningInsights.length} patterns</span>}
                  </div>
                  {showLearning ? <ChevronUp className="h-4 w-4 text-[#B8CCFA]" /> : <ChevronDown className="h-4 w-4 text-[#B8CCFA]" />}
                </button>
                {showLearning && (
                  <div className="mt-3">
                    {learningInsights.length === 0
                      ? <p className="text-sm text-[#B8CCFA]">Complete or skip at least {LEARNING_MIN_EVENTS} tasks per context to see patterns.</p>
                      : <div className="space-y-3">
                          {learningInsights.map((ins) => (
                            <div key={ins.key} className="rounded-2xl border border-[#FFF5D6] p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm font-medium text-[#3D2B1F] capitalize">{ins.type}</div>
                                  <div className="text-xs text-[#B8CCFA] capitalize">{ins.segment} · {ins.energy} · {ins.done + ins.skipped} sessions</div>
                                </div>
                                <div className="text-right">
                                  <div className={`text-sm font-medium ${ins.rate >= 70 ? "text-[#3D2B1F]" : ins.rate <= 40 ? "text-[#4070CC]" : "text-[#E8BB60]"}`}>{ins.rate}%</div>
                                  <div className="text-xs text-[#B8CCFA]">{ins.done}✓ {ins.skipped}✗</div>
                                </div>
                              </div>
                              <div className="mt-2 h-1.5 rounded-full bg-[#FFFBF0] overflow-hidden">
                                <div className={`h-full rounded-full ${ins.rate >= 70 ? "bg-[#DBED9D]" : ins.rate <= 40 ? "bg-[#82A8F5]" : "bg-[#F5CF82]"}`} style={{ width: `${ins.rate}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>}
                    <div className="mt-3 rounded-2xl bg-[#FFFBF0] p-3 text-xs text-[#B8CCFA]">
                      Subtle ±{LEARNING_MAX_BONUS}pt nudge. Needs ≥{LEARNING_MIN_EVENTS} events per context.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* FIX: safe-area-inset-bottom for iPhone home indicator */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#F5CF82] bg-white/95 backdrop-blur-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-2xl">
          {TABS.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition min-h-[56px] ${activeTab === key ? "text-[#3D2B1F]" : "text-[#B8CCFA] hover:text-[#7A6050]"}`}>
              <span className={activeTab === key ? "text-[#3D2B1F]" : "text-[#B8CCFA]"}>{icon}</span>
              {label}
              {activeTab === key && <span className="h-1 w-6 rounded-full bg-[#82A8F5]" />}
            </button>
          ))}
        </div>
      </nav>

      {showTaskModal && (
        <Modal title={editingTaskId ? "Edit task" : "Add task"} onClose={closeTaskModal}>
          <TaskFormFields
            taskForm={taskForm}
            setTaskForm={setTaskForm}
            editingTaskId={editingTaskId}
            onSave={saveTask}
            titleRef={titleInputRef}
          />
        </Modal>
      )}
      {showEventModal && (
        <Modal title="Add fixed event" onClose={closeEventModal}>
          <EventFormFields
            eventForm={eventForm}
            setEventForm={setEventForm}
            eventFormError={eventFormError}
            onSave={saveEvent}
          />
        </Modal>
      )}
    </div>
  );
}