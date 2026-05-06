import { useState, useEffect, useCallback } from 'react';
import { FaCamera, FaCheckCircle, FaSpinner, FaArrowLeft, FaSyncAlt, FaVideo, FaRedo } from 'react-icons/fa';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Dashboard() {
  const [centers, setCenters] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedCenter, setSelectedCenter] = useState(() => localStorage.getItem('pd_center') || '');
  const [selectedMember, setSelectedMember] = useState(() => localStorage.getItem('pd_member') || '');
  const [homeImage, setHomeImage] = useState(null);
  const [sideImage, setSideImage] = useState(null);
  const [location, setLocation] = useState(null); // { lat, lng }
  const [zoomLink, setZoomLink] = useState(() => localStorage.getItem('pd_zoom_link') || '');
  const [hostLinkStatus, setHostLinkStatus] = useState('loading'); // 'loading' | 'live' | 'none'
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [step, setStep] = useState(() => Number(localStorage.getItem('pd_step')) || 1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-fetch verifier host link — always override with latest from Supabase
  const fetchHostLink = () => {
    fetch(`${API}/api/get-host-link`)
      .then(res => res.json())
      .then(data => {
        if (data.link && data.link.trim()) {
          setZoomLink(prev => {
            if (prev !== data.link.trim()) {
              localStorage.setItem('pd_zoom_link', data.link.trim());
              return data.link.trim();
            }
            return prev;
          });
          setHostLinkStatus('live');
        } else {
          setHostLinkStatus('none');
        }
      })
      .catch(() => setHostLinkStatus('none'));
  };

  useEffect(() => {
    fetchHostLink(); // fetch immediately on mount

    // Poll every 5 seconds for real-time sync
    const interval = setInterval(fetchHostLink, 5000);
    return () => clearInterval(interval); // cleanup on unmount
  }, [refreshKey]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setMessage('');
    setRefreshKey(prev => prev + 1);
    setTimeout(() => setIsRefreshing(false), 800);
  }, []);

  // Sync state to localStorage
  useEffect(() => { localStorage.setItem('pd_step', step.toString()); }, [step]);
  useEffect(() => { 
    if (selectedCenter) localStorage.setItem('pd_center', selectedCenter);
    else localStorage.removeItem('pd_center');
  }, [selectedCenter]);
  useEffect(() => { 
    if (selectedMember) localStorage.setItem('pd_member', selectedMember);
    else localStorage.removeItem('pd_member');
  }, [selectedMember]);
  useEffect(() => {
    localStorage.setItem('pd_zoom_link', zoomLink);
  }, [zoomLink]);

  // Fetch Centers
  useEffect(() => {
    const staffId = localStorage.getItem('staffId') || '';
    fetch(`${API}/api/centers?staffId=${staffId}&t=${Date.now()}`, { cache: 'no-store' })
      .then(res => res.json())
      .then(data => setCenters(data))
      .catch(() => {});
  }, [refreshKey]);

  // Fetch Members
  useEffect(() => {
    if (selectedCenter) {
      setMembersLoading(true);
      const staffId = localStorage.getItem('staffId') || '';
      fetch(`${API}/api/members/${selectedCenter}?staffId=${staffId}&t=${Date.now()}`, { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          setMembers(data);
          setMembersLoading(false);
        })
        .catch(() => setMembersLoading(false));
    } else {
      setMembers([]);
    }
  }, [selectedCenter, refreshKey]);

  const compressImage = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        let width = img.width, height = img.height;
        if (scaleSize < 1) { width = MAX_WIDTH; height = img.height * scaleSize; }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e, type) => {
    const file = e.target.files[0];
    if (file) compressImage(file, (base64) => type === 'home' ? setHomeImage(base64) : setSideImage(base64));
  };

  const fetchLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Location capture failed. Please enable location permissions.");
      },
      { enableHighAccuracy: true }
    );
  };

  useEffect(() => {
    // Clear images when moving away from submission step to avoid leaking images to next member
    if (step === 2) {
      setHomeImage(null);
      setSideImage(null);
    }
  }, [step]);

  // Also clear images whenever a new member is selected
  useEffect(() => {
    setHomeImage(null);
    setSideImage(null);
  }, [selectedMember]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!selectedCenter || !selectedMember || !homeImage || !sideImage) {
      setMessage('Please fill all fields and upload images.');
      return;
    }
    setLoading(true);
    
    try {
      // Fetch location at the moment of submission
      let capturedLocation = 'N/A';
      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { 
              enableHighAccuracy: true,
              timeout: 5000 
            });
          });
          capturedLocation = `${position.coords.latitude},${position.coords.longitude}`;
          setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        } catch (locErr) {
          console.error("Location capture failed during submit:", locErr);
          // Continue with N/A or alert? Let's proceed to ensure submission works
        }
      }

      const res = await fetch(`${API}/api/submit-pd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          centerId: selectedCenter,
          memberId: selectedMember,
          homeImage,
          sideImage,
          location: capturedLocation,
          staffId: localStorage.getItem('staffId')
        })
      });
      if (res.ok) {
        setMessage('Successfully submitted for PD Update verification!');
        setHomeImage(null); 
        setSideImage(null);
        
        // Immediately update local state to reflect submission and lock the member
        setMembers(prev => prev.map(m => 
          m.id === selectedMember ? { ...m, isSubmitted: true } : m
        ));
        
        setSelectedMember('');
        // Re-fetch members to sync with server
        handleRefresh();
        setStep(2);
      }
    } catch (err) { setMessage('Submission failed.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
          <div>
            <h2 className="text-3xl font-bold uppercase tracking-tight">PD Update</h2>
            <p className="text-slate-400 mt-1 uppercase text-[10px] font-bold tracking-[0.2em]">Select center and member to upload update details.</p>
          </div>
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl">
            <div className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <span className="font-black text-xs uppercase">RO</span>
            </div>
            <div>
              <p className="text-[9px] font-black text-indigo-300 uppercase tracking-[0.2em] leading-none mb-1">Authenticated Officer</p>
              <h3 className="text-sm font-black text-white leading-none uppercase tracking-tight">
                {localStorage.getItem('staffName') || 'Unknown Officer'} 
                <span className="text-indigo-400 ml-2 opacity-60">#{localStorage.getItem('staffId')}</span>
              </h3>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          title="Reload page data"
          className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-indigo-400 hover:text-white hover:border-indigo-500 hover:bg-indigo-600/20 transition-all text-sm font-semibold shadow-lg active:scale-95 ${
            isRefreshing ? 'opacity-70 cursor-not-allowed' : ''
          }`}
          disabled={isRefreshing}
        >
          <FaRedo className={`text-base ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Refreshing...' : 'Reload'}</span>
        </button>
      </header>

      {message && (
        <div className={`p-4 rounded-xl border ${message.includes('failed') ? 'bg-red-500/10 border-red-500/50 text-red-200' : 'bg-green-500/10 border-green-500/50 text-green-200'}`}>
          {message}
        </div>
      )}

      <div className="bg-white/5 border border-white/10 p-6 rounded-3xl space-y-6 min-h-[400px]">
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <label className="text-sm font-semibold text-indigo-300 uppercase tracking-widest border-b border-white/10 pb-2 block">1. Select Center</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {centers.map(c => (
                <button key={c.id} type="button" onClick={() => { setSelectedCenter(c.id); setStep(2); }} className="p-6 rounded-2xl text-left bg-slate-800/80 border border-slate-700 hover:border-indigo-500 shadow-lg transition-all transform hover:-translate-y-1 group">
                  <span className="font-black text-xl text-white block group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{c.name}</span>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Center ID: #{c.id}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-white/10 pb-4 gap-4">
              <div className="flex items-center space-x-4 w-full">
                <button type="button" onClick={() => setStep(1)} className="text-indigo-400 hover:indigo-300 font-bold flex items-center space-x-2"><FaArrowLeft /> <span>Back</span></button>
                <label className="text-sm font-semibold text-indigo-300 uppercase tracking-widest block">2. Select Member</label>
              </div>
              
              <div className="flex flex-col items-start md:items-end space-y-2 w-full md:w-auto">
                {/* Zoom Status + Join */}
                <div className="flex items-center gap-2">
                  {hostLinkStatus === 'live' && zoomLink ? (
                    <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-lg uppercase tracking-widest">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                      Link Ready
                    </span>
                  ) : hostLinkStatus === 'loading' ? (
                    <span className="text-[9px] text-slate-500 animate-pulse">Loading...</span>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    if (zoomLink && zoomLink.trim()) {
                      let url = zoomLink.trim();
                      if (/^\d+$/.test(url)) {
                        url = `https://zoom.us/j/${url}`;
                      } else if (url.includes('.')) {
                        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
                      } else {
                        alert('Valid Zoom URL or Meeting ID enter pannum.');
                        return;
                      }
                      window.open(url, '_blank', 'noopener,noreferrer');
                    } else {
                      alert('Zoom link illai. Verifier set pannatum.');
                    }
                  }}
                  className={`flex items-center justify-center space-x-2 px-5 py-2 rounded-xl text-sm font-bold shadow-lg transition-all w-full md:w-auto hover:scale-105 active:scale-95 ${
                    zoomLink && zoomLink.trim() ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20' : 'bg-slate-800 text-slate-500 shadow-none opacity-50 cursor-not-allowed'
                  }`}
                >
                  <FaVideo /> <span>Join Zoom Meeting</span>
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {membersLoading ? (
                  <div className="col-span-full flex justify-center py-10">
                    <FaSpinner className="text-3xl animate-spin text-indigo-500" />
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-slate-500 text-sm col-span-full text-center py-10">No members found.</p>
                ) : (
                  members.map(m => (
                    <button 
                      key={m.id} 
                      type="button" 
                      onClick={() => { if(!m.isSubmitted) { setSelectedMember(m.id); setStep(3); } }} 
                      disabled={m.isSubmitted}
                      className={`p-6 rounded-2xl text-left border transition-all shadow-lg transform ${
                        m.isSubmitted 
                          ? 'bg-slate-900/50 border-slate-800 opacity-80 cursor-not-allowed' 
                          : 'bg-slate-800 border border-slate-700 hover:border-blue-500 hover:-translate-y-1'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <span className={`font-black text-xl uppercase tracking-tight block leading-none mb-1 ${m.isSubmitted ? 'text-slate-500' : 'text-white'}`}>{m.name}</span>
                          <div className="flex gap-2 items-center mt-2">
                            <span className="text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest block">App: {m.appId}</span>
                            <span className="text-slate-500 text-[10px] font-bold block">ID: {m.id}</span>
                          </div>
                        </div>
                        {m.isSubmitted && (
                          <div className={`flex flex-col items-center justify-center p-2 rounded-xl min-w-[70px] ${m.pdVerified ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border border-amber-500/20'}`} title={m.pdVerified ? "Approved" : "Pending Verification"}>
                            {m.pdVerified ? (
                              <>
                                <FaCheckCircle className="text-xl mb-1" />
                                <span className="text-[8px] font-black tracking-widest uppercase">APPROVED</span>
                              </>
                            ) : (
                              <>
                                <FaSyncAlt className="text-xl mb-1 animate-spin-slow" />
                                <span className="text-[8px] font-black tracking-widest uppercase">PENDING</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <button type="button" onClick={() => setStep(2)} className="text-indigo-400 hover:indigo-300 font-bold flex items-center space-x-2"><FaArrowLeft /> <span>Back</span></button>
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="text-center space-y-2">
                  <label className="text-[10px] font-black text-indigo-300 uppercase tracking-widest block">Home Photo</label>
                  <div className="relative group aspect-square max-w-xs mx-auto">
                    <input type="file" onChange={(e)=>handleImageChange(e,'home')} className="hidden" id="h-up" accept="image/*" />
                    <label htmlFor="h-up" className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-3xl cursor-pointer hover:border-indigo-500 bg-slate-800/50 overflow-hidden">
                      {homeImage ? <img src={homeImage} className="w-full h-full object-cover" /> : <FaCamera className="text-3xl text-slate-600" />}
                    </label>
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <label className="text-[10px] font-black text-indigo-300 uppercase tracking-widest block">Side Photo</label>
                  <div className="relative group aspect-square max-w-xs mx-auto">
                    <input type="file" onChange={(e)=>handleImageChange(e,'side')} className="hidden" id="s-up" accept="image/*" />
                    <label htmlFor="s-up" className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-3xl cursor-pointer hover:border-indigo-500 bg-slate-800/50 overflow-hidden">
                      {sideImage ? <img src={sideImage} className="w-full h-full object-cover" /> : <FaCamera className="text-3xl text-slate-600" />}
                    </label>
                  </div>
                </div>
              </div>


              <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center space-x-3 shadow-xl transition-all transform hover:-translate-y-1">
                {loading ? <FaSpinner className="animate-spin" /> : <FaCheckCircle />}
                <span>Submit PD Update</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
