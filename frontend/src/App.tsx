import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ReportPage } from './pages/ReportPage'
import { UploadPage } from './pages/UploadPage'

function Placeholder({ name }: { name: string }) {
  return <p className="text-fg-muted">{name}</p>
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Placeholder name="Dashboard" />} />
        <Route path="/new" element={<UploadPage />} />
        <Route path="/analyses/:id" element={<ReportPage />} />
      </Routes>
    </AppShell>
  )
}
