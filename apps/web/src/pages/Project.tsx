import { 
  ArrowLeft, 
  Plus, 
  Upload, 
  Eye, 
  EyeOff, 
  Key, 
  Shield, 
  Database,
  Layers,
  Copy,
  CheckCircle2,
  Terminal,
  Trash2
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import DeleteConfirmModal from '../components/DeleteConfirmModal'

interface Variable {
  id: string
  key: string
  value: string
  isSecret: boolean
}

interface Environment {
  id: string
  name: string
  variables: Variable[]
}

export default function Project() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<{ name: string } | null>(null)
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [activeEnv, setActiveEnv] = useState<string>('local')
  const [newEnvName, setNewEnvName] = useState('')
  const [importContent, setImportContent] = useState('')
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [isImporting, setIsImporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; envName: string }>({
    isOpen: false,
    envName: ''
  })

  useEffect(() => {
    if (!id) return

    fetch(`/api/projects/${id}`)
      .then(res => res.json())
      .then(data => setProject(data))

    fetch(`/api/projects/${id}/environments`)
      .then(res => res.json())
      .then(data => {
        setEnvironments(data)
        if (data.length > 0 && !data.find((e: Environment) => e.name === activeEnv)) {
          setActiveEnv(data[0].name)
        }
      })
  }, [id])

  const createEnvironment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEnvName.trim() || !id) return

    const res = await fetch(`/api/projects/${id}/environments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newEnvName })
    })

    if (res.ok) {
      const env = await res.json()
      setEnvironments([...environments, { ...env, variables: [] }])
      setActiveEnv(env.name)
      setNewEnvName('')
    }
  }

  const importEnv = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!importContent.trim() || !id) return

    setIsImporting(true)
    
    // Auto-create environment if it doesn't exist
    const envExists = environments.some(e => e.name === activeEnv)
    if (!envExists) {
      const createRes = await fetch(`/api/projects/${id}/environments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: activeEnv })
      })
      if (createRes.ok) {
        const newEnv = await createRes.json()
        setEnvironments([...environments, { ...newEnv, variables: [] }])
      }
    }
    
    const res = await fetch(`/api/projects/${id}/envs/${activeEnv}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: importContent, overwrite: true })
    })

    if (res.ok) {
      setImportContent('')
      const varsRes = await fetch(`/api/projects/${id}/envs/${activeEnv}/vars`)
      const vars = await varsRes.json()
      setEnvironments(environments.map(env =>
        env.name === activeEnv ? { ...env, variables: vars } : env
      ))
    }
    setIsImporting(false)
  }

  const toggleSecret = (varId: string) => {
    setShowSecrets(prev => ({ ...prev, [varId]: !prev[varId] }))
  }

  const copyToClipboard = () => {
    const vars = activeEnvironment?.variables || []
    const content = vars.map(v => `${v.key}=${v.value}`).join('\n')
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const deleteEnvironment = async (envName: string) => {
    setDeleteModal({ isOpen: true, envName })
  }

  const handleDeleteConfirm = async () => {
    const res = await fetch(`/api/projects/${id}/environments/${deleteModal.envName}`, {
      method: 'DELETE'
    })

    if (res.ok) {
      setEnvironments(environments.filter(e => e.name !== deleteModal.envName))
      if (activeEnv === deleteModal.envName && environments.length > 1) {
        const remaining = environments.filter(e => e.name !== deleteModal.envName)
        setActiveEnv(remaining[0]?.name || 'local')
      }
    }
    setDeleteModal({ isOpen: false, envName: '' })
  }

  const handleDeleteCancel = () => {
    setDeleteModal({ isOpen: false, envName: '' })
  }

  const activeEnvironment = environments.find(e => e.name === activeEnv)

  if (!project) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link 
          to="/" 
          className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-white">{project.name}</h1>
          <p className="text-slate-400 mt-1">Manage environments and variables</p>
        </div>
      </div>

      {/* Environment Tabs */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-2">
        <div className="flex items-center gap-2 flex-wrap">
          {environments.filter(Boolean).map(env => (
            <div key={env.id} className="flex items-center gap-1">
              <button
                onClick={() => setActiveEnv(env.name)}
                className={`px-5 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${
                  activeEnv === env.name
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Database className="w-4 h-4" />
                {env.name}
                <span className="text-xs opacity-70">({env.variables?.length || 0})</span>
              </button>
              <button
                onClick={() => deleteEnvironment(env.name)}
                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title={`Delete ${env.name} environment`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          
          {/* Add Environment */}
          <form onSubmit={createEnvironment} className="flex gap-2 ml-2">
            <input
              type="text"
              value={newEnvName}
              onChange={(e) => setNewEnvName(e.target.value)}
              placeholder="New env..."
              className="w-32 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <button 
              type="submit"
              disabled={!newEnvName.trim()}
              className="px-3 py-2 bg-slate-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Import Section */}
        <div className="space-y-6">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-400" />
              Import .env
            </h3>
            <form onSubmit={importEnv} className="space-y-4">
              <textarea
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
                placeholder={`# Paste .env content here\nDATABASE_URL=postgresql://...\nAPI_KEY=sk_live_...\nPORT=3000`}
                rows={8}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-xl font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
              />
              <button
                type="submit"
                disabled={!importContent.trim() || isImporting}
                className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-emerald-500/25 disabled:opacity-50 transition-all"
              >
                <Upload className="w-4 h-4" />
                {isImporting ? 'Importing...' : `Import to ${activeEnv}`}
              </button>
            </form>
          </div>

          {/* Quick Stats */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              Quick Stats
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/50 rounded-xl p-4">
                <p className="text-2xl font-bold text-emerald-400">{activeEnvironment?.variables.length || 0}</p>
                <p className="text-sm text-slate-400">Variables</p>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-4">
                <p className="text-2xl font-bold text-amber-400">
                  {activeEnvironment?.variables.filter(v => v.isSecret).length || 0}
                </p>
                <p className="text-sm text-slate-400">Secrets</p>
              </div>
            </div>
          </div>
        </div>

        {/* Variables List */}
        <div>
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
            {/* Table Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-emerald-400" />
                Environment Variables
              </h3>
              {activeEnvironment?.variables && activeEnvironment.variables.length > 0 && (
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy All'}
                </button>
              )}
            </div>

            {activeEnvironment && activeEnvironment.variables.length > 0 ? (
              <div className="divide-y divide-slate-700/50">
                {activeEnvironment.variables.map((variable) => (
                  <div 
                    key={variable.id}
                    className="px-6 py-4 flex items-center gap-4 hover:bg-slate-700/30 transition-colors"
                  >
                    {/* Key */}
                    <div className="w-1/3">
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-slate-500" />
                        <code className="text-sm font-mono text-emerald-300">{variable.key}</code>
                        {variable.isSecret && (
                          <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded-full flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            Secret
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Value */}
                    <div className="flex-1">
                      <code className="text-sm font-mono text-slate-300">
                        {variable.isSecret && !showSecrets[variable.id]
                          ? '••••••••••••••••'
                          : variable.value
                        }
                      </code>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {variable.isSecret && (
                        <button
                          onClick={() => toggleSecret(variable.id)}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                          title={showSecrets[variable.id] ? 'Hide' : 'Show'}
                        >
                          {showSecrets[variable.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      )}
                      <button
                        onClick={() => navigator.clipboard.writeText(`${variable.key}=${variable.value}`)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                        title="Copy"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-16 text-center">
                <div className="w-16 h-16 bg-slate-700/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Terminal className="w-8 h-8 text-slate-500" />
                </div>
                <h4 className="text-lg font-medium text-white mb-2">No variables yet</h4>
                <p className="text-slate-400 text-sm max-w-sm mx-auto">
                  Import environment variables from a .env file or add them manually via the CLI.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        title="Delete Environment"
        message={`Are you sure you want to delete environment "${deleteModal.envName}"? This will delete all variables in this environment.`}
        confirmLabel="Delete Environment"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  )
}
