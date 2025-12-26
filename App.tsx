import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Api } from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CollectionManager from './pages/CollectionManager';
import SuperAdmin from './pages/SuperAdmin';
import GuestPortal from './pages/GuestPortal';
import ClientSelection from './pages/ClientSelection';

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

const MainRouter = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isGuest, setIsGuest] = useState(false);
  const [isClientSelect, setIsClientSelect] = useState(false);
  const [isProcessingToken, setIsProcessingToken] = useState(true);

  useEffect(() => {
    // 1. Check for Cognito Token
    const hash = window.location.hash;
    if (hash && hash.includes('id_token')) {
       // ... (existing token logic)
       try {
          const params = new URLSearchParams(hash.substring(hash.indexOf('#') + 1));
          const idToken = params.get('id_token') || hash.split('id_token=')[1]?.split('&')[0];
          
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

    // 2. Check for Guest or Client Link
    // Client Link format: /#/client-select?linkId=...
    if (location.pathname.includes('client-select')) {
        setIsClientSelect(true);
    } else {
        const params = new URLSearchParams(location.search);
        if (params.get('linkId') && !location.pathname.includes('login')) {
            setIsGuest(true);
        }
    }
    
    setIsProcessingToken(false);
  }, [location, navigate]);

  if (isProcessingToken) {
     return <div className="h-screen bg-black text-brand flex items-center justify-center">Verifying Access...</div>;
  }

  if (isClientSelect) return <ClientSelection />;
  if (isGuest) return <GuestPortal />;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/client-select" element={<ClientSelection />} />
      
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
      <Route path="*" element={<Navigate to="/login" replace />} />
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