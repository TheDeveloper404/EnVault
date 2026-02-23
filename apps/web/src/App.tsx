import { Routes, Route, Link } from 'react-router-dom'
import Projects from './pages/Projects'
import Project from './pages/Project'

function App() {
  return (
    <div className="min-h-screen">
      <nav className="bg-slate-800 text-white p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-xl font-bold">EnVault</Link>
          <div className="text-sm text-slate-400">Secure Environment Management</div>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto p-4">
        <Routes>
          <Route path="/" element={<Projects />} />
          <Route path="/projects/:id" element={<Project />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
