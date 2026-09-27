import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { MainLayout } from '@/layouts/MainLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { ProtectedRoute, GuestOnlyRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/pages/Login'
import { SignupPage } from '@/pages/Signup'
import { HomePage } from '@/pages/Home'
import { ExplorePage } from '@/pages/Explore'
import { ReelsPage } from '@/pages/Reels'
import { ProfilePage } from '@/pages/Profile'
import { EditProfilePage } from '@/pages/EditProfile'
import { MessagesPage } from '@/pages/Messages'
import { NotificationsPage } from '@/pages/Notifications'
import { SettingsPage } from '@/pages/Settings'
import { PostPage } from '@/pages/PostPage'

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route element={<GuestOnlyRoute><AuthLayout /></GuestOnlyRoute>}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
              </Route>

              <Route
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<HomePage />} />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/explore/tags/:tag" element={<ExplorePage />} />
                <Route path="/reels" element={<ReelsPage />} />
                <Route path="/messages" element={<MessagesPage />} />
                <Route path="/messages/:conversationId" element={<MessagesPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/accounts/edit" element={<EditProfilePage />} />
                <Route path="/p/:postId" element={<PostPage />} />
                <Route path="/:username" element={<ProfilePage />} />
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  )
}
