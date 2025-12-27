import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CollectionManager from './pages/CollectionManager';
import SuperAdmin from './pages/SuperAdmin';
import GuestPortal from './pages/GuestPortal';
import ClientSelection from './pages/ClientSelection';
import QuickUpload from './pages/QuickUpload';

// Auth Wrapper
const RequireAuth = ({ children, allowedRoles }: { children: React.ReactElement, allowedRoles?: string[] }) => {
  const token = localStorage.getItem('idToken');
  const userStr = localStorage.getItem('user');
  
  if (!token || !userStr) {
    return <Navigate to="/login" replace />;
  }

  const user = JSON.parse(userStr);
  const userGroups = user.groups || [];

  if (allowedRoles) {
    const hasRole = allowedRoles.some(role => userGroups.includes(role));
    // If checking for 'Photographer' (default), assume everyone NOT MasterAdmin is one
    if (allowedRoles.includes('Photographer') && !userGroups.includes('MasterAdmins')) {
       return children;
    }
    if (!hasRole) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children;
};

// Component to handle the root path ("/") logic
const RootHandler = () => {
  const location = useLocation();

  // ROBUST LINK DETECTION:
  // Check React Router location, Window Hash, and Window Search to find linkId anywhere.
  // This prevents logged-in photographers from being redirected to dashboard when clicking a guest link.
  const getLinkId = () => {
    // 1. Check React Router parsed search
    const params = new URLSearchParams(location.search);
    if (params.get('linkId')) return params.get('linkId');

    // 2. Check raw window location href (covers edge cases with HashRouter placement)
    if (window.location.href.includes('linkId=')) {
        const match = window.location.href.match(/linkId=([^&]+)/);
        if (match && match[1]) return match[1];
    }
    return null;
  };

  const linkId = getLinkId();

  // 1. If linkId is present ANYWHERE, it's a Guest - Show Guest Portal immediately
  if (linkId) {
    return <GuestPortal />;
  }

  // 2. If valid session exists, go to Dashboard
  const token = localStorage.getItem('idToken');
  if (token) {
    // Check if admin
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.groups && user.groups.includes('MasterAdmins')) {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  // 3. Otherwise, go to Login
  return <Navigate to="/login" replace />;
};

const MainRouter = () => {
  const navigate = useNavigate();
  const [isProcessingToken, setIsProcessingToken] = useState(true);

  useEffect(() => {
    // Only handle Cognito Token parsing here
    const hash = window.location.hash;
    // Note: In HashRouter, the actual hash fragment might be after the route hash. 
    // We check the full URL for id_token usually passed by Cognito as a callback.
    if (window.location.href.includes('id_token=')) {
       try {
          const fullHash = window.location.href.split('#')[1] || ''; // Get part after first #
          // Cognito might put parameters like #id_token=... directly or /#id_token=...
          const params = new URLSearchParams(fullHash.replace('/', '')); // Strip leading slash if present
          
          // Fallback regex search if URLSearchParams fails on complex hash
          const idTokenMatch = window.location.href.match(/id_token=([^&]+)/);
          const idToken = params.get('id_token') || (idTokenMatch ? idTokenMatch[1] : null);
          
          if (idToken) {
            const payload = JSON.parse(atob(idToken.split('.')[1]));
            const user = {
              email: payload.email,
              sub: payload.sub,
              groups: payload['cognito:groups'] || []
            };
            
            localStorage.setItem('idToken', idToken);
            localStorage.setItem('user', JSON.stringify(user));

            if (user.groups.includes('MasterAdmins')) {
              navigate('/admin', { replace: true });
            } else {
              navigate('/dashboard', { replace: true });
            }
            setIsProcessingToken(false);
            return;
          }
       } catch (e) {
         console.error("Token parse error", e);
       }
    }
    
    setIsProcessingToken(false);
  }, [navigate]);

  if (isProcessingToken) {
     return <div className="h-screen bg-black text-brand flex items-center justify-center font-bold">Verifying Access...</div>;
  }

  return (
    <Routes>
      {/* Root Path Handler (Guest vs Auth vs Login) */}
      <Route path="/" element={<RootHandler />} />

      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/client-select" element={<ClientSelection />} />
      <Route path="/quick-upload/:collectionId" element={<QuickUpload />} />
      <Route path="/guest" element={<GuestPortal />} /> {/* Fallback explicit guest route */}
      
      {/* Super Admin Routes */}
      <Route path="/admin" element={
        <RequireAuth allowedRoles={['MasterAdmins']}>
          <SuperAdmin />
        </RequireAuth>
      } />

      {/* Photographer Routes */}
      <Route path="/dashboard" element={
        <RequireAuth allowedRoles={['Photographer']}>
          <Dashboard />
        </RequireAuth>
      } />
      
      <Route path="/collection/:id" element={
        <RequireAuth allowedRoles={['Photographer']}>
          <CollectionManager />
        </RequireAuth>
      } />

      {/* Default Redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App = () => {
  return (
    <HashRouter>
      <MainRouter />
    </HashRouter>
  );
};

export default App;