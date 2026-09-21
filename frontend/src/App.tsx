import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'

function Placeholder({ name }: { name: string }) {
  return <p className="text-fg-muted">{name}</p>
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Placeholder name="Dashboard" />} />
        <Route path="/new" element={<Placeholder name="Upload" />} />
        <Route path="/analyses/:id" element={<Placeholder name="Report" />} />
      </Routes>
    </AppShell>
  )
}
