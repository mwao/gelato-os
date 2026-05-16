import { Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import {
  OwnerOnlyRoute,
  StoreOnlyRoute,
} from '@/components/auth/AccountRoute'
import { GuestRoute } from '@/components/auth/GuestRoute'
import {
  OnboardingGate,
  OwnerOnboardingGuard,
} from '@/components/auth/OnboardingGuard'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { HomePage } from '@/pages/HomePage'
import { IngredientsPage } from '@/pages/IngredientsPage'
import { LoginPage } from '@/pages/LoginPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { RecipeDetailPage } from '@/pages/RecipeDetailPage'
import { RecipeFormPage } from '@/pages/RecipeFormPage'
import { RecipesPage } from '@/pages/RecipesPage'
import { SignupPage } from '@/pages/SignupPage'
import {
  StaffPage,
  StaffProfilePage,
  StaffSchedulePage,
  StaffAttendancePage,
  StaffChecklistPage,
} from '@/pages/StaffPage'
import { PayrollPage } from '@/pages/PayrollPage'
import { MyPage } from '@/pages/MyPage'
import { TasksPage, TaskSettingsPage, TaskStatusPage } from '@/pages/TasksPage'
import { StoreLayout } from '@/components/store/StoreLayout'
import { StoreAttendancePage } from '@/pages/store/StoreAttendancePage'
import { StoreHomePage } from '@/pages/store/StoreHomePage'
import { StoreSchedulePage } from '@/pages/store/StoreSchedulePage'
import { StoreTasksPage } from '@/pages/store/StoreTasksPage'

export default function App() {
  return (
    <Routes>
      {/* 사장님 — 첫 매장 등록 안내 */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OwnerOnlyRoute>
              <OnboardingGate>
                <OnboardingPage />
              </OnboardingGate>
            </OwnerOnlyRoute>
          </ProtectedRoute>
        }
      />

      {/* 사장님 메인 라우트 — AppLayout 안에서 운영 */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <OwnerOnlyRoute>
              <OwnerOnboardingGuard>
                <AppLayout />
              </OwnerOnboardingGuard>
            </OwnerOnlyRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="recipes" element={<RecipesPage />} />
        <Route path="recipes/new" element={<RecipeFormPage />} />
        <Route path="recipes/:recipeId/edit" element={<RecipeFormPage />} />
        <Route path="recipes/:recipeId" element={<RecipeDetailPage />} />
        <Route path="ingredients" element={<IngredientsPage />} />
        <Route path="staff" element={<StaffPage />}>
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<StaffProfilePage />} />
          <Route path="schedule" element={<StaffSchedulePage />} />
          <Route path="attendance" element={<StaffAttendancePage />} />
          <Route path="checklist" element={<StaffChecklistPage />} />
        </Route>
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="tasks" element={<TasksPage />}>
          <Route index element={<Navigate to="settings" replace />} />
          <Route path="settings" element={<TaskSettingsPage />} />
          <Route path="status" element={<TaskStatusPage />} />
        </Route>
        <Route path="my" element={<MyPage />} />
      </Route>

      {/* 매장 모드 — StoreLayout 안에서 4개 화면 */}
      <Route
        path="/store"
        element={
          <ProtectedRoute>
            <StoreOnlyRoute>
              <StoreLayout />
            </StoreOnlyRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<StoreHomePage />} />
        <Route path="tasks" element={<StoreTasksPage />} />
        <Route path="attendance" element={<StoreAttendancePage />} />
        <Route path="schedule" element={<StoreSchedulePage />} />
      </Route>

      {/* 공개 */}
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <GuestRoute>
            <SignupPage />
          </GuestRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
