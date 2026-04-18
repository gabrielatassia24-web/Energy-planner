"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  Moon,
  PlayCircle,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  Zap,
} from "lucide-react";

type EnergyLevel = "low" | "medium" | "high";
type TaskType = "deep work" | "physical" | "life admin" | "chore" | "recovery";
type SegmentKey = "morning" | "midday" | "afternoon" | "evening";
type EnergyStateValue = "tired" | "normal" | "energized";

interface EnergyState {
  value: EnergyStateValue;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  multiplier: number;
}

// Creativity level the segment naturally affords
// morning=medium, midday=high, afternoon=high, evening=low
type CreativityLevel = "low" | "medium" | "high";

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

const ENERGY_STATES: EnergyState[] = [
  { value: "tired", label: "Tired", icon: Moon, multiplier: 0.7 },
  { value: "normal", label: "Normal", icon: Sun, multiplier: 1 },
  { value: "energized", label: "Energized", icon: Zap, multiplier: 1.25 },
];

const ENERGY_SCORE: Record<EnergyLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const TASK_TYPES: TaskType[] = [
  "deep work",
  "physical",
  "life admin",
  "chore",
  "recovery",
];

const CREATIVITY_SCORE: Record<CreativityLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const DAY_SEGMENTS: DaySegment[] = [
  {
    key: "morning",
    label: "Morning",
    start: 6,
    end: 11,
    energy: "high",
    creativity: "medium",
    goodTypes: ["physical", "deep work"],
  },
  {
    key: "midday",
    label: "Midday",
    start: 11,
    end: 15,
    energy: "high",
    creativity: "high",
    goodTypes: ["deep work", "life admin"],
  },
  {
    key: "afternoon",
    label: "Afternoon",
    start: 15,
    end: 18,
    energy: "medium",
    creativity: "high",
    goodTypes: ["life admin", "physical"],
  },
  {
    key: "evening",
    label: "Evening",
    start: 18,
    end: 23,
    energy: "low",
    creativity: "low",
    goodTypes: ["chore", "recovery"],
  },
];

const STORAGE_KEY = "energy-planner-tasks-v2";
const STORAGE_ENERGY_KEY = "energy-planner-energy-state-v1";
const STORAGE_HOUR_KEY = "energy-planner-current-hour-v1";
const STORAGE_MINUTE_KEY = "energy-planner-current-minute-v1";
const STORAGE_SKIPPED_KEY = "energy-planner-skipped-task-ids-v1";
const STORAGE_EVENTS_KEY = "energy-planner-fixed-events-v2";

// ─── FIX 1: Safe localStorage reader ────────────────────────────────────────
function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Failed to save to localStorage", error);
  }
}

// ─── FIX 2: Lazy initial tasks (no flicker, IDs stable) ─────────────────────
function makeInitialTasks(): Task[] {
  return [
    {
      id: crypto.randomUUID(),
      title: "Gym",
      type: "physical",
      energy: "high",
      creativity: "low",
      duration: 60,
      importance: 5,
      urgency: 3,
      preferredSegment: "morning",
      done: false,
    },
    {
      id: crypto.randomUUID(),
      title: "Study for exam",
      type: "deep work",
      energy: "high",
      creativity: "medium",
      duration: 90,
      importance: 5,
      urgency: 5,
      preferredSegment: "midday",
      done: false,
    },
    {
      id: crypto.randomUUID(),
      title: "Answer emails",
      type: "life admin",
      energy: "medium",
      creativity: "low",
      duration: 30,
      importance: 3,
      urgency: 4,
      preferredSegment: "afternoon",
      done: false,
    },
    {
      id: crypto.randomUUID(),
      title: "Laundry",
      type: "chore",
      energy: "low",
      creativity: "low",
      duration: 30,
      importance: 2,
      urgency: 2,
      preferredSegment: "evening",
      done: false,
    },
    {
      id: crypto.randomUUID(),
      title: "Stretch and recover",
      type: "recovery",
      energy: "low",
      creativity: "low",
      duration: 20,
      importance: 4,
      urgency: 2,
      preferredSegment: "evening",
      done: false,
    },
  ];
}

