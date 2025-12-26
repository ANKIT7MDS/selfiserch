import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const COGNITO_DOMAIN = "https://ap-south-1mva8s6f3w.auth.ap-south-1.amazoncognito.com";
const CLIENT_ID = "6j3gec3kk0q0ktkals8cr8s367";
// FIX: Hardcoding the production domain to ensure match with AWS Cognito settings
// regardless of whether the app is run from localhost, Codespaces, or Prod.
const SITE_URL = "https://selfiphotos.netlify.app";

const Login = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('id_token')) {
      processToken(hash);
    }
  }, [navigate]);

  const processToken = (hash: string) => {
    const params = new URLSearchParams(hash.replace('#', '?'));
    const idToken = params.get('id_token');
    
    if (idToken) {
      try {
        const payload = JSON.parse(atob(idToken.split('.')[1]));
        const user = {
          email: payload.email,
          sub: payload.sub,
          groups: payload['cognito:groups'] || []
        };
        
        localStorage.setItem('idToken', idToken);
        localStorage.setItem('user', JSON.stringify(user));

        if (user.groups.includes('MasterAdmins')) {
          navigate('/admin');
        } else {
          navigate('/dashboard');
        }
      } catch (e) {
        console.error("Invalid token", e);
        alert("Login failed: Invalid token structure.");
      }
    }
  };

  const handleLogin = () => {
    // IMPORTANT: AWS Cognito Callback URL must be exactly this: https://selfiphotos.netlify.app
    // No trailing slash, no /login.
    const redirectUri = SITE_URL;
    
    const cognitoUrl = `${COGNITO_DOMAIN}/login?response_type=token&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    window.location.href = cognitoUrl; 
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900 via-black to-black text-white">
      <div className="bg-dark-card border border-dark-border p-10 rounded-3xl shadow-2xl text-center max-w-md w-full">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">
          EventLens Pro
        </h1>
        <p className="text-gray-400 mb-8 text-sm">Secure Photographer & Admin Access</p>
        
        <button 
          onClick={handleLogin}
          className="w-full bg-brand text-black font-bold py-3 px-6 rounded-full hover:bg-brand-hover transition-transform transform hover:-translate-y-1 shadow-[0_4px_15px_rgba(0,230,118,0.3)]"
        >
          Login via AWS Cognito
        </button>
        
        <div className="mt-6 text-xs text-gray-600">
          Secure identity provided by Amazon Web Services
          <br/>
          <span className="text-gray-700">Redirects to: {SITE_URL}</span>
        </div>
      </div>
    </div>
  );
};

export default Login;