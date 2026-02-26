import { Shield, Lock, GitBranch, CheckCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Welcome() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#241510] via-[#1b2a22] to-[#102321]">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/20 via-slate-900/0 to-slate-900/0"></div>
        </div>

        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 mb-6">
                <Shield className="w-4 h-4 text-emerald-300" />
                <span className="text-xs tracking-wide uppercase text-emerald-200">Local-first secret control</span>
              </div>

              <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-6">
                Secrets,
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-cyan-300">
                  without the chaos.
                </span>
              </h1>

              <p className="text-lg text-slate-300 max-w-xl mb-8">
                EnVault turns scattered .env files into a secure, trackable flow your team can trust.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to="/signup"
                  className="px-7 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
                >
                  Start now
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/login"
                  className="px-7 py-3.5 bg-slate-800 text-white rounded-xl font-medium border border-slate-700 hover:bg-slate-700 transition-all text-center"
                >
                  Sign In
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 shadow-2xl shadow-black/30">
              <div className="flex items-center gap-2 mb-5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-3 text-xs text-slate-400">secure-flow.env</span>
              </div>

              <div className="space-y-3 text-sm">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-slate-300">
                  <span className="text-emerald-300">1.</span> Import .env from local project
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-slate-300">
                  <span className="text-emerald-300">2.</span> Validate schema and mask sensitive keys
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-slate-300">
                  <span className="text-emerald-300">3.</span> Compare staging/prod and export safely
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Flow */}
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="rounded-3xl border border-[#5d4b3a]/40 bg-[#1a1715]/70 backdrop-blur-sm p-8 md:p-12">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-10">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200/80 mb-2">Product Flow</p>
              <h2 className="text-3xl md:text-4xl font-semibold text-white">A cleaner path than 6 separate boxes</h2>
            </div>
            <p className="text-sm text-slate-300 max-w-md">Import, validate, and ship from one secure lane with clear ownership and audit visibility.</p>
          </div>

          <div className="relative">
            <div className="hidden md:block absolute left-0 right-0 top-6 h-px bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />

            <div className="grid md:grid-cols-3 gap-5">
              <div className="relative rounded-2xl border border-[#5d4b3a]/40 bg-[#221d1a]/80 p-6">
                <div className="inline-flex h-12 w-12 rounded-xl bg-amber-500/15 items-center justify-center border border-amber-400/30 mb-4">
                  <Lock className="w-5 h-5 text-amber-300" />
                </div>
                <p className="text-xs text-amber-200/80 mb-2">STEP 01</p>
                <h3 className="text-xl font-semibold text-white mb-2">Capture</h3>
                <p className="text-slate-300 text-sm">Pull local .env files into EnVault and encrypt values at rest from the first import.</p>
              </div>

              <div className="relative rounded-2xl border border-[#5d4b3a]/40 bg-[#221d1a]/80 p-6">
                <div className="inline-flex h-12 w-12 rounded-xl bg-emerald-500/15 items-center justify-center border border-emerald-400/30 mb-4">
                  <GitBranch className="w-5 h-5 text-emerald-300" />
                </div>
                <p className="text-xs text-emerald-200/80 mb-2">STEP 02</p>
                <h3 className="text-xl font-semibold text-white mb-2">Compare</h3>
                <p className="text-slate-300 text-sm">Diff local, staging and production quickly, with secret masking always on by default.</p>
              </div>

              <div className="relative rounded-2xl border border-[#5d4b3a]/40 bg-[#221d1a]/80 p-6">
                <div className="inline-flex h-12 w-12 rounded-xl bg-cyan-500/15 items-center justify-center border border-cyan-400/30 mb-4">
                  <CheckCircle className="w-5 h-5 text-cyan-300" />
                </div>
                <p className="text-xs text-cyan-200/80 mb-2">STEP 03</p>
                <h3 className="text-xl font-semibold text-white mb-2">Ship</h3>
                <p className="text-slate-300 text-sm">Export with confidence via CLI or UI, backed by audit logs for every important change.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-20">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-slate-400">
              <Shield className="w-5 h-5 text-emerald-400" />
              <span>Powered by @ACL Smart Software</span>
            </div>
            <div className="text-slate-500 text-sm">
              © 2026 EnVault. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
