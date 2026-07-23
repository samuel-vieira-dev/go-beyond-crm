import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ActivityRemindersProvider } from '@/context/ActivityRemindersContext'

export function AppShell() {
  return (
    <ActivityRemindersProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </ActivityRemindersProvider>
  )
}
