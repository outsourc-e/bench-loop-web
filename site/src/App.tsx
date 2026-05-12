import { Routes, Route, NavLink, useNavigate, Link } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import DocsPage from './pages/DocsPage'
import LeaderboardPage from './pages/LeaderboardPage'
import DownloadPage from './pages/DownloadPage'
import LoopLogo from './components/LoopLogo'
import './App.css'

export default function App() {
  const navigate = useNavigate()

  const navItems = [
    { to: '/', label: 'Home' },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: '/docs', label: 'Docs' },
    { to: '/download', label: 'Download' },
  ]

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <LoopLogo size={32} />
            <span className="logo-text">BenchLoop</span>
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
          <div className="header-actions">
            <a
              href="https://github.com/ocplatform/bench-loop"
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
            >
              GitHub ↗
            </a>
            <Link to="/download" className="btn btn-primary">
              Install
            </Link>
          </div>
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/download" element={<DownloadPage />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div>
            <LoopLogo size={22} />
            <strong>BenchLoop</strong>
            <span>© 2026 OpenClaw Labs</span>
          </div>
          <div className="site-footer-links">
            <a href="https://github.com/ocplatform/bench-loop" target="_blank" rel="noreferrer">GitHub</a>
            <Link to="/docs">Docs</Link>
            <Link to="/leaderboard">Leaderboard</Link>
            <a href="mailto:hi@benchloop.com">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
