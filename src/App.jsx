import React, { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { SupabaseAuthProvider } from '@/lib/SupabaseAuthContext';
import AdminRoute from '@/components/admin/AdminRoute';
import ScrollToTop from './components/ScrollToTop';
import RouteMetadata from './lib/RouteMetadata';

// Routes load on demand, keeping the initial public visit lightweight.
const Home = lazy(() => import('./pages/Home'));
const ThankYou = lazy(() => import('./pages/ThankYou'));
const TrainerInterest = lazy(() => import('./pages/TrainerInterest'));
const PartnerInterest = lazy(() => import('./pages/PartnerInterest'));
const SoftLaunchTimetable = lazy(() => import('./pages/SoftLaunchTimetable'));
const AdminCommandCentre = lazy(() => import('./pages/AdminCommandCentre'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const TrainingGuide = lazy(() => import('./pages/TrainingGuide'));
const Coaches = lazy(() => import('./pages/Coaches'));
const Events = lazy(() => import('./pages/Events'));
const Booking = lazy(() => import('./pages/Booking'));
const Account = lazy(() => import('./pages/Account'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const AppLanding = lazy(() => import('./pages/AppLanding'));
const CheckoutReturn = lazy(() => import('./pages/CheckoutReturn'));
const NativeTaskBridge = lazy(() => import('./pages/NativeTaskBridge'));

function RouteLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-xert-navy" role="status" aria-label="Loading page">
      <span className="w-7 h-7 border-2 border-xert-steel/30 border-t-xert-steel rounded-full animate-spin" />
    </div>
  );
}

const AppRoutes = () => (
    <Suspense fallback={<RouteLoader />}>
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
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/app" element={<AppLanding />} />
      <Route path="/checkout-return" element={<CheckoutReturn />} />
      <Route path="/open/*" element={<NativeTaskBridge />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/training-guide" element={<TrainingGuide />} />
      {/* ADMIN — requires a signed-in user whose profiles.role = 'admin'.
          Promote an admin with the SQL noted in src/supabase/booking_schema.sql. */}
      <Route path="/admin" element={<AdminRoute><AdminCommandCentre /></AdminRoute>} />
      <Route path="/admin/*" element={<AdminRoute><AdminCommandCentre /></AdminRoute>} />
      <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
);

function App() {
  return (
    <SupabaseAuthProvider>
      <Router>
        <ScrollToTop />
        <RouteMetadata />
        <AppRoutes />
      </Router>
      <Toaster />
    </SupabaseAuthProvider>
  );
}

export default App;
