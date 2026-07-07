import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { LanguageProvider } from './i18n/provider'
import './styles/global.css'

// Injected by vite define — also emitted as /version.json for deploy checks.
window.__BOARD_BUILD__ = __BUILD_INFO__
console.info(`[board] build ${__BUILD_INFO__.sha} (${__BUILD_INFO__.builtAt})`)

ReactDOM.createRoot(document.getElementById('root')).render(
  <LanguageProvider>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </LanguageProvider>
)
