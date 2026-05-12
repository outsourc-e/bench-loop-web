import { useState } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import ModelsTab from './tabs/ModelsTab'
import BenchmarkTab from './tabs/BenchmarkTab'
import ChatTab from './tabs/ChatTab'
import LeaderboardTab from './tabs/LeaderboardTab'
import StackLeaderboardTab from './tabs/StackLeaderboardTab'
import RunDetailPage from './pages/RunDetailPage'
import ComparePage from './pages/ComparePage'
import './App.css'

export default function App() {
  const navigate = useNavigate()
  const [preselectedModel, setPreselectedModel] = useState<string | null>(null)
  const [preselectedEndpoint, setPreselectedEndpoint] = useState<string | null>(null)

  const handleBenchmarkModel = (model: string, endpoint: string) => {
    setPreselectedModel(model)
    setPreselectedEndpoint(endpoint)
    navigate('/benchmark')
  }

  const navItems = [
    { to: '/', label: 'Models' },
    { to: '/chat', label: 'Chat' },
    { to: '/benchmark', label: 'Benchmark' },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: '/compare', label: 'Compare' },
    { to: '/stacks', label: 'Stacks' },
  ]

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <span className="logo-text">BenchLoop</span>
            <span className="logo-badge">local</span>
          </div>
          <nav className="nav">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<ModelsTab onBenchmark={handleBenchmarkModel} />} />
          <Route path="/models" element={<ModelsTab onBenchmark={handleBenchmarkModel} />} />
          <Route path="/chat" element={<ChatTab />} />
          <Route
            path="/benchmark"
            element={
              <BenchmarkTab
                preselectedModel={preselectedModel}
                preselectedEndpoint={preselectedEndpoint}
                onClearPreselected={() => { setPreselectedModel(null); setPreselectedEndpoint(null) }}
              />
            }
          />
          <Route path="/leaderboard" element={<LeaderboardTab />} />
          <Route path="/stacks" element={<StackLeaderboardTab />} />
          <Route path="/runs/:runId" element={<RunDetailPage />} />
          <Route path="/compare" element={<ComparePage />} />
        </Routes>
      </main>
    </div>
  )
}
