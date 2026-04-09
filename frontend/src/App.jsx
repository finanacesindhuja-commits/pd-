import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import StaffLogin from './page/StaffLogin';
import Dashboard from './page/Dashboard';
import Layout from './components/Layout';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<StaffLogin />} />
        
        <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
        
        {/* Catch-all route to prevent 'No routes matched location' errors */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
