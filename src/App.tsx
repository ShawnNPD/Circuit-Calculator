import { useState, useEffect } from 'react'
import FeedbackCalculator from './FeedbackCalculator'
import ResistorDividerCalculator from './ResistorDividerCalculator'
import RCCalculator from './RCCalculator'
import SymbolicSolver from './SymbolicSolver'
import ThermistorCalculator from './ThermistorCalculator'
import CalibrationCalculator from './CalibrationCalculator'
import { loadToolConfig, saveToolConfig } from './utils/appConfig'

import './App.css'

const TAB_KEYS = ['feedback', 'divider', 'rc', 'symbolic', 'thermistor', 'calibration'] as const
type TabKey = typeof TAB_KEYS[number]

const APP_CONFIG_KEY = 'app'

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const saved = loadToolConfig<{ activeTab: TabKey }>(APP_CONFIG_KEY)?.activeTab
    return saved && TAB_KEYS.includes(saved) ? saved : 'symbolic'
  })

  useEffect(() => {
    saveToolConfig(APP_CONFIG_KEY, { activeTab })
  }, [activeTab])

  return (
    <div className="app-container">
      <header className="glass-panel header-panel mb-6">
        <h1>Circuit Calculator</h1>
        <p style={{ color: 'var(--text-muted)' }}>Professional tools for circuit design</p>
      </header>

      <div className="main-content">
        <aside className="glass-panel sidebar mb-6">
          <nav className="flex gap-4 sidebar-nav">
            <button
              className={activeTab === 'divider' ? 'active' : 'secondary'}
              onClick={() => setActiveTab('divider')}
            >
              Resistor Divider
            </button>
            <button
              className={activeTab === 'feedback' ? 'active' : 'secondary'}
              onClick={() => setActiveTab('feedback')}
            >
              Feedback Resistor
            </button>
            <button
              className={activeTab === 'rc' ? 'active' : 'secondary'}
              onClick={() => setActiveTab('rc')}
            >
              RC Time Constant
            </button>
            <button
              className={activeTab === 'symbolic' ? 'active' : 'secondary'}
              onClick={() => setActiveTab('symbolic')}
            >
              Symbolic Solver
            </button>
            <button
              className={activeTab === 'thermistor' ? 'active' : 'secondary'}
              onClick={() => setActiveTab('thermistor')}
            >
              Thermistor Calcs
            </button>
            <button
              className={activeTab === 'calibration' ? 'active' : 'secondary'}
              onClick={() => setActiveTab('calibration')}
            >
              Calibration
            </button>
          </nav>
        </aside>

        <main className="calculator-area">
          {activeTab === 'feedback' && <FeedbackCalculator />}
          {activeTab === 'divider' && <ResistorDividerCalculator />}
          {activeTab === 'rc' && <RCCalculator />}
          {activeTab === 'symbolic' && <SymbolicSolver />}
          {activeTab === 'thermistor' && <ThermistorCalculator />}
          {activeTab === 'calibration' && <CalibrationCalculator />}
        </main>
      </div>
    </div>
  )
}

export default App
