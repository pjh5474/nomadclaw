import { useAgent } from "agents/react";
import { useState } from "react";
import type { NovelState } from "../worker/types";

const INITIAL: NovelState = {
  premise: "",
  status: "idle",
  totalChapters: 5,
  currentChapter: 0,
  chapters: [],
};

function App() {
  const [state, setState] = useState<NovelState>(INITIAL);
  const [premise, setPremise] = useState(
    "a lighthouse keeper who finds a map inside a bottle",
  );

  const agent = useAgent({
    agent: "NovelistAgent",
    onStateUpdate: setState,
  });

  const writing = state.status === "writing";
  const done = state.status === "done";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            📖 AI Novelist
          </h1>
          <p className="text-sm text-zinc-500">
            Type a premise. The agent writes a 5-chapter novel, one chapter at
            a time.
          </p>
        </header>

        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Premise
            </span>
            <input
              value={premise}
              onChange={(e) => setPremise(e.currentTarget.value)}
              placeholder="a lighthouse keeper who finds a map inside a bottle"
              disabled={writing}
              className="w-full rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white disabled:opacity-50"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => agent.stub.startNovel(premise)}
              disabled={writing || !premise.trim()}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
            >
              Start novel
            </button>
            <button
              type="button"
              onClick={() => agent.stub.resetNovel()}
              disabled={writing}
              className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </section>

        {writing && (
          <section className="flex items-center gap-3 rounded-2xl border border-zinc-200 border-l-4 border-l-blue-500 bg-white p-5 shadow-sm">
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500">
              <span className="absolute inset-0 animate-ping rounded-full bg-blue-500 opacity-75" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                Writing chapter {state.currentChapter} of {state.totalChapters}…
              </p>
              <p className="text-sm text-zinc-500">
                Premise: <em>{state.premise}</em>
              </p>
            </div>
          </section>
        )}

        {done && (
          <section className="flex items-center gap-3 rounded-2xl border border-zinc-200 border-l-4 border-l-emerald-500 bg-white p-5 shadow-sm">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              ✅ done
            </span>
            <p className="text-sm text-zinc-700">
              All {state.totalChapters} chapters written.
            </p>
          </section>
        )}

        {state.chapters.length === 0 && state.status === "idle" ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
            <div className="text-4xl">📖</div>
            <p className="mt-2 text-sm font-semibold">No chapters yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              Click Start novel to write the first one.
            </p>
          </section>
        ) : (
          <div className="space-y-3">
            {state.chapters.map((text, idx) => (
              <section
                key={idx}
                className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold tracking-tight">
                    Chapter {idx + 1}
                  </h3>
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    📖 saved
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                  {text}
                </p>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
