import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Api } from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CollectionManager from './pages/CollectionManager';
import SuperAdmin from './pages/SuperAdmin';
import GuestPortal from './pages/GuestPortal';

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
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    // Check if accessing via Guest Link (query param linkId)
    const params = new URLSearchParams(location.search);
    if (params.get('linkId')) {
      setIsGuest(true);
    }
  }, [location]);

  if (isGuest) {
    return <GuestPortal />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
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