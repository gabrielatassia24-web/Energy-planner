 import React, { useMemo, useState } from "react";
import { Brain, CheckCircle2, Clock3, Moon, PlayCircle, Sparkles, Sun, Trash2, Zap } from "lucide-react";

type EnergyLevel = "low" | "medium" | "high";
type TaskType = "deep work" | "physical" | "life admin" | "chore" | "recovery";
type SegmentKey = "morning" | "midday" | "afternoon" | "evening";

interface EnergyState {
  value: "tired" | "normal" | "energized";
  label: string;
  icon: typeof Moon;
  multiplier: number;
}

interface DaySegment {
  key: SegmentKey;
  label: string;
  start: number;
  end: number;
  energy: EnergyLevel;
  goodTypes: TaskType[];
}

interface Task {
  id: string;
  title: string;
  type: TaskType;
  energy: EnergyLevel;
  duration: number;
  importance: number;
  urgency: number;
  preferredSegment: SegmentKey;
  done: boolean;
  score?: number;
}

interface TaskForm {
  title: string;
  type: TaskType;
  energy: EnergyLevel;
  duration: number;
  importance: number;
  urgency: number;
  preferredSegment: SegmentKey;
}

const ENERGY_STATES: EnergyState[] = [
  { value: "tired", label: "Tired", icon: Moon, multiplier: 0.7 },
  { value: "normal", label: "Normal", icon: Sun, multiplier: 1 },
  { value: "energized", label: "Energized", icon: Zap, multiplier: 1.25 },
];

const ENERGY_SCORE = { low: 1, medium: 2, high: 3 };
const TASK_TYPES: TaskType[] = ["deep work", "physical", "life admin", "chore", "recovery"];
const DAY_SEGMENTS: DaySegment[] = [
  { key: "morning", label: "Morning", start: 6, end: 11, energy: "high", goodTypes: ["physical", "deep work"] },
  { key: "midday", label: "Midday", start: 11, end: 15, energy: "high", goodTypes: ["deep work", "life admin"] },
  { key: "afternoon", label: "Afternoon", start: 15, end: 18, energy: "medium", goodTypes: ["life admin", "physical"] },
  { key: "evening", label: "Evening", start: 18, end: 23, energy: "low", goodTypes: ["chore", "recovery"] },
];

const initialTasks: Task[] = [
  {
    id: crypto.randomUUID(),
    title: "Gym",
    type: "physical",
    energy: "high",
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
    duration: 20,
    importance: 4,
    urgency: 2,
    preferredSegment: "evening",
    done: false,
  },
];

function inputClass() {
  return "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500";
}

function cardClass() {
  return "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm";
}

function buttonClass(kind = "primary") {
  if (kind === "secondary") {
    return "inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50";
  }
  if (kind === "ghost") {
    return "inline-flex items-center justify-center rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200";
  }
  return "inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800";
}

function pillClass(active: boolean) {
  return active
    ? "rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-left text-white"
    : "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-800 hover:bg-slate-50";
}

function energyBadgeClass(level: EnergyLevel) {
  if (level === "high") return "border border-emerald-200 bg-emerald-100 text-emerald-800";
  if (level === "medium") return "border border-amber-200 bg-amber-100 text-amber-800";
  return "border border-slate-200 bg-slate-100 text-slate-800";
}

function getSegmentByHour(hour: number): DaySegment {
  return DAY_SEGMENTS.find((segment) => hour >= segment.start && hour < segment.end) || DAY_SEGMENTS[3];
}

function scoreTask(task: Task, segment: DaySegment, energyState: EnergyState): number {
  if (task.done) return -9999;

  let score = 0;
  score += task.importance * 10;
  score += task.urgency * 8;

  const currentEnergy = ENERGY_SCORE[segment.energy] * energyState.multiplier;
  const taskEnergy = ENERGY_SCORE[task.energy];
  const energyGap = Math.abs(currentEnergy - taskEnergy);
  score += 24 - energyGap * 10;

  if (task.preferredSegment === segment.key) score += 18;
  if (segment.goodTypes.includes(task.type)) score += 12;

  if (energyState.value === "tired" && task.energy === "high") score -= 18;
  if (energyState.value === "energized" && task.energy === "low") score -= 6;

  if (task.duration <= 30) score += 4;
  if (energyState.value === "tired" && task.duration > 60) score -= 10;

  return score;
}

function buildPlan(tasks: Task[], hour: number, energyState: EnergyState) {
  const segment = getSegmentByHour(hour);
  const remaining = tasks.filter((task) => !task.done);

  const ranked = remaining
    .map((task) => ({
      ...task,
      score: scoreTask(task, segment, energyState),
    }))
    .sort((a, b) => b.score - a.score);

  const nowTask = ranked[0] || null;

  return {
    segment,
    ranked,
    nowTask,
  };
}

