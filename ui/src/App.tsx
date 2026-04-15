import { useState } from 'react'
import ModelsTab from './tabs/ModelsTab'
import BenchmarkTab from './tabs/BenchmarkTab'
import ChatTab from './tabs/ChatTab'
import LeaderboardTab from './tabs/LeaderboardTab'
import './App.css'

type Tab = 'models' | 'chat' | 'benchmark' | 'leaderboard'

export default function App() {
  const [tab, setTab] = useState<Tab>('models')
  const [preselectedModel, setPreselectedModel] = useState<string | null>(null)
  const [preselectedEndpoint, setPreselectedEndpoint] = useState<string | null>(null)

  const handleBenchmarkModel = (model: string, endpoint: string) => {
    setPreselectedModel(model)
    setPreselectedEndpoint(endpoint)
    setTab('benchmark')
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'models', label: 'Models' },
    { id: 'chat', label: 'Chat' },
    { id: 'benchmark', label: 'Benchmark' },
    { id: 'leaderboard', label: 'Leaderboard' },
  ]

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-text">BenchLoop</span>
            <span className="logo-badge">local</span>
          </div>
          <nav className="nav">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={`nav-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="main">
        {tab === 'models' && <ModelsTab onBenchmark={handleBenchmarkModel} />}
        {tab === 'chat' && <ChatTab />}
        {tab === 'benchmark' && (
          <BenchmarkTab
            preselectedModel={preselectedModel}
            preselectedEndpoint={preselectedEndpoint}
            onClearPreselected={() => { setPreselectedModel(null); setPreselectedEndpoint(null); }}
          />
        )}
        {tab === 'leaderboard' && <LeaderboardTab />}
      </main>
    </div>
  )
}
