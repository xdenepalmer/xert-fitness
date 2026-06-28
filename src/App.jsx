import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';

// Page imports
import Home from './pages/Home';
import ThankYou from './pages/ThankYou';
import TrainerInterest from './pages/TrainerInterest';
import PartnerInterest from './pages/PartnerInterest';
import SoftLaunchTimetable from './pages/SoftLaunchTimetable';
import AdminCommandCentre from './pages/AdminCommandCentre';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-xert-black">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-xert-steel/30 border-t-xert-red rounded-full animate-spin" />
          <span className="font-display text-xs text-xert-concrete/30 uppercase tracking-widest">XERT</span>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/thank-you" element={<ThankYou />} />
      <Route path="/trainer-interest" element={<TrainerInterest />} />
      <Route path="/partner-interest" element={<PartnerInterest />} />
      <Route path="/timetable" element={<SoftLaunchTimetable />} />
      {/* ADMIN — currently accessible to any authenticated user.
          IMPORTANT: Implement Supabase RLS + role check before real use.
          See setup notes in the project documentation. */}
      <Route path="/admin" element={<AdminCommandCentre />} />
      <Route path="/admin/*" element={<AdminCommandCentre />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;