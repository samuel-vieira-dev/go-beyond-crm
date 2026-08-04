import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { ProtectedRoute, homeForRole } from '@/routes/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { LoginPage } from '@/pages/LoginPage'

const SdrPage = lazy(() => import('@/pages/sdr/SdrPage').then((m) => ({ default: m.SdrPage })))
const SdrReportPage = lazy(() => import('@/pages/sdr/SdrReportPage').then((m) => ({ default: m.SdrReportPage })))

const SocialSellerPage = lazy(() =>
  import('@/pages/social/SocialSellerPage').then((m) => ({ default: m.SocialSellerPage })),
)
const SocialSellerReportPage = lazy(() =>
  import('@/pages/social/SocialSellerReportPage').then((m) => ({ default: m.SocialSellerReportPage })),
)

const CloserAgendaPage = lazy(() =>
  import('@/pages/closer/CloserAgendaPage').then((m) => ({ default: m.CloserAgendaPage })),
)
const CloserLeadsPage = lazy(() =>
  import('@/pages/closer/CloserLeadsPage').then((m) => ({ default: m.CloserLeadsPage })),
)
const CloserReportPage = lazy(() =>
  import('@/pages/closer/CloserReportPage').then((m) => ({ default: m.CloserReportPage })),
)

const AdminDashboardPage = lazy(() =>
  import('@/pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
)
const AdminKanbanPage = lazy(() =>
  import('@/pages/admin/AdminKanbanPage').then((m) => ({ default: m.AdminKanbanPage })),
)
const AdminConversionsPage = lazy(() =>
  import('@/pages/admin/AdminConversionsPage').then((m) => ({ default: m.AdminConversionsPage })),
)
const AdminPresalesRankingPage = lazy(() =>
  import('@/pages/admin/AdminPresalesRankingPage').then((m) => ({ default: m.AdminPresalesRankingPage })),
)
const AdminCloserRankingPage = lazy(() =>
  import('@/pages/admin/AdminCloserRankingPage').then((m) => ({ default: m.AdminCloserRankingPage })),
)
const AdminTeamPage = lazy(() => import('@/pages/admin/AdminTeamPage').then((m) => ({ default: m.AdminTeamPage })))
const AdminProductsPage = lazy(() =>
  import('@/pages/admin/AdminProductsPage').then((m) => ({ default: m.AdminProductsPage })),
)
const AdminGoalsPage = lazy(() => import('@/pages/admin/AdminGoalsPage').then((m) => ({ default: m.AdminGoalsPage })))
const AdminQuizDashboardPage = lazy(() =>
  import('@/pages/admin/AdminQuizDashboardPage').then((m) => ({ default: m.AdminQuizDashboardPage })),
)

const QuizUpsellLeadsPage = lazy(() =>
  import('@/pages/QuizUpsellLeadsPage').then((m) => ({ default: m.QuizUpsellLeadsPage })),
)

const AlertsPage = lazy(() => import('@/pages/AlertsPage').then((m) => ({ default: m.AlertsPage })))
const MyGoalsPage = lazy(() => import('@/pages/MyGoalsPage').then((m) => ({ default: m.MyGoalsPage })))

function RootRedirect() {
  const { session, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session || !profile) return <Navigate to="/login" replace />
  return <Navigate to={homeForRole(profile.role)} replace />
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute allow={['sdr']} />}>
          <Route element={<AppShell />}>
            <Route path="/sdr" element={<SdrPage />} />
            <Route path="/sdr/upsell-af" element={<QuizUpsellLeadsPage />} />
            <Route path="/sdr/alertas" element={<AlertsPage />} />
            <Route path="/sdr/metas" element={<MyGoalsPage />} />
            <Route path="/sdr/relatorio" element={<SdrReportPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allow={['social_seller']} />}>
          <Route element={<AppShell />}>
            <Route path="/social" element={<SocialSellerPage />} />
            <Route path="/social/alertas" element={<AlertsPage />} />
            <Route path="/social/metas" element={<MyGoalsPage />} />
            <Route path="/social/relatorio" element={<SocialSellerReportPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allow={['closer']} />}>
          <Route element={<AppShell />}>
            <Route path="/closer" element={<CloserAgendaPage />} />
            <Route path="/closer/leads" element={<CloserLeadsPage />} />
            <Route path="/closer/alertas" element={<AlertsPage />} />
            <Route path="/closer/metas" element={<MyGoalsPage />} />
            <Route path="/closer/relatorio" element={<CloserReportPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allow={['admin']} />}>
          <Route element={<AppShell />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/kanban" element={<AdminKanbanPage />} />
            <Route path="/admin/conversoes" element={<AdminConversionsPage />} />
            <Route path="/admin/ranking-prevendas" element={<AdminPresalesRankingPage />} />
            <Route path="/admin/ranking-closers" element={<AdminCloserRankingPage />} />
            <Route path="/admin/equipe" element={<AdminTeamPage />} />
            <Route path="/admin/produtos" element={<AdminProductsPage />} />
            <Route path="/admin/metas" element={<AdminGoalsPage />} />
            <Route path="/admin/leads" element={<Navigate to="/admin/leads/quiz-upsell-af" replace />} />
            <Route path="/admin/leads/quiz-upsell-af" element={<QuizUpsellLeadsPage />} />
            <Route path="/admin/quiz" element={<Navigate to="/admin/quiz/link-bio" replace />} />
            <Route path="/admin/quiz/link-bio" element={<AdminQuizDashboardPage quiz="link-bio" />} />
            <Route path="/admin/quiz/pos-venda" element={<AdminQuizDashboardPage quiz="pos-venda" />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