export default function DayPlannerDecidesForYou() {
  const [tasks, setTasks] = useState(initialTasks);
  const [energyStateValue, setEnergyStateValue] = useState("normal");
  const [currentHour, setCurrentHour] = useState(10);
  const [taskForm, setTaskForm] = useState<TaskForm>({
    title: "",
    type: "deep work",
    energy: "medium",
    duration: 30,
    importance: 3,
    urgency: 3,
    preferredSegment: "midday",
  });

  const energyState = ENERGY_STATES.find((state) => state.value === energyStateValue) || ENERGY_STATES[1];
  const plan = useMemo(() => buildPlan(tasks, Number(currentHour), energyState), [tasks, currentHour, energyState]);

  function addTask() {
    if (!taskForm.title.trim()) return;
    setTasks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: taskForm.title.trim(),
        type: taskForm.type,
        energy: taskForm.energy,
        duration: Number(taskForm.duration),
        importance: Number(taskForm.importance),
        urgency: Number(taskForm.urgency),
        preferredSegment: taskForm.preferredSegment,
        done: false,
      },
    ]);
    setTaskForm({
      title: "",
      type: "deep work",
      energy: "medium",
      duration: 30,
      importance: 3,
      urgency: 3,
      preferredSegment: "midday",
    });
  }

  function markDone(id: string) {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, done: true } : task)));
  }

  function deleteTask(id: string) {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }

  function resetDay() {
    setTasks((prev) => prev.map((task) => ({ ...task, done: false })));
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Day Planner That Decides For You</h1>
              <p className="mt-1 text-sm text-slate-600">
                Tell it your energy, time of day, and tasks. It picks what you should do now.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={resetDay} className={buttonClass("secondary")}>
                Reset day
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[380px,1fr]">
          <div className="space-y-6">
            <div className={cardClass()}>
              <h2 className="text-lg font-semibold text-slate-900">How are you feeling?</h2>
              <div className="mt-4 grid gap-3">
                {ENERGY_STATES.map((state) => {
                  const Icon = state.icon;
                  const active = state.value === energyStateValue;
                  return (
                    <button
                      key={state.value}
                      onClick={() => setEnergyStateValue(state.value)}
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

            <div className={cardClass()}>
              <h2 className="text-lg font-semibold text-slate-900">What time is it?</h2>
              <div className="mt-4 space-y-3">
                <input
                  type="range"
                  min="6"
                  max="22"
                  value={currentHour}
                  onChange={(e) => setCurrentHour(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>{String(currentHour).padStart(2, "0")}:00</span>
                  <span>{plan.segment.label}</span>
                </div>
              </div>
            </div>

            <div className={cardClass()}>
              <h2 className="text-lg font-semibold text-slate-900">Add a task</h2>
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
                      {TASK_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Energy needed</label>
                    <select
                      className={inputClass()}
                      value={taskForm.energy}
                      onChange={(e) => setTaskForm({ ...taskForm, energy: e.target.value as EnergyLevel })}
                    >
                      {["low", "medium", "high"].map((level) => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Duration (minutes)</label>
                    <input
                      className={inputClass()}
                      type="number"
                      min={10}
                      max={180}
                      value={taskForm.duration}
                      onChange={(e) => setTaskForm({ ...taskForm, duration: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Best time of day</label>
                    <select
                      className={inputClass()}
                      value={taskForm.preferredSegment}
                      onChange={(e) => setTaskForm({ ...taskForm, preferredSegment: e.target.value as SegmentKey })}
                    >
                      {DAY_SEGMENTS.map((segment) => (
                        <option key={segment.key} value={segment.key}>{segment.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Importance (1-5)</label>
                    <input
                      className={inputClass()}
                      type="number"
                      min={1}
                      max={5}
                      value={taskForm.importance}
                      onChange={(e) => setTaskForm({ ...taskForm, importance: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Urgency (1-5)</label>
                    <input
                      className={inputClass()}
                      type="number"
                      min={1}
                      max={5}
                      value={taskForm.urgency}
                      onChange={(e) => setTaskForm({ ...taskForm, urgency: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <button onClick={addTask} className={`${buttonClass()} w-full`}>
                  <Sparkles className="mr-2 h-4 w-4" /> Add task
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-900 bg-slate-900 p-6 text-white shadow-sm">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Brain className="h-4 w-4" /> Planner decision
              </div>
              {plan.nowTask ? (
                <>
                  <h2 className="mt-3 text-3xl font-semibold">Do this now: {plan.nowTask.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-300">
                    This fits your current energy, the time of day, and how important and urgent it is.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white/10 px-3 py-1">{plan.segment.label}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">{plan.nowTask.duration} min</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">{plan.nowTask.type}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">Energy: {plan.nowTask.energy}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">Score: {Math.round(plan.nowTask.score)}</span>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button onClick={() => markDone(plan.nowTask.id)} className={buttonClass("secondary")}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Mark done
                    </button>
                    <button className={buttonClass("ghost")}>
                      <PlayCircle className="mr-2 h-4 w-4" /> Start task
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-4 text-slate-300">You are done for today. Nice work.</div>
              )}
            </div>

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
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-slate-200 px-2 py-1 text-slate-700">{task.type}</span>
                            <span className={`rounded-full px-2 py-1 ${energyBadgeClass(task.energy)}`}>{task.energy}</span>
                            <span className="rounded-full border border-slate-200 px-2 py-1 text-slate-700">{task.duration} min</span>
                            <span className="rounded-full border border-slate-200 px-2 py-1 text-slate-700">importance {task.importance}</span>
                            <span className="rounded-full border border-slate-200 px-2 py-1 text-slate-700">urgency {task.urgency}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-slate-900">{Math.round(task.score)}</div>
                          <div className="text-xs text-slate-500">fit score</div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={() => markDone(task.id)} className={buttonClass("secondary")}>
                          <CheckCircle2 className="mr-2 h-4 w-4" /> Done
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

            <div className={cardClass()}>
              <h2 className="text-lg font-semibold text-slate-900">How it decides</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-medium text-slate-900">1. Current energy</div>
                  <p className="mt-1 text-sm text-slate-600">If you are tired, it avoids heavy tasks when possible.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-medium text-slate-900">2. Time of day</div>
                  <p className="mt-1 text-sm text-slate-600">Morning favors hard tasks. Evening favors easier ones.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-medium text-slate-900">3. Importance + urgency</div>
                  <p className="mt-1 text-sm text-slate-600">Important and urgent tasks rise to the top.</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                Current mode: <span className="font-medium text-slate-900">{energyState.label}</span> · Current segment: <span className="font-medium text-slate-900">{plan.segment.label}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
