import { Brain, Library, Lock, Play, Bot, FileEdit, MoreHorizontal } from 'lucide-react'
import Image from 'next/image'

export default function WorkspaceMockup() {
  return (
    <div className="relative mt-8 w-full max-w-6xl">
      {/* Floating Badges */}
      <div
        className="absolute -left-4 top-20 z-10 flex animate-bounce items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800 md:-left-12"
        style={{ animationDuration: '3s' }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active</p>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">AI Mentorship</p>
        </div>
      </div>
      <div
        className="absolute -right-4 bottom-32 z-10 flex animate-bounce items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800 md:-right-8"
        style={{ animationDuration: '4s', animationDelay: '1s' }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400">
          <Library className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Processing</p>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Multi-video Synthesis</p>
        </div>
      </div>

      {/* The Mockup Window */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0a0c10]">
        {/* Window Header */}
        <div className="flex h-12 items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex gap-2">
            <div className="h-3 w-3 rounded-full bg-red-400"></div>
            <div className="h-3 w-3 rounded-full bg-amber-400"></div>
            <div className="h-3 w-3 rounded-full bg-green-400"></div>
          </div>
          <div className="flex flex-1 justify-center">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-1 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              <Lock className="h-3 w-3" />
              flashnote.ai/workspace/intro-to-quantum
            </div>
          </div>
        </div>

        {/* Workspace Content */}
        <div className="flex h-[600px] flex-col bg-slate-50 dark:bg-[#0a0c10] md:flex-row">
          {/* Left Column: Video */}
          <div className="flex w-full flex-col gap-4 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0a0c10] md:w-5/12">
            <div className="group relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900">
              <Image
                alt="Abstract quantum physics simulation visualization"
                className="h-full w-full object-cover opacity-80 mix-blend-luminosity"
                src="https://picsum.photos/seed/quantum/800/450"
                fill
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <button className="flex h-16 w-16 items-center justify-center rounded-full border border-white/30 bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30">
                  <Play className="ml-1 h-8 w-8 fill-current" />
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 flex h-10 items-end bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/30">
                  <div className="h-full w-1/3 bg-primary"></div>
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-3">
              <h3 className="text-lg font-bold">Introduction to Quantum Computing</h3>
              <div className="flex gap-2">
                <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Physics
                </span>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Lecture 1
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-2 rounded-xl border border-primary/10 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Bot className="h-4 w-4" />
                  AI Mentor
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  I've analyzed this video. Key concepts include superposition and entanglement. Would you like me to
                  generate a summary or a quiz?
                </p>
                <div className="mt-2 flex gap-2">
                  <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
                    Generate Summary
                  </button>
                  <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
                    Create Quiz
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Notes */}
          <div className="flex w-full flex-col gap-6 overflow-y-auto bg-white p-6 dark:bg-[#0d1117] md:w-7/12 md:p-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <h2 className="flex items-center gap-2 text-2xl font-bold">
                <FileEdit className="h-6 w-6 text-primary" />
                Deep Note: Quantum Basics
              </h2>
              <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Note Section 1 */}
              <div className="group">
                <div className="mb-2 flex items-center gap-2">
                  <button className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary transition-colors hover:bg-primary/20">
                    12:04
                  </button>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Superposition Principle</h3>
                </div>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Unlike classical bits that are either 0 or 1, a qubit can exist in a superposition of both states
                  simultaneously. This is represented mathematically by the equation |ψ⟩ = α|0⟩ + β|1⟩, where α and β
                  are probability amplitudes.
                </p>
                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 font-mono text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  |ψ⟩ = α|0⟩ + β|1⟩
                  <br />
                  |α|² + |β|² = 1
                </div>
              </div>

              {/* Note Section 2 */}
              <div className="group">
                <div className="mb-2 flex items-center gap-2">
                  <button className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary transition-colors hover:bg-primary/20">
                    24:15
                  </button>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Quantum Entanglement</h3>
                </div>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  When qubits become entangled, the state of one qubit cannot be described independently of the state of
                  the others. Einstein famously referred to this as "spooky action at a distance."
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
                  <li>Enables quantum teleportation protocols</li>
                  <li>Crucial for quantum cryptography (QKD)</li>
                  <li>Basis for quantum error correction</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
