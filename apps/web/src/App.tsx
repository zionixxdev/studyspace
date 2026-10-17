import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { Spinner } from '@/components/ui/Feedback';
import { isConfigured } from '@/lib/env';

import { Login } from '@/features/auth/Login';
import { Signup } from '@/features/auth/Signup';
import { ForgotPassword } from '@/features/auth/ForgotPassword';
import { ResetPassword } from '@/features/auth/ResetPassword';
import { VerifyEmail } from '@/features/auth/VerifyEmail';
import { SetupNotice } from '@/features/auth/SetupNotice';
import { NotFound } from '@/features/misc/NotFound';

// Heavier routes are code-split so the initial bundle stays small on mobile.
const Dashboard = lazy(() => import('@/features/dashboard/Dashboard'));
const Messages = lazy(() => import('@/features/messaging/Messages'));
const People = lazy(() => import('@/features/social/People'));
const Communities = lazy(() => import('@/features/communities/Communities'));
const CommunityDetail = lazy(() => import('@/features/communities/CommunityDetail'));
const Rooms = lazy(() => import('@/features/study-rooms/Rooms'));
const RoomView = lazy(() => import('@/features/study-rooms/RoomView'));
const Files = lazy(() => import('@/features/files/Files'));
const Tasks = lazy(() => import('@/features/tasks/Tasks'));
const Focus = lazy(() => import('@/features/focus/Focus'));
const Notifications = lazy(() => import('@/features/notifications/Notifications'));
const SearchPage = lazy(() => import('@/features/search/SearchPage'));
const Settings = lazy(() => import('@/features/profile/Settings'));
const Profile = lazy(() => import('@/features/profile/Profile'));

function Fallback() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function App() {
  // Without Supabase config the app shows an honest setup screen rather than
  // faking a login.
  if (!isConfigured) {
    return (
      <Routes>
        <Route path="*" element={<SetupNotice />} />
      </Routes>
    );
  }

  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="messages" element={<Messages />} />
            <Route path="messages/:conversationId" element={<Messages />} />
            <Route path="people" element={<People />} />
            <Route path="u/:username" element={<Profile />} />
            <Route path="communities" element={<Communities />} />
            <Route path="communities/:groupId" element={<CommunityDetail />} />
            <Route path="rooms" element={<Rooms />} />
            <Route path="rooms/:roomId" element={<RoomView />} />
            <Route path="files" element={<Files />} />
            <Route path="files/:fileId" element={<Files />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="focus" element={<Focus />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