function makeInitialEvents(): FixedEvent[] {
  return [
    { id: crypto.randomUUID(), title: "Lecture", startHour: 9, startMinute: 0, endHour: 11, endMinute: 0 },
    { id: crypto.randomUUID(), title: "Work shift", startHour: 14, startMinute: 0, endHour: 16, endMinute: 0 },
  ];
}

const emptyTaskForm: TaskForm = {
  title: "",
  type: "deep work",
  energy: "medium",
  creativity: "medium",
  duration: 30,
  importance: 3,
  urgency: 3,
  preferredSegment: "midday",
};

const emptyEventForm: EventForm = {
  title: "",
  startHour: 9,
  startMinute: 0,
  endHour: 10,
  endMinute: 0,
};

// ─── Styling helpers ─────────────────────────────────────────────────────────
function inputClass(): string {
  return "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500";
}

function cardClass(): string {
  return "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm";
}

function buttonClass(kind: "primary" | "secondary" | "ghost" = "primary"): string {
  if (kind === "secondary") {
    return "inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50";
  }
  if (kind === "ghost") {
    return "inline-flex items-center justify-center rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200";
  }
  return "inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800";
}

function pillClass(active: boolean): string {
  return active
    ? "rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-left text-white"
    : "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-800 hover:bg-slate-50";
}

function energyBadgeClass(level: EnergyLevel): string {
  if (level === "high") return "border border-emerald-200 bg-emerald-100 text-emerald-800";
  if (level === "medium") return "border border-amber-200 bg-amber-100 text-amber-800";
  return "border border-slate-200 bg-slate-100 text-slate-800";
}

function creativityBadgeClass(level: CreativityLevel): string {
  if (level === "high") return "border border-purple-200 bg-purple-100 text-purple-800";
  if (level === "medium") return "border border-violet-200 bg-violet-100 text-violet-800";
  return "border border-slate-200 bg-slate-100 text-slate-600";
}

// Format HH:MM from hour + minute
function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Total minutes since midnight for easy comparison
function toMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function getSegmentByHour(hour: number): DaySegment {
  return DAY_SEGMENTS.find((s) => hour >= s.start && hour < s.end) ?? DAY_SEGMENTS[3];
}

function getCurrentEvent(events: FixedEvent[], hour: number, minute: number = 0): FixedEvent | null {
  const now = toMinutes(hour, minute);
  return (
    events.find(
      (e) => now >= toMinutes(e.startHour, e.startMinute) && now < toMinutes(e.endHour, e.endMinute)
    ) ?? null
  );
}

function scoreTask(task: Task, segment: DaySegment, energyState: EnergyState): number {
  if (task.done) return -9999;
  let score = 0;
  score += task.importance * 10;
  score += task.urgency * 8;

  // Energy match
  const currentEnergy = ENERGY_SCORE[segment.energy] * energyState.multiplier;
  const taskEnergy = ENERGY_SCORE[task.energy];
  const energyGap = Math.abs(currentEnergy - taskEnergy);
  score += 24 - energyGap * 10;

  // Creativity match — segment creativity vs task creativity need
  // Perfect match = +20, one step off = +8, two steps off = -8
  const segCreativity = CREATIVITY_SCORE[segment.creativity];
  const taskCreativity = CREATIVITY_SCORE[task.creativity];
  const creativityGap = Math.abs(segCreativity - taskCreativity);
  if (creativityGap === 0) score += 20;
  else if (creativityGap === 1) score += 8;
  else score -= 8;

  if (task.preferredSegment === segment.key) score += 18;
  if (segment.goodTypes.includes(task.type)) score += 12;
  if (energyState.value === "tired" && task.energy === "high") score -= 18;
  if (energyState.value === "energized" && task.energy === "low") score -= 6;
  if (task.duration <= 30) score += 4;
  if (energyState.value === "tired" && task.duration > 60) score -= 10;
  return score;
}

