"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";
type Message = { id: string; role: Role; content: string; ts: number };

type Module = {
  id: string;
  name: string;
  group:
    | "Start / Intake"
    | "Context & Knowledge"
    | "Policy & Guardrails"
    | "Execution"
    | "Assurance"
    | "Audit & Reporting";
  status: "Configured" | "Needs setup" | "Blocked";
  description: string;
};

type Session = { id: string; title: string; messages: Message[]; createdAt: number };

const STORAGE_KEY = "ssx_sessions_v1";
const DEFAULT_TITLE = "New chat";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

const MODULES: Module[] = [
  { id: "intake", name: "Use case intake", group: "Start / Intake", status: "Configured", description: "Capture objective, user, constraints, and success criteria." },
  { id: "sensitivity", name: "Purpose & sensitivity", group: "Start / Intake", status: "Configured", description: "Collect purpose, data sensitivity, region, and environment." },
  { id: "context_builder", name: "Context builder", group: "Context & Knowledge", status: "Configured", description: "Assemble context from selected sources and user inputs." },
  { id: "source_picker", name: "Retrieval / sources", group: "Context & Knowledge", status: "Needs setup", description: "Pick sources (docs/APIs) and set caps (top-k, chunk limit)." },
  { id: "pdp", name: "Policy decision", group: "Policy & Guardrails", status: "Configured", description: "Evaluate allow/deny + constraints based on attributes." },
  { id: "serving_paths", name: "Allowed serving paths", group: "Policy & Guardrails", status: "Needs setup", description: "Route to approved tools/APIs based on policy outcome." },
  { id: "workflow", name: "Workflow runner", group: "Execution", status: "Configured", description: "Run a workflow: plan → execute → verify → summarize." },
  { id: "hitl", name: "Human approval", group: "Execution", status: "Configured", description: "Escalate to a human for approval before proceeding." },
  { id: "eval", name: "Evaluation checks", group: "Assurance", status: "Needs setup", description: "Score response quality, coverage, and risks. Store results." },
  { id: "explain", name: "Explainability view", group: "Assurance", status: "Configured", description: "Show rationale, assumptions, and evidence blocks." },
  { id: "audit", name: "Audit log viewer", group: "Audit & Reporting", status: "Configured", description: "Trace inputs → decisions → actions → outputs for a session." },
  { id: "telemetry", name: "Metrics / telemetry", group: "Audit & Reporting", status: "Needs setup", description: "Track latency, costs, outcomes, and policy decisions over time." },
];

const LANDING_SUGGESTIONS = [
  "Help me think through a team restructure",
  "I have a tough feedback conversation coming up",
  "Should we build or buy this capability?",
  "Help me design an instrument-led conversational UI",
];

function groupModules(mods: Module[]) {
  const map = new Map<Module["group"], Module[]>();
  for (const m of mods) {
    if (!map.has(m.group)) map.set(m.group, []);
    map.get(m.group)!.push(m);
  }
  return Array.from(map.entries());
}

function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Session[];
  } catch {
    return [];
  }
}

