import React, { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { SupabaseAuthProvider } from '@/lib/SupabaseAuthContext';
import AdminRoute from '@/components/admin/AdminRoute';
import ScrollToTop from './components/ScrollToTop';

// Page imports
import Home from './pages/Home';
import ThankYou from './pages/ThankYou';
import TrainerInterest from './pages/TrainerInterest';
import PartnerInterest from './pages/PartnerInterest';
import SoftLaunchTimetable from './pages/SoftLaunchTimetable';
// Admin suite is code-split so public visitors never download it.
const AdminCommandCentre = lazy(() => import('./pages/AdminCommandCentre'));
import About from './pages/About';
import Contact from './pages/Contact';
import TrainingGuide from './pages/TrainingGuide';
import Coaches from './pages/Coaches';
import Events from './pages/Events';
import Booking from './pages/Booking';
import Account from './pages/Account';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

const AppRoutes = () => (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/thank-you" element={<ThankYou />} />
      <Route path="/trainer-interest" element={<TrainerInterest />} />
      <Route path="/partner-interest" element={<PartnerInterest />} />
      <Route path="/timetable" element={<SoftLaunchTimetable />} />
      <Route path="/about" element={<About />} />
      <Route path="/coaches" element={<Coaches />} />
      <Route path="/events" element={<Events />} />
      <Route path="/booking" element={<Booking />} />
      <Route path="/account" element={<Account />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/training-guide" element={<TrainingGuide />} />
      {/* ADMIN — requires a signed-in user whose profiles.role = 'admin'.
          Promote an admin with the SQL noted in src/supabase/booking_schema.sql. */}
      <Route path="/admin" element={<AdminRoute><Suspense fallback={null}><AdminCommandCentre /></Suspense></AdminRoute>} />
      <Route path="/admin/*" element={<AdminRoute><Suspense fallback={null}><AdminCommandCentre /></Suspense></AdminRoute>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
);

function App() {
  return (
    <SupabaseAuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AppRoutes />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </SupabaseAuthProvider>
  );
}

export default App;