function buildPlan(
  tasks: Task[],
  hour: number,
  minute: number,
  energyState: EnergyState,
  skippedTaskIds: string[],
  fixedEvents: FixedEvent[]
): Plan {
  const segment = getSegmentByHour(hour);
  const currentEvent = getCurrentEvent(fixedEvents, hour, minute);
  const remaining = tasks.filter((t) => !t.done && !skippedTaskIds.includes(t.id));
  const ranked: RankedTask[] = remaining
    .map((t) => ({ ...t, score: scoreTask(t, segment, energyState) }))
    .sort((a, b) => b.score - a.score);
  return {
    segment,
    ranked,
    nowTask: currentEvent ? null : ranked[0] ?? null,
    currentEvent,
  };
}

// ─── Timer hook ──────────────────────────────────────────────────────────────
function useTaskTimer() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [intervalId, setIntervalId] = useState<ReturnType<typeof setInterval> | null>(null);

  function startTimer(taskId: string) {
    if (intervalId) clearInterval(intervalId);
    setActiveTaskId(taskId);
    setSecondsElapsed(0);
    const id = setInterval(() => setSecondsElapsed((s) => s + 1), 1000);
    setIntervalId(id);
  }

  function stopTimer() {
    if (intervalId) clearInterval(intervalId);
    setActiveTaskId(null);
    setSecondsElapsed(0);
    setIntervalId(null);
  }

  function formatElapsed(): string {
    const m = Math.floor(secondsElapsed / 60);
    const s = secondsElapsed % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return { activeTaskId, formatElapsed, startTimer, stopTimer };
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function DayPlannerDecidesForYou() {
  // ── FIX 1 & 2: All state initialised lazily from localStorage, no useEffect flicker ──
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = readStorage<Task[]>(STORAGE_KEY, []);
    return saved.length > 0 ? saved : makeInitialTasks();
  });

  const [fixedEvents, setFixedEvents] = useState<FixedEvent[]>(() => {
    const saved = readStorage<FixedEvent[]>(STORAGE_EVENTS_KEY, []);
    return saved.length > 0 ? saved : makeInitialEvents();
  });

  const formRef = useRef<HTMLDivElement | null>(null);
 
  const [energyStateValue, setEnergyStateValue] = useState<EnergyStateValue>(() => {
  if (typeof window === "undefined") return "normal";

  const saved = localStorage.getItem(STORAGE_ENERGY_KEY);
  if (saved === "tired" || saved === "normal" || saved === "energized") return saved;
  return "normal";
});

  // ── FIX 3: Auto-initialise hour to real current time ──────────────────────
  const [currentHour, setCurrentHour] = useState<number>(() => {
    const saved = readStorage<number | null>(STORAGE_HOUR_KEY, null);
    return saved !== null ? saved : new Date().getHours();
  });

  const [currentMinute, setCurrentMinute] = useState<number>(() => {
    const saved = readStorage<number | null>(STORAGE_MINUTE_KEY, null);
    return saved !== null ? saved : new Date().getMinutes();
  });

  const [skippedTaskIds, setSkippedTaskIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_SKIPPED_KEY, [])
  );

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm);

  // Validation: end time must be strictly after start time
  const eventFormError =
    toMinutes(eventForm.endHour, eventForm.endMinute) <= toMinutes(eventForm.startHour, eventForm.startMinute)
      ? "End time must be after start time."
      : null;

  const timer = useTaskTimer();

  // ── Persist on every change (no separate useEffects needed per field) ──────
  function persistTasks(next: Task[]) {
    setTasks(next);
    writeStorage(STORAGE_KEY, next);
  }

  function persistEvents(next: FixedEvent[]) {
    setFixedEvents(next);
    writeStorage(STORAGE_EVENTS_KEY, next);
  }

  function persistEnergyState(next: EnergyStateValue) {
    setEnergyStateValue(next);
    writeStorage(STORAGE_ENERGY_KEY, next);
  }

  function persistCurrentHour(next: number) {
    setCurrentHour(next);
    writeStorage(STORAGE_HOUR_KEY, next);
  }

  function persistCurrentMinute(next: number) {
    setCurrentMinute(next);
    writeStorage(STORAGE_MINUTE_KEY, next);
  }

  function persistSkipped(next: string[]) {
    setSkippedTaskIds(next);
    writeStorage(STORAGE_SKIPPED_KEY, next);
  }

  const energyState =
    ENERGY_STATES.find((s) => s.value === energyStateValue) ?? ENERGY_STATES[1];

  const plan = useMemo<Plan>(
    () => buildPlan(tasks, currentHour, currentMinute, energyState, skippedTaskIds, fixedEvents),
    [tasks, currentHour, currentMinute, energyState, skippedTaskIds, fixedEvents]
  );

  const doneTasks = tasks.filter((t) => t.done);
  const skippedTasks = tasks.filter((t) => !t.done && skippedTaskIds.includes(t.id));

  // ── Handlers ─────────────────────────────────────────────────────────────
  function resetTaskForm() {
    setTaskForm(emptyTaskForm);
    setEditingTaskId(null);
  }

  function addTask() {
    if (!taskForm.title.trim()) return;
    if (editingTaskId) {
      persistTasks(
        tasks.map((t) =>
          t.id === editingTaskId
            ? {
                ...t,
                title: taskForm.title.trim(),
                type: taskForm.type,
                energy: taskForm.energy,
                creativity: taskForm.creativity,
                duration: Number(taskForm.duration),
                importance: Number(taskForm.importance),
                urgency: Number(taskForm.urgency),
                preferredSegment: taskForm.preferredSegment,
              }
            : t
        )
      );
    } else {
      persistTasks([
        ...tasks,
        {
          id: crypto.randomUUID(),
          title: taskForm.title.trim(),
          type: taskForm.type,
          energy: taskForm.energy,
          creativity: taskForm.creativity,
          duration: Number(taskForm.duration),
          importance: Number(taskForm.importance),
          urgency: Number(taskForm.urgency),
          preferredSegment: taskForm.preferredSegment,
          done: false,
        },
      ]);
    }
    resetTaskForm();
  }

  function startEditing(task: Task) {
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title,
      type: task.type,
      energy: task.energy,
      creativity: task.creativity,
      duration: task.duration,
      importance: task.importance,
      urgency: task.urgency,
      preferredSegment: task.preferredSegment,
    });
  }

  function markDone(id: string) {
    if (timer.activeTaskId === id) timer.stopTimer();
    persistTasks(tasks.map((t) => (t.id === id ? { ...t, done: true } : t)));
    persistSkipped(skippedTaskIds.filter((s) => s !== id));
  }

  function skipTask(id: string) {
    if (timer.activeTaskId === id) timer.stopTimer();
    persistSkipped(skippedTaskIds.includes(id) ? skippedTaskIds : [...skippedTaskIds, id]);
  }

  function unskipTask(id: string) {
    persistSkipped(skippedTaskIds.filter((s) => s !== id));
  }

  function unskipAllTasks() {
    persistSkipped([]);
  }

  function deleteTask(id: string) {
    if (timer.activeTaskId === id) timer.stopTimer();
    persistTasks(tasks.filter((t) => t.id !== id));
    persistSkipped(skippedTaskIds.filter((s) => s !== id));
    if (editingTaskId === id) resetTaskForm();
  }

  function resetDay() {
    persistTasks(tasks.map((t) => ({ ...t, done: false })));
    persistSkipped([]);
    timer.stopTimer();
  }

  function clearAllTasks() {
    if (!window.confirm("Clear all tasks? This cannot be undone.")) return;
    persistTasks([]);
    persistSkipped([]);
    resetTaskForm();
    timer.stopTimer();
  }

  function addFixedEvent() {
    if (!eventForm.title.trim() || eventFormError) return;
    persistEvents([
      ...fixedEvents,
      {
        id: crypto.randomUUID(),
        title: eventForm.title.trim(),
        startHour: Number(eventForm.startHour),
        startMinute: Number(eventForm.startMinute),
        endHour: Number(eventForm.endHour),
        endMinute: Number(eventForm.endMinute),
      },
    ]);
    setEventForm(emptyEventForm);
  }

  function deleteFixedEvent(id: string) {
    persistEvents(fixedEvents.filter((e) => e.id !== id));
  }

  // ── FIX 5: Start task wired to timer ─────────────────────────────────────
  function handleStartTask(taskId: string) {
    if (timer.activeTaskId === taskId) {
      timer.stopTimer();
    } else {
      timer.startTimer(taskId);
    }
  }

  function syncToNow() {
    const now = new Date();
    persistCurrentHour(now.getHours());
    persistCurrentMinute(now.getMinutes());
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                Day Planner That Decides For You
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Tell it your energy, time of day, and tasks. It picks what you should do now.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={resetDay} className={buttonClass("secondary")}>
                Reset day
              </button>
              <button onClick={unskipAllTasks} className={buttonClass("ghost")}>
                Unskip all
              </button>
              <button onClick={clearAllTasks} className={buttonClass("ghost")}>
                Clear all
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[380px,1fr]">
          {/* Left sidebar */}
          <div className="space-y-6">
            {/* Energy picker */}
            <div className={cardClass()}>
              <h2 className="text-lg font-semibold text-slate-900">How are you feeling?</h2>
              <div className="mt-4 grid gap-3">
                {ENERGY_STATES.map((state) => {
                  const Icon = state.icon;
                  const active = state.value === energyStateValue;
                  return (
                    <button
                      key={state.value}
                      onClick={() => persistEnergyState(state.value)}
                      className={pillClass(active)}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5" />
                        <div>
                          <div className="font-medium">{state.label}</div>
                          <div className={`text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
                            Planner adjusts the difficulty of your next task.
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time slider */}
            <div className={cardClass()}>
              <h2 className="text-lg font-semibold text-slate-900">What time is it?</h2>
              <div className="mt-4 space-y-3">
                <input
                  type="range"
                  min="6"
                  max="22"
                  value={currentHour}
                  onChange={(e) => persistCurrentHour(Number(e.target.value))}
                  className="w-full"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Hour</label>
                    <input
                      className={inputClass()}
                      type="number"
                      min={6}
                      max={22}
                      value={currentHour}
                      onChange={(e) => persistCurrentHour(Math.min(22, Math.max(6, Number(e.target.value))))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Minute</label>
                    <input
                      className={inputClass()}
                      type="number"
                      min={0}
                      max={59}
                      value={currentMinute}
                      onChange={(e) => persistCurrentMinute(Math.min(59, Math.max(0, Number(e.target.value))))}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span className="font-medium text-slate-900">{formatTime(currentHour, currentMinute)}</span>
                  <span>{plan.segment.label}</span>
                </div>
                <button onClick={syncToNow} className={`${buttonClass("ghost")} w-full text-xs`}>
                  Sync to current time ({formatTime(new Date().getHours(), new Date().getMinutes())})
                </button>
              </div>
            </div>

            {/* Add fixed event */}
            <div className={cardClass()}>
              <h2 className="text-lg font-semibold text-slate-900">Add fixed event</h2>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Event name</label>
                  <input
                    className={inputClass()}
                    placeholder="e.g. Lecture"
                    value={eventForm.title}
                    onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Start time</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">Hour (6–22)</label>
                      <input
                        className={inputClass()}
                        type="number"
                        min={6}
                        max={22}
                        value={eventForm.startHour}
                        onChange={(e) =>
                          setEventForm({ ...eventForm, startHour: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">Minute (0–59)</label>
                      <input
                        className={inputClass()}
                        type="number"
                        min={0}
                        max={59}
                        value={eventForm.startMinute}
                        onChange={(e) =>
                          setEventForm({ ...eventForm, startMinute: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">End time</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">Hour (6–23)</label>
                      <input
                        className={inputClass()}
                        type="number"
                        min={6}
                        max={23}
                        value={eventForm.endHour}
                        onChange={(e) =>
                          setEventForm({ ...eventForm, endHour: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">Minute (0–59)</label>
                      <input
                        className={inputClass()}
                        type="number"
                        min={0}
                        max={59}
                        value={eventForm.endMinute}
                        onChange={(e) =>
                          setEventForm({ ...eventForm, endMinute: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                </div>
                {eventFormError && (
                  <p className="text-xs text-red-600">{eventFormError}</p>
                )}
                {!eventFormError && eventForm.title.trim() && (
                  <p className="text-xs text-slate-500">
                    {formatTime(eventForm.startHour, eventForm.startMinute)} → {formatTime(eventForm.endHour, eventForm.endMinute)}
                  </p>
                )}
                <button
                  onClick={addFixedEvent}
                  disabled={!!eventFormError || !eventForm.title.trim()}
                  className={`${buttonClass("secondary")} w-full disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Add fixed event
                </button>
              </div>
            </div>

            {/* Fixed events list */}
            <div className={cardClass()}>
              <h2 className="text-lg font-semibold text-slate-900">Fixed events</h2>
              <div className="mt-4 space-y-3">
                {fixedEvents.length ? (
                  fixedEvents.map((event) => (
                    <div key={event.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{event.title}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {formatTime(event.startHour, event.startMinute)} – {formatTime(event.endHour, event.endMinute)}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteFixedEvent(event.id)}
                          className={buttonClass("ghost")}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
                    No fixed events yet.
                  </div>
                )}
              </div>
            </div>

            {/* Add / edit task form */}
            <div className={cardClass()}>
              <h2 className="text-lg font-semibold text-slate-900">
                {editingTaskId ? "Edit task" : "Add a task"}
              </h2>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Task name</label>
                  <input
                    className={inputClass()}
                    placeholder="e.g. Write essay intro"
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Type</label>
                    <select
                      className={inputClass()}
                      value={taskForm.type}
                      onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value as TaskType })}
                    >
                      {TASK_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Energy needed</label>
                    <select
                      className={inputClass()}
                      value={taskForm.energy}
                      onChange={(e) =>
                        setTaskForm({ ...taskForm, energy: e.target.value as EnergyLevel })
                      }
                    >
                      {(["low", "medium", "high"] as EnergyLevel[]).map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Creativity needed
                  </label>
                  <select
                    className={inputClass()}
                    value={taskForm.creativity}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, creativity: e.target.value as CreativityLevel })
                    }
                  >
                    {(["low", "medium", "high"] as CreativityLevel[]).map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    High = brainstorming, writing, design · Low = admin, chores, routine
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Duration (minutes)
                    </label>
                    <input
                      className={inputClass()}
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 45"
                      value={taskForm.duration === 0 ? "" : taskForm.duration}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        setTaskForm({ ...taskForm, duration: raw === "" ? 0 : Number(raw) });
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Best time of day
                    </label>
                    <select
                      className={inputClass()}
                      value={taskForm.preferredSegment}
                      onChange={(e) =>
                        setTaskForm({
                          ...taskForm,
                          preferredSegment: e.target.value as SegmentKey,
                        })
                      }
                    >
                      {DAY_SEGMENTS.map((s) => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Importance
                    </label>
                    <select
                      className={inputClass()}
                      value={taskForm.importance}
                      onChange={(e) =>
                        setTaskForm({ ...taskForm, importance: Number(e.target.value) })
                      }
                    >
                      <option value={1}>1 — barely matters</option>
                      <option value={2}>2 — nice to do</option>
                      <option value={3}>3 — should do</option>
                      <option value={4}>4 — important</option>
                      <option value={5}>5 — critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Urgency
                    </label>
                    <select
                      className={inputClass()}
                      value={taskForm.urgency}
                      onChange={(e) =>
                        setTaskForm({ ...taskForm, urgency: Number(e.target.value) })
                      }
                    >
                      <option value={1}>1 — no deadline</option>
                      <option value={2}>2 — this week</option>
                      <option value={3}>3 — in a few days</option>
                      <option value={4}>4 — tomorrow</option>
                      <option value={5}>5 — due today</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={addTask} className={`${buttonClass()} w-full`}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {editingTaskId ? "Save changes" : "Add task"}
                  </button>
                  {editingTaskId && (
                    <button onClick={resetTaskForm} className={buttonClass("secondary")}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="space-y-6">
            {/* "Do this now" card */}
            <div className="rounded-3xl border border-slate-900 bg-slate-900 p-6 text-white shadow-sm">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Brain className="h-4 w-4" /> Planner decision
              </div>

              {plan.currentEvent ? (
                <>
                  <h2 className="mt-3 text-3xl font-semibold">
                    You have: {plan.currentEvent.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-300">
                    This time is blocked by a fixed event, so no task is being suggested right now.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white/10 px-3 py-1">{plan.segment.label}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">
                      {String(plan.currentEvent.startHour).padStart(2, "0")}:00–
                      {String(plan.currentEvent.endHour).padStart(2, "0")}:00
                    </span>
                  </div>
                </>
              ) : plan.nowTask ? (
                <>
                  <h2 className="mt-3 text-3xl font-semibold">
                    Do this now: {plan.nowTask.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-300">
                    This fits your current energy, the time of day, and how important and urgent it is.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white/10 px-3 py-1">{plan.segment.label}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">
                      {plan.nowTask.duration} min
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1">{plan.nowTask.type}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">
                      ⚡ {plan.nowTask.energy} energy
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1">
                      ✦ {plan.nowTask.creativity} creativity
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1">
                      Score: {Math.round(plan.nowTask.score)}
                    </span>
                    {/* Timer display */}
                    {timer.activeTaskId === plan.nowTask.id && (
                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-300">
                        <Timer className="mr-1 inline h-3 w-3" />
                        {timer.formatElapsed()}
                      </span>
                    )}
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      onClick={() => plan.nowTask && markDone(plan.nowTask.id)}
                      className={buttonClass("secondary")}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Mark done
                    </button>
                    {/* FIX: Skip button now wired */}
                    <button
                      onClick={() => plan.nowTask && skipTask(plan.nowTask.id)}
                      className={buttonClass("ghost")}
                    >
                      Skip
                    </button>
                    {/* FIX: Start task now toggles a real timer */}
                    <button
                      onClick={() => plan.nowTask && handleStartTask(plan.nowTask.id)}
                      className={buttonClass("ghost")}
                    >
                      <PlayCircle className="mr-2 h-4 w-4" />
                      {timer.activeTaskId === plan.nowTask.id ? "Stop timer" : "Start task"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-4 text-slate-300">You are done for today. Nice work.</div>
              )}
            </div>

            {/* Ranked task list */}
            <div className={cardClass()}>
              <h2 className="text-lg font-semibold text-slate-900">Recommended order for today</h2>
              <div className="mt-4 space-y-3">
                {plan.ranked.length ? (
                  plan.ranked.map((task, index) => (
                    <div key={task.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
                              {index + 1}
                            </span>
                            <div className="font-medium text-slate-900">{task.title}</div>
                            {timer.activeTaskId === task.id && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                                <Timer className="mr-1 inline h-3 w-3" />
                                {timer.formatElapsed()}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-slate-200 px-2 py-1 text-slate-700">
                              {task.type}
                            </span>
                            <span className={`rounded-full px-2 py-1 ${energyBadgeClass(task.energy)}`}>
                              ⚡ {task.energy}
                            </span>
                            <span className={`rounded-full px-2 py-1 ${creativityBadgeClass(task.creativity)}`}>
                              ✦ {task.creativity} creativity
                            </span>
                            <span className="rounded-full border border-slate-200 px-2 py-1 text-slate-700">
                              {task.duration} min
                            </span>
                            <span className="rounded-full border border-slate-200 px-2 py-1 text-slate-700">
                              importance {task.importance}
                            </span>
                            <span className="rounded-full border border-slate-200 px-2 py-1 text-slate-700">
                              urgency {task.urgency}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-slate-900">
                            {Math.round(task.score)}
                          </div>
                          <div className="text-xs text-slate-500">fit score</div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={() => markDone(task.id)} className={buttonClass("secondary")}>
                          <CheckCircle2 className="mr-2 h-4 w-4" /> Done
                        </button>
                        <button onClick={() => skipTask(task.id)} className={buttonClass("ghost")}>
                          Skip
                        </button>
                        <button
                          onClick={() => handleStartTask(task.id)}
                          className={buttonClass("ghost")}
                        >
                          <PlayCircle className="mr-2 h-4 w-4" />
                          {timer.activeTaskId === task.id ? "Stop" : "Start"}
                        </button>
                        <button onClick={() => startEditing(task)} className={buttonClass("ghost")}>
                          Edit
                        </button>
                        <button onClick={() => deleteTask(task.id)} className={buttonClass("ghost")}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
                    No tasks left. Add a task or reset the day.
                  </div>
                )}
              </div>
            </div>

            {/* Skipped tasks */}
            {skippedTasks.length > 0 && (
              <div className={cardClass()}>
                <h2 className="text-lg font-semibold text-slate-900">
                  Skipped ({skippedTasks.length})
                </h2>
                <div className="mt-4 space-y-3">
                  {skippedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 opacity-70"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-700">{task.title}</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => unskipTask(task.id)}
                            className={buttonClass("secondary")}
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => markDone(task.id)}
                            className={buttonClass("ghost")}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Done
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Done today */}
            {doneTasks.length > 0 && (
              <div className={cardClass()}>
                <h2 className="text-lg font-semibold text-slate-900">
                  Done today ({doneTasks.length})
                </h2>
                <div className="mt-4 space-y-3">
                  {doneTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <span className="font-medium text-emerald-900 line-through decoration-emerald-400">
                          {task.title}
                        </span>
                      </div>
                      <span className="text-xs text-emerald-700">{task.duration} min</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={cardClass()}>
              <h2 className="text-lg font-semibold text-slate-900">How it decides</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-medium text-slate-900">1. Current energy</div>
                  <p className="mt-1 text-sm text-slate-600">
                    If you are tired, it avoids heavy tasks when possible.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-medium text-slate-900">2. Creativity window</div>
                  <p className="mt-1 text-sm text-slate-600">
                    Midday and afternoon peak for creative work. Morning is medium, evening is low.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-medium text-slate-900">3. Time of day</div>
                  <p className="mt-1 text-sm text-slate-600">
                    Morning favors hard tasks. Evening favors easier ones.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-medium text-slate-900">4. Importance + urgency</div>
                  <p className="mt-1 text-sm text-slate-600">
                    Important and urgent tasks rise to the top.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                Mode: <span className="font-medium text-slate-900">{energyState.label}</span> · Segment:{" "}
                <span className="font-medium text-slate-900">{plan.segment.label}</span> · Creativity window:{" "}
                <span className={`font-medium ${
                  plan.segment.creativity === "high" ? "text-purple-700" :
                  plan.segment.creativity === "medium" ? "text-violet-700" : "text-slate-900"
                }`}>{plan.segment.creativity}</span> · Skipped:{" "}
                <span className="font-medium text-slate-900">{skippedTaskIds.length}</span> · Done:{" "}
                <span className="font-medium text-slate-900">{doneTasks.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div> // deploy trigger
    </div>
  );
}
