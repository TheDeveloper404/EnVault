import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { Shield, LayoutDashboard } from 'lucide-react'
import Projects from './pages/Projects'
import Project from './pages/Project'

function App() {
  const location = useLocation()
  const isProjects = location.pathname === '/'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-emerald-500/30 transition-all">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">EnVault</h1>
                <p className="text-xs text-slate-400">Environment Management</p>
              </div>
            </Link>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-slate-300">{isProjects ? 'Projects' : 'Project View'}</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<Projects />} />
          <Route path="/projects/:id" element={<Project />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Powered by @ACL Smart Software</span>
            <span>EnVault v1.0.0</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
