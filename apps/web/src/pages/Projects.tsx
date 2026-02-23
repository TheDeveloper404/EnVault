import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

interface Project {
  id: string
  name: string
  description?: string
  environmentCount: number
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [newProjectName, setNewProjectName] = useState('')

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        setProjects(data)
        setLoading(false)
      })
  }, [])

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProjectName.trim()) return

    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newProjectName })
    })

    if (res.ok) {
      const project = await res.json()
      setProjects([...projects, project])
      setNewProjectName('')
    }
  }

  if (loading) return <div className="p-4">Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
      </div>

      <form onSubmit={createProject} className="flex gap-2 max-w-md">
        <input
          type="text"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          placeholder="New project name"
          className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map(project => (
          <Link
            key={project.id}
            to={`/projects/${project.id}`}
            className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h2 className="text-lg font-semibold">{project.name}</h2>
            {project.description && (
              <p className="text-gray-600 text-sm mt-1">{project.description}</p>
            )}
            <p className="text-gray-500 text-sm mt-2">
              {project.environmentCount} environments
            </p>
          </Link>
        ))}
      </div>

      {projects.length === 0 && (
        <p className="text-gray-500 text-center py-8">
          No projects yet. Create one above to get started.
        </p>
      )}
    </div>
  )
}
