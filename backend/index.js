const express = require('express');
const compression = require('compression');
const NodeCache = require('node-cache');
const cors = require('cors');
require('dotenv').config();

const app = express();

const cache = new NodeCache({ stdTTL: 15 });
const flushCache = () => cache.flushAll();
const cacheMiddleware = (duration = 15) => (req, res, next) => {
  if (req.method !== 'GET') return next();
  const key = req.originalUrl;
  const cachedResponse = cache.get(key);
  if (cachedResponse) return res.json(cachedResponse);
  res.sendResponse = res.json;
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cache.set(key, body, duration);
    }
    res.sendResponse(body);
  };
  next();
};

app.use(compression());
const PORT = process.env.PORT || 5000;

console.log('--- PD Update Backend UPDATED VERSION 3.0 STARTED ---');

const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running successfully!' });
});

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

// activeVerifierLink removed (no verifier)

app.post('/api/login', async (req, res) => {
  const { staffId, password, role } = req.body;
  console.log('Login request:', { staffId, password, role });
  
  if (!staffId || !password) return res.status(400).json({ message: 'Missing fields' });

    try {
      const { data: staff, error } = await supabase
        .from('staff')
        .select('*')
        .eq('staff_id', String(staffId || '').trim().toUpperCase())
        .single();

    if (error || !staff) {
      console.error('Login failed: User not found:', staffId);
      return res.status(401).json({ message: `Staff ID "${staffId}" database-la illai.` });
    }

    if (staff.password !== password) {
      console.error('Login failed: Password mismatch for:', staffId);
      return res.status(401).json({ message: 'Password thappu. Check pannunga.' });
    }

    if (staff.role?.toLowerCase() !== 'relationship officer') {
      console.error('Login failed: Unauthorized role:', staff.role);
      return res.status(401).json({ message: `Ungal role "${staff.role}" unauthorized. Relationship Officer-ukku mattume access undu.` });
    }

    return res.status(200).json({ 
      message: 'Login successful', 
      role: staff.role, 
      staffId: staff.staff_id,
      staffName: staff.staff_name || staff.name || staff.full_name || staff.staff_id 
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/centers', cacheMiddleware(10), async (req, res) => {
  try {
    const { staffId } = req.query;
    
    let query = supabase
      .from('loans')
      .select('center_id, center_name')
      .ilike('status', '%Ready for PD%');
    if (staffId) {
      query = query.eq('staff_id', String(staffId).trim());
    }
      
    const { data: loans, error } = await query;
      
    if (error) throw error;
    
    // Extract unique centers
    const uniqueCenters = [];
    const map = new Map();
    for (const loan of loans) {
      if (loan.center_id && loan.center_name && !map.has(loan.center_id)) {
        map.set(loan.center_id, true);
        uniqueCenters.push({ id: loan.center_id, name: loan.center_name });
      }
    }
    res.json(uniqueCenters);
  } catch (err) {
    console.error('Error fetching centers:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/members/:centerId', async (req, res) => {
  try {
    const { centerId } = req.params;
    const { staffId } = req.query;
    
    // 1. Fetch members with approved loans filtering by staffId
    let query = supabase
      .from('loans')
      .select('member_id, member_name, mobile_no, loan_app_id')
      .eq('center_id', centerId)
      .ilike('status', '%Ready for PD%');
    if (staffId) {
      query = query.eq('staff_id', String(staffId).trim());
    }
    
    const { data: loans, error: loansError } = await query;

    if (loansError) throw loansError;

    // 2. Fetch submitted members from pd_verifications
    const { data: pdData, error: pdError } = await supabase
      .from('pd_verifications')
      .select('member_id, status, pd_verified')
      .eq('center_id', centerId);

    if (pdError) throw pdError;

    const pdStatusMap = new Map();
    pdData.forEach(pd => {
      // Force IDs to strings for robust map lookup
      pdStatusMap.set(String(pd.member_id), {
        isSubmitted: true,
        pdVerified: pd.pd_verified === true || pd.status === 'Approved'
      });
    });

    const memberIds = loans.map(l => l.member_id).filter(id => id != null);
    const memberMap = {};
    
    if (memberIds.length > 0) {
      const { data: membersList, error: membersError } = await supabase
        .from('members')
        .select('id, member_no')
        .in('id', memberIds);
        
      if (!membersError && membersList) {
        membersList.forEach(m => memberMap[m.id] = m.member_no);
      }
    }

    // Extract unique members
    const uniqueMembers = [];
    const map = new Map();
    for (const loan of loans) {
      if (loan.member_id && !map.has(loan.member_id)) {
        map.set(loan.member_id, true);
        const pdInfo = pdStatusMap.get(String(loan.member_id)) || { isSubmitted: false, pdVerified: false };
        
        uniqueMembers.push({ 
          id: String(loan.member_id), 
          appId: memberMap[loan.member_id] || loan.loan_app_id || 'N/A',
          name: loan.member_name || 'Unknown', 
          phone: loan.mobile_no || 'N/A',
          isSubmitted: pdInfo.isSubmitted,
          pdVerified: pdInfo.pdVerified
        });
      }
    }
    res.json(uniqueMembers);
  } catch (err) {
    console.error('Error fetching members:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/submit-pd', async (req, res) => {
  const { centerId, memberId, homeImage, sideImage, staffId, location } = req.body;
  try {
    // Ensure we have valid numeric IDs
    const cId = parseInt(centerId);
    const mId = parseInt(memberId);

    if (isNaN(cId) || isNaN(mId)) {
      return res.status(400).json({ error: 'Invalid center or member ID format' });
    }

    const { error } = await supabase
      .from('pd_verifications')
      .insert({
        center_id: cId,
        member_id: mId,
        staff_id: String(staffId || '1'),
        home_image: homeImage,
        side_image: sideImage,
        location: location || 'N/A',
        status: 'Pending PD Verification'
      });

    if (error) {
      console.error('Supabase Error Details:', error);
      return res.status(500).json({ 
        message: 'Database insert failed',
        error: error.message,
        details: error.details
      });
    }

    res.json({ message: 'Submission successful' });
  } catch (err) {
    console.error('Submit PD Error:', err);
    res.status(500).json({ error: err.message });
  }
});

const path = require('path');
const frontendPath = path.resolve(__dirname, '..', 'frontend', 'dist');

// Serve static files from the frontend/dist directory
app.use(express.static(frontendPath));

// GET verifier's host link from Supabase (set by PD Verifier app)
app.get('/api/get-host-link', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pd_verifications')
      .select('zoom_link, created_at')
      .eq('center_id', '__config__')
      .eq('member_id', 'host_link')
      .single();

    if (error || !data || !data.zoom_link) {
      return res.json({ link: '', updatedAt: null });
    }
    res.json({ link: data.zoom_link, updatedAt: data.created_at });
  } catch (err) {
    console.error('Get Host Link Error:', err);
    res.json({ link: '', updatedAt: null });
  }
});

// Catch-all route to serve the frontend index.html for any non-API routes
app.get('*all', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`PD Update Backend server running on http://localhost:${PORT}`);
});
