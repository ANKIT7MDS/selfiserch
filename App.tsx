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
const RequireAuth = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
  const token = localStorage.getItem('idToken');
  const userStr = localStorage.getItem('user');
  
  if (!token || !userStr) {
    return <Navigate to="/login" replace />;
  }

  const user = JSON.parse(userStr);
  const userGroups = user.groups || [];

  // Special Handling: If user is MasterAdmin but trying to access a restricted non-admin route (like dashboard),
  // redirect them to /admin to avoid infinite loops or access errors.
  if (userGroups.includes('MasterAdmins')) {
      if (allowedRoles && !allowedRoles.includes('MasterAdmins')) {
          return <Navigate to="/admin" replace />;
      }
  }

  if (allowedRoles) {
    const hasRole = allowedRoles.some(role => userGroups.includes(role));
    
    // Implicit Photographer Role: Everyone who is logged in (and not explicitly restricted) is a Photographer
    if (allowedRoles.includes('Photographer')) {
       // If they are logged in, allow access (unless they are MasterAdmins handled above)
       return <>{children}</>;
    }

    if (!hasRole) {
      // If validation fails, redirect based on their actual role to avoid loops
      if (userGroups.includes('MasterAdmins')) return <Navigate to="/admin" replace />;
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};

// Component to handle the root path ("/") logic
const RootHandler = () => {
  const location = useLocation();

  // ROBUST LINK DETECTION:
  const getLinkId = () => {
    const params = new URLSearchParams(location.search);
    if (params.get('linkId')) return params.get('linkId');

    if (window.location.href.includes('linkId=')) {
        const match = window.location.href.match(/linkId=([^&]+)/);
        if (match && match[1]) return match[1];
    }
    return null;
  };

  const linkId = getLinkId();

  if (linkId) {
    return <GuestPortal />;
  }

  const token = localStorage.getItem('idToken');
  if (token) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.groups && user.groups.includes('MasterAdmins')) {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/login" replace />;
};

const MainRouter = () => {
  const navigate = useNavigate();
  const [isProcessingToken, setIsProcessingToken] = useState(true);

  useEffect(() => {
    // Only handle Cognito Token parsing here
    const hash = window.location.hash;
    if (window.location.href.includes('id_token=')) {
       try {
          const fullHash = window.location.href.split('#')[1] || ''; 
          const params = new URLSearchParams(fullHash.replace('/', '')); 
          
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
    
    // Small delay to allow hash to be processed if present
    setTimeout(() => setIsProcessingToken(false), 500);
  }, [navigate]);

  if (isProcessingToken) {
     return <div className="h-screen bg-black text-brand flex items-center justify-center font-bold">Verifying Access...</div>;
  }

  return (
    <Routes>
      <Route path="/" element={<RootHandler />} />
      <Route path="/login" element={<Login />} />
      <Route path="/client-select" element={<ClientSelection />} />
      <Route path="/quick-upload/:collectionId" element={<QuickUpload />} />
      <Route path="/guest" element={<GuestPortal />} />
      
      <Route path="/admin" element={
        <RequireAuth allowedRoles={['MasterAdmins']}>
          <SuperAdmin />
        </RequireAuth>
      } />

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