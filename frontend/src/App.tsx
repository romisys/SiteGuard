import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { ReportPage } from './pages/ReportPage'
import { UploadPage } from './pages/UploadPage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/new" element={<UploadPage />} />
        <Route path="/analyses/:id" element={<ReportPage />} />
      </Routes>
    </AppShell>
  )
}
