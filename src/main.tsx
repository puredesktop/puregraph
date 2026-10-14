import { createRoot } from 'react-dom/client'
import { App } from './App'
import { WhiteNeutral } from './whiteNeutral'
import { EnterpriseLook } from './enterpriseLook'

createRoot(document.getElementById('root') as HTMLElement).render(
  <>
    <WhiteNeutral />
    <EnterpriseLook />
    <App />
  </>,
)
