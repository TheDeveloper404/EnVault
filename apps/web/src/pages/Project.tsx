import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

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

    const res = await fetch(`/api/projects/${id}/envs/${activeEnv}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: importContent, overwrite: true })
    })

    if (res.ok) {
      setImportContent('')
      // Refresh variables
      const varsRes = await fetch(`/api/projects/${id}/envs/${activeEnv}/vars`)
      const vars = await varsRes.json()
      setEnvironments(environments.map(env =>
        env.name === activeEnv ? { ...env, variables: vars } : env
      ))
    }
  }

  const toggleSecret = (varId: string) => {
    setShowSecrets(prev => ({ ...prev, [varId]: !prev[varId] }))
  }

  const activeEnvironment = environments.find(e => e.name === activeEnv)

  if (!project) return <div className="p-4">Loading...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{project.name}</h1>

      {/* Environment Tabs */}
      <div className="flex items-center gap-2 border-b">
        {environments.map(env => (
          <button
            key={env.id}
            onClick={() => setActiveEnv(env.name)}
            className={`px-4 py-2 font-medium ${
              activeEnv === env.name
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {env.name}
          </button>
        ))}
        <form onSubmit={createEnvironment} className="flex gap-2 ml-4">
          <input
            type="text"
            value={newEnvName}
            onChange={(e) => setNewEnvName(e.target.value)}
            placeholder="New env"
            className="px-2 py-1 text-sm border rounded"
          />
          <button type="submit" className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">
            +
          </button>
        </form>
      </div>

      {/* Import */}
      <form onSubmit={importEnv} className="space-y-2">
        <textarea
          value={importContent}
          onChange={(e) => setImportContent(e.target.value)}
          placeholder="Paste .env content here..."
          rows={4}
          className="w-full px-3 py-2 border rounded font-mono text-sm"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Import to {activeEnv}
        </button>
      </form>

      {/* Variables List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Key</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Value</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {activeEnvironment?.variables.map((variable: Variable) => (
              <tr key={variable.id}>
                <td className="px-4 py-2 font-mono text-sm">{variable.key}</td>
                <td className="px-4 py-2 font-mono text-sm">
                  {variable.isSecret && !showSecrets[variable.id]
                    ? '••••••••'
                    : variable.value
                  }
                </td>
                <td className="px-4 py-2">
                  {variable.isSecret && (
                    <button
                      onClick={() => toggleSecret(variable.id)}
                      className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                    >
                      {showSecrets[variable.id] ? 'Hide' : 'Show'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!activeEnvironment?.variables?.length && (
          <p className="p-4 text-gray-500 text-center">No variables yet. Import some above.</p>
        )}
      </div>
    </div>
  )
}
