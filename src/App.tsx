import { Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { GuestRoute } from '@/components/auth/GuestRoute'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { HomePage } from '@/pages/HomePage'
import { IngredientsPage } from '@/pages/IngredientsPage'
import { LoginPage } from '@/pages/LoginPage'
import { RecipeDetailPage } from '@/pages/RecipeDetailPage'
import { RecipeFormPage } from '@/pages/RecipeFormPage'
import { RecipesPage } from '@/pages/RecipesPage'
import { SignupPage } from '@/pages/SignupPage'
import { StaffPage } from '@/pages/StaffPage'

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="recipes" element={<RecipesPage />} />
        <Route path="recipes/new" element={<RecipeFormPage />} />
        <Route path="recipes/:recipeId/edit" element={<RecipeFormPage />} />
        <Route path="recipes/:recipeId" element={<RecipeDetailPage />} />
        <Route path="ingredients" element={<IngredientsPage />} />
        <Route path="staff" element={<StaffPage />} />
      </Route>
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
