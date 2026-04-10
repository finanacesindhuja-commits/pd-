const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

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

app.post('/api/login', (req, res) => {
  const { staffId, password, role } = req.body;
  console.log('Login request:', { staffId, password, role });
  
  if (!staffId || !password) return res.status(400).json({ message: 'Missing fields' });

  // For testing, let anything through
  return res.status(200).json({ 
    message: 'Login successful', 
    role: role || 'Relationship Officer', 
    staffId 
  });
});

app.get('/api/centers', async (req, res) => {
  try {
    const { data: loans, error } = await supabase
      .from('loans')
      .select('center_id, center_name')
      .eq('status', 'APPROVED');
      
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
    
    // 1. Fetch members with approved loans
    const { data: loans, error: loansError } = await supabase
      .from('loans')
      .select('member_id, member_name, mobile_no, loan_app_id')
      .eq('center_id', centerId)
      .eq('status', 'APPROVED');

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

    const memberIds = loans.map(l => l.member_id);
    const { data: membersList } = await supabase.from('members').select('id, member_no').in('id', memberIds);
    const memberMap = {};
    if (membersList) membersList.forEach(m => memberMap[m.id] = m.member_no);

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
  const { centerId, memberId, homeImage, sideImage, staffId, zoomLink } = req.body;
  try {
    const { data, error } = await supabase
      .from('pd_verifications')
      .insert([{
        center_id: centerId,
        member_id: memberId,
        staff_id: staffId || 'unknown',
        home_image: homeImage,
        side_image: sideImage,
        zoom_link: zoomLink,
        status: 'Pending PD Update Verification' // Changed from Pending Loan Verification
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Submission successful', submission: data });
  } catch (err) {
    console.error('Submit PD Error:', err);
    res.status(500).json({ error: err.message });
  }
});

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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`PD Update Backend server running on http://localhost:${PORT}`);
});