function saveSessions(sessions: Session[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function summarizeTitle(messages: Message[]) {
  const firstUser = messages.find((m) => m.role === "user")?.content?.trim();
  if (!firstUser) return DEFAULT_TITLE;
  return firstUser.length > 32 ? firstUser.slice(0, 32) + "…" : firstUser;
}

// Mock “orchestrator” — replace later with your real backend.
function ssxRespond(userText: string) {
  const lower = userText.toLowerCase();

  if (lower.includes("build") && lower.includes("buy")) {
    return {
      text:
        "Let’s do a quick build-vs-buy decision in 6 steps: (1) capability scope, (2) integration complexity, (3) compliance + audit needs, (4) time-to-value, (5) TCO, (6) strategic differentiation. Which capability are we deciding on?",
      options: ["Define capability scope", "List integration points", "Estimate TCO", "Run policy decision"],
    };
  }

  if (lower.includes("instrument") || lower.includes("conversational ui") || lower.includes("instruments")) {
    return {
      text:
        "SSx works best when chat is the surface and instruments are the control plane. We’ll: (1) intake goal, (2) choose instruments, (3) collect required attributes, (4) run policy/constraints, (5) execute, (6) audit. Want the left-panel module taxonomy and the first 10 option chips?",
      options: ["Generate module taxonomy", "Draft option chips", "Create workflow", "Show audit trace"],
    };
  }

  if (lower.includes("restructure") || lower.includes("team")) {
    return {
      text:
        "To restructure well, anchor on outcomes and interfaces. What’s the goal (cost, speed, quality, ownership clarity), and what are the 3–5 core domains/products the team supports?",
      options: ["Clarify goals", "List domains/products", "Map current org", "Propose target org"],
    };
  }

  if (lower.includes("feedback") || lower.includes("conversation")) {
    return {
      text:
        "Tell me the situation in 2–3 lines: what happened, impact, and the change you want. I’ll turn it into a clear, respectful script with two phrasing options.",
      options: ["Give 2–3 line summary", "Draft short script", "Draft longer script", "Add follow-up plan"],
    };
  }

  return {
    text:
      "Got it. To move this forward SSx-style, pick one: intake the goal, choose instruments, or jump straight to an execution plan. What do you want first?",
    options: ["Use case intake", "Pick instruments", "Create workflow", "Run policy decision"],
  };
}

function StatusPill({ status }: { status: Module["status"] }) {
  const cls =
    status === "Configured"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : status === "Needs setup"
      ? "bg-amber-500/15 text-amber-200 border-amber-500/30"
      : "bg-rose-500/15 text-rose-200 border-rose-500/30";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
      {status}
    </span>
  );
}

export default function SSxShell() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [moduleQuery, setModuleQuery] = useState("");
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);

  const [draft, setDraft] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [mode, setMode] = useState<"Draft" | "Execute">("Draft");

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId),
    [sessions, activeId]
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loaded = loadSessions();
    if (loaded.length === 0) {
      const s: Session = { id: uid("sess"), title: DEFAULT_TITLE, messages: [], createdAt: Date.now() };
      setSessions([s]);
      setActiveId(s.id);
      saveSessions([s]);
      return;
    }
    setSessions(loaded);
    setActiveId(loaded[0].id);
  }, []);

  useEffect(() => {
    if (sessions.length) saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    // auto-scroll
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeSession?.messages?.length]);

  function newChat() {
    const s: Session = { id: uid("sess"), title: DEFAULT_TITLE, messages: [], createdAt: Date.now() };
    const next = [s, ...sessions];
    setSessions(next);
    setActiveId(s.id);
    setOptions([]);
    setDraft("");
    setSelectedModule(null);
  }

  function appendMessage(role: Role, content: string) {
    if (!activeSession) return;

    const msg: Message = { id: uid("msg"), role, content, ts: Date.now() };
    const updated = sessions.map((s) =>
      s.id === activeSession.id ? { ...s, messages: [...s.messages, msg] } : s
    );

    const updated2 = updated.map((s) => {
      if (s.id !== activeSession.id) return s;
      const title = summarizeTitle([...s.messages, msg]);
      return { ...s, title };
    });

    setSessions(updated2);
  }

  function send(text: string) {
    const t = text.trim();
    if (!t || !activeSession) return;

    appendMessage("user", t);
    setDraft("");

    const res = ssxRespond(t);
    const assistantText =
      mode === "Execute"
        ? `✅ (Execute) ${res.text}\n\n(Stub) In v2, this would trigger instrument runs + audit logging.`
        : res.text;

    setTimeout(() => {
      appendMessage("assistant", assistantText);
      setOptions(res.options);
    }, 200);
  }

  const filteredModules = useMemo(() => {
    const q = moduleQuery.trim().toLowerCase();
    if (!q) return MODULES;
    return MODULES.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.group.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  }, [moduleQuery]);

  const grouped = useMemo(() => groupModules(filteredModules), [filteredModules]);

  return (
    <div className="h-screen w-screen bg-black text-zinc-100">
      <div className="grid h-full grid-cols-[340px_1fr]">
        {/* LEFT SIDEBAR */}
        <aside className="border-r border-zinc-800 bg-zinc-950/50">
          <div className="p-4">
            <button
              onClick={newChat}
              className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-left text-sm font-medium hover:bg-zinc-800"
            >
              + New Chat
            </button>

            <div className="mt-4">
              <input
                value={moduleQuery}
                onChange={(e) => setModuleQuery(e.target.value)}
                placeholder="Search instruments…"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
              />
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs text-zinc-400">Sessions</div>
              <div className="space-y-1">
                {sessions.slice(0, 8).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveId(s.id)}
                    className={[
                      "w-full rounded-lg px-3 py-2 text-left text-sm",
                      s.id === activeId ? "bg-zinc-900" : "hover:bg-zinc-900/60",
                    ].join(" ")}
                  >
                    {s.title || DEFAULT_TITLE}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-4 pb-4">
            <div className="mb-2 text-xs text-zinc-400">Instruments</div>
            <div className="space-y-4">
              {grouped.map(([group, mods]) => (
                <div key={group}>
                  <div className="mb-2 text-xs font-semibold text-zinc-300">{group}</div>
                  <div className="space-y-2">
                    {mods.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedModule(m)}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-left hover:bg-zinc-900"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">{m.name}</div>
                          <StatusPill status={m.status} />
                        </div>
                        <div className="mt-1 text-xs text-zinc-400">{m.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* RIGHT PANE */}
        <main className="relative flex h-full flex-col">
          {/* top bar */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-zinc-800" />
              <div>
                <div className="text-sm font-semibold">SSx</div>
                <div className="text-xs text-zinc-400">Instrument-led conversational system</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
                Mode:{" "}
                <button
                  className={`ml-1 rounded-lg px-2 py-1 ${mode === "Draft" ? "bg-zinc-900" : "hover:bg-zinc-900/60"}`}
                  onClick={() => setMode("Draft")}
                >
                  Draft
                </button>
                <button
                  className={`ml-1 rounded-lg px-2 py-1 ${mode === "Execute" ? "bg-zinc-900" : "hover:bg-zinc-900/60"}`}
                  onClick={() => setMode("Execute")}
                >
                  Execute
                </button>
              </div>
              <div className="h-9 w-9 rounded-full bg-zinc-800" title="User" />
            </div>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="flex-1 overflow-auto px-6 py-6">
            {activeSession && activeSession.messages.length === 0 ? (
              <div className="mx-auto mt-20 max-w-2xl text-center">
                <div className="mx-auto mb-4 h-20 w-20 rounded-full border border-zinc-700 bg-zinc-900" />
                <div className="text-3xl font-semibold">What’s on your mind?</div>
                <div className="mt-3 text-sm text-zinc-400">
                  I’m SSx — an instrument-led assistant. Ask me anything about org design, strategy, or building governed AI experiences.
                </div>

                <div className="mt-8 space-y-3">
                  {LANDING_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="mx-auto block w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-left text-sm hover:bg-zinc-900"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-4">
                {activeSession?.messages.map((m) => (
                  <div
                    key={m.id}
                    className={[
                      "rounded-2xl border px-4 py-3",
                      m.role === "assistant"
                        ? "border-zinc-800 bg-zinc-950"
                        : "border-zinc-700 bg-zinc-900/40",
                    ].join(" ")}
                  >
                    <div className="mb-1 text-xs text-zinc-400">
                      {m.role === "assistant" ? "SSx" : "You"}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                  </div>
                ))}

                {options.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {options.map((o) => (
                      <button
                        key={o}
                        onClick={() => send(o)}
                        className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs hover:bg-zinc-900"
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* composer */}
          <div className="border-t border-zinc-800 px-6 py-4">
            <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                placeholder="Ask SSx anything…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600"
              />
              <button
                onClick={() => send(draft)}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
              >
                ↑
              </button>
            </div>
            <div className="mx-auto mt-2 max-w-3xl text-center text-xs text-zinc-500">
              Tip: click an instrument on the left to see its details (v1 shows a drawer stub).
            </div>
          </div>

          {/* module drawer */}
          {selectedModule && (
            <div className="absolute inset-0 flex justify-end bg-black/40">
              <div className="h-full w-full max-w-md border-l border-zinc-800 bg-zinc-950 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold">{selectedModule.name}</div>
                    <div className="mt-1 text-xs text-zinc-400">{selectedModule.group}</div>
                  </div>
                  <button
                    onClick={() => setSelectedModule(null)}
                    className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Status</div>
                    <StatusPill status={selectedModule.status} />
                  </div>
                  <div className="mt-2 text-sm text-zinc-300">{selectedModule.description}</div>
                </div>

                <div className="mt-4 space-y-3">
                  <button
                    onClick={() => {
                      send(`Run instrument: ${selectedModule.name}`);
                      setSelectedModule(null);
                    }}
                    className="w-full rounded-2xl bg-zinc-900 px-4 py-3 text-left text-sm font-medium hover:bg-zinc-800"
                  >
                    Run / Attach to chat
                    <div className="mt-1 text-xs font-normal text-zinc-400">
                      (v1) Simulated — in v2 this calls /modules/{selectedModule.id}/run
                    </div>
                  </button>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-400">
                    Next: wire this drawer to real schemas + API calls, and show run history here.
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
