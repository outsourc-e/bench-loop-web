import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import LoopLogo from './components/LoopLogo'
import AuthButton from './components/AuthButton'
import DocsPage from './pages/DocsPage'
import ConnectPage from './pages/ConnectPage'
import DownloadPage from './pages/DownloadPage'
import ExplorePage from './pages/ExplorePage'
import LandingPage from './pages/LandingPage'
import LeaderboardPage from './pages/LeaderboardPage'
import ModelDetailPage from './pages/ModelDetailPage'
import ProfilePage from './pages/ProfilePage'
import PostPage from './pages/PostPage'
import RecipePage from './pages/RecipePage'

const navItems = [
  { to: '/explore', label: 'Explore' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/recipes', label: 'Recipes' },
  { to: '/docs', label: 'Docs' },
]

type Theme = 'dark' | 'light'

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = window.localStorage.getItem('benchloop-theme')
    return saved === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('benchloop-theme', theme)
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (themeMeta) themeMeta.content = theme === 'dark' ? '#06090a' : '#f4f8f5'
  }, [theme])

  return (
    <div className="app">
      <header className="header revamp-header">
        <div className="header-inner">
          <Link to="/" className="logo" aria-label="BenchLoop home">
            <LoopLogo size={30} />
            <span className="logo-text">BenchLoop</span>
            <span className="revamp-alpha">alpha</span>
          </Link>

          <nav className="nav revamp-nav" aria-label="Primary navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              <span className="theme-toggle-track" aria-hidden="true"><i>{theme === 'dark' ? '☾' : '☀'}</i></span>
              <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </button>
            <Link to="/download" className="btn btn-ghost">Connect runner</Link>
            <AuthButton />
          </div>
        </div>
      </header>

      <main className="main revamp-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/ask" element={<ExplorePage mode="ask" />} />
          <Route path="/explore" element={<ExplorePage mode="feed" />} />
          <Route path="/news" element={<ExplorePage mode="news" />} />
          <Route path="/runs" element={<ExplorePage mode="runs" />} />
          <Route path="/recipes" element={<ExplorePage mode="recipes" />} />
          <Route path="/builders" element={<ExplorePage mode="builders" />} />
          <Route path="/recipes/:recipeId" element={<RecipePage />} />
          <Route path="/posts/:postId" element={<PostPage />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/u/:handle" element={<ProfilePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/models/:modelName" element={<ModelDetailPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div>
            <LoopLogo size={22} />
            <strong>BenchLoop</strong>
            <span>The local AI intelligence network.</span>
          </div>
          <div className="site-footer-links">
            <Link to="/leaderboard">Leaderboard</Link>
            <Link to="/docs">Docs</Link>
            <Link to="/download">CLI</Link>
            <a href="https://github.com/outsourc-e/bench-loop" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function NotFound() {
  return (
    <section className="revamp-empty card-premium">
      <div className="page-kicker">404</div>
      <h1>This loop is still compiling.</h1>
      <p>That page does not exist yet. Head back to the discovery feed.</p>
      <Link to="/" className="btn btn-primary">Go home</Link>
    </section>
  )
}
