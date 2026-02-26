import { FolderGit2, Plus, Layers, Sparkles, Trash2, Pencil } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import DeleteConfirmModal from '../components/DeleteConfirmModal'
import RenameModal from '../components/RenameModal'

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
  const [isCreating, setIsCreating] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; projectId: string; projectName: string }>({
    isOpen: false,
    projectId: '',
    projectName: ''
  })
  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; projectId: string; projectName: string }>({
    isOpen: false,
    projectId: '',
    projectName: ''
  })

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

    setIsCreating(true)
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
    setIsCreating(false)
  }

  const deleteProject = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId)
    if (!project) return
    
    setDeleteModal({ isOpen: true, projectId, projectName: project.name })
  }

  const handleDeleteConfirm = async () => {
    const res = await fetch(`/api/projects/${deleteModal.projectId}`, {
      method: 'DELETE'
    })

    if (res.ok) {
      setProjects(projects.filter(p => p.id !== deleteModal.projectId))
    }
    setDeleteModal({ isOpen: false, projectId: '', projectName: '' })
  }

  const handleDeleteCancel = () => {
    setDeleteModal({ isOpen: false, projectId: '', projectName: '' })
  }

  const renameProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId)
    if (!project) return
    setRenameModal({ isOpen: true, projectId, projectName: project.name })
  }

  const handleRename = async (newName: string) => {
    const res = await fetch(`/api/projects/${renameModal.projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to rename')
    }

    const updated = await res.json()
    setProjects(projects.map(p => p.id === updated.id ? { ...p, name: updated.name } : p))
    setRenameModal({ isOpen: false, projectId: '', projectName: '' })
  }

  const handleRenameCancel = () => {
    setRenameModal({ isOpen: false, projectId: '', projectName: '' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="text-center space-y-4 py-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-emerald-300">Secure Environment Management</span>
        </div>
        <h1 className="text-4xl font-bold text-white">Your Projects</h1>
        <p className="text-slate-400 max-w-lg mx-auto">
          Manage environment variables across multiple projects and environments with encryption at rest.
        </p>
      </div>

      {/* Create Project Card */}
      <div className="max-w-2xl mx-auto">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <form onSubmit={createProject} className="flex gap-3">
            <div className="flex-1 relative">
              <FolderGit2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Enter project name..."
                className="w-full pl-12 pr-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={!newProjectName.trim() || isCreating}
              className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium flex items-center gap-2 hover:shadow-lg hover:shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Plus className="w-5 h-5" />
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </form>
        </div>
      </div>

      {/* Projects Grid */}
      {projects.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, index) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="group relative bg-slate-800/40 backdrop-blur-sm rounded-2xl border border-slate-700/30 p-6 hover:bg-slate-800/60 hover:border-emerald-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/5"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="relative space-y-4">
                {/* Icon */}
                <div className="w-12 h-12 bg-gradient-to-br from-slate-700 to-slate-600 rounded-xl flex items-center justify-center group-hover:from-emerald-500/20 group-hover:to-teal-500/20 transition-all">
                  <FolderGit2 className="w-6 h-6 text-slate-300 group-hover:text-emerald-400 transition-colors" />
                </div>

                {/* Content */}
                <div>
                  <h2 className="text-xl font-semibold text-white group-hover:text-emerald-300 transition-colors">
                    {project.name}
                  </h2>
                  {project.description ? (
                    <p className="text-slate-400 text-sm mt-1">{project.description}</p>
                  ) : (
                    <p className="text-slate-500 text-sm mt-1 italic">No description</p>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 pt-2">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Layers className="w-4 h-4" />
                    <span>{project.environmentCount} environment{project.environmentCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      renameProject(project.id)
                    }}
                    className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                    title="Rename project"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      deleteProject(project.id)
                    }}
                    className="ml-auto p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <FolderGit2 className="w-10 h-10 text-slate-600" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No projects yet</h3>
          <p className="text-slate-400 max-w-md mx-auto">
            Create your first project to start managing environment variables securely.
          </p>
        </div>
      )}

      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        title="Delete Project"
        message={`Are you sure you want to delete "${deleteModal.projectName}"? This action cannot be undone and will delete all environments and variables.`}
        confirmLabel="Delete Project"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      <RenameModal
        isOpen={renameModal.isOpen}
        currentName={renameModal.projectName}
        onRename={handleRename}
        onCancel={handleRenameCancel}
      />
    </div>
  )
}
