import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, query, where, addDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { usePlayer, Song } from '../context/PlayerContext';
import { useLanguage } from '../context/LanguageContext';
import { Play, Pause, Heart, Download, Plus, Trash2, Upload, Check, X, ExternalLink, Languages, Settings } from 'lucide-react';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { getDirectImageUrl } from '../utils/imageUtils';

interface Submission {
  id: string;
  userId: string;
  userName: string;
  title: string;
  artist: string;
  link: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

interface MainContentProps {
  currentView: 'home' | 'library' | 'liked';
  showSubmissionModal: boolean;
  onCloseSubmissionModal: () => void;
}

export const MainContent: React.FC<MainContentProps> = ({ currentView, showSubmissionModal, onCloseSubmissionModal }) => {
  const { user, isAdmin, authError, login, logout } = useAuth();
  const { currentSong, isPlaying, playSong, togglePlay } = usePlayer();
  const { t, language, setLanguage } = useLanguage();
  const [songs, setSongs] = useState<Song[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [libraryTracks, setLibraryTracks] = useState<Set<string>>(new Set());
  const [purchased, setPurchased] = useState<Set<string>>(new Set());
  const [downloadingSong, setDownloadingSong] = useState<string | null>(null);
  
  // Admin Add Song State
  const [isAddingSong, setIsAddingSong] = useState(false);
  const [newSong, setNewSong] = useState({ title: '', artist: '', audioUrl: '', coverUrl: '' });
  const [songToDelete, setSongToDelete] = useState<Song | null>(null);
  
  // Legal Modals State
  const [activeLegalModal, setActiveLegalModal] = useState<'impressum' | 'datenschutz' | 'agb' | 'widerruf' | null>(null);

  // Submission State
  const [submissionForm, setSubmissionForm] = useState({ title: '', artist: '', link: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [showAdminSubmissions, setShowAdminSubmissions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const fetchSongs = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'songs'));
        const songsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Song));
        setSongs(songsData);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
          handleFirestoreError(error, OperationType.GET, 'songs');
        } else {
          console.error(error);
        }
      }
    };
    fetchSongs();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      const unsubscribe = onSnapshot(collection(db, 'submissions'), (snapshot) => {
        const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission));
        setSubmissions(subs.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'submissions');
      });
      return () => unsubscribe();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (user) {
      const fetchUserData = async () => {
        try {
          const favQuery = query(collection(db, 'favorites'), where('userId', '==', user.uid));
          const favSnap = await getDocs(favQuery);
          setFavorites(new Set(favSnap.docs.map(doc => doc.data().songId)));

          const libQuery = query(collection(db, 'library'), where('userId', '==', user.uid));
          const libSnap = await getDocs(libQuery);
          setLibraryTracks(new Set(libSnap.docs.map(doc => doc.data().songId)));

          const purQuery = query(collection(db, 'purchases'), where('userId', '==', user.uid));
          const purSnap = await getDocs(purQuery);
          setPurchased(new Set(purSnap.docs.map(doc => doc.data().songId)));
        } catch (error) {
          if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
            handleFirestoreError(error, OperationType.GET, 'favorites/purchases');
          } else {
            console.error(error);
          }
        }
      };
      fetchUserData();
    } else {
      setFavorites(new Set());
      setLibraryTracks(new Set());
      setPurchased(new Set());
    }
  }, [user]);

  const toggleLibrary = async (songId: string) => {
    if (!user) return login();
    
    const libId = `${user.uid}_${songId}`;
    const libRef = doc(db, 'library', libId);
    
    try {
      if (libraryTracks.has(songId)) {
        await deleteDoc(libRef);
        setLibraryTracks(prev => {
          const next = new Set(prev);
          next.delete(songId);
          return next;
        });
      } else {
        await setDoc(libRef, { userId: user.uid, songId, addedAt: new Date().toISOString() });
        setLibraryTracks(prev => new Set(prev).add(songId));
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
        handleFirestoreError(error, OperationType.WRITE, `library/${libId}`);
      } else {
        console.error(error);
      }
    }
  };

  const toggleFavorite = async (songId: string) => {
    if (!user) return login();
    
    const favId = `${user.uid}_${songId}`;
    const favRef = doc(db, 'favorites', favId);
    
    try {
      if (favorites.has(songId)) {
        await deleteDoc(favRef);
        setFavorites(prev => {
          const next = new Set(prev);
          next.delete(songId);
          return next;
        });
      } else {
        await setDoc(favRef, { userId: user.uid, songId, addedAt: new Date().toISOString() });
        setFavorites(prev => new Set(prev).add(songId));
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
        handleFirestoreError(error, OperationType.WRITE, `favorites/${favId}`);
      } else {
        console.error(error);
      }
    }
  };

  const handleDownload = (song: Song) => {
    const sourceUrl = song.audioUrl || song.driveId || '';
    
    if (sourceUrl.includes('dropbox.com')) {
      const downloadUrl = sourceUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
      window.open(downloadUrl, '_blank');
    } else if (sourceUrl.includes('drive.google.com') || song.driveId) {
      const driveId = song.driveId || (sourceUrl.match(/[-\w]{25,}/) || [])[0];
      if (driveId) {
        window.open(`https://drive.google.com/uc?export=download&id=${driveId}`, '_blank');
      } else {
        window.open(sourceUrl, '_blank');
      }
    } else {
      // For direct audio URLs (like Firebase Storage or other CDNs)
      window.open(sourceUrl, '_blank');
    }
  };

  const handleAddSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSong.title || !newSong.artist || !newSong.audioUrl || !newSong.coverUrl) return;
    
    try {
      const songId = `song_${Date.now()}`;
      
      const songData = {
        title: newSong.title,
        artist: newSong.artist,
        audioUrl: newSong.audioUrl,
        driveId: '', // Keep empty for new songs, use audioUrl instead
        coverUrl: newSong.coverUrl,
        addedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'songs', songId), songData);
      setSongs(prev => [...prev, { id: songId, ...songData } as Song]);
      setIsAddingSong(false);
      setNewSong({ title: '', artist: '', audioUrl: '', coverUrl: '' });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
        handleFirestoreError(error, OperationType.CREATE, 'songs');
      } else {
        console.error(error);
      }
    }
  };

  const confirmDeleteSong = async () => {
    if (!songToDelete || !isAdmin) return;
    try {
      await deleteDoc(doc(db, 'songs', songToDelete.id));
      setSongs(prev => prev.filter(s => s.id !== songToDelete.id));
      setSongToDelete(null);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
        handleFirestoreError(error, OperationType.DELETE, `songs/${songToDelete.id}`);
      } else {
        console.error(error);
      }
    }
  };

  const handleSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return login();
    if (!submissionForm.title || !submissionForm.artist || !submissionForm.link) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'submissions'), {
        userId: user.uid,
        userName: user.displayName || user.email || 'Anonymous',
        title: submissionForm.title,
        artist: submissionForm.artist,
        link: submissionForm.link,
        status: 'pending',
        submittedAt: new Date().toISOString()
      });
      setSubmissionForm({ title: '', artist: '', link: '' });
      onCloseSubmissionModal();
      alert(t('submissionSuccess'));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'submissions');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveSubmission = async (sub: Submission) => {
    if (!isAdmin) return;
    
    // Open the add song form with pre-filled data
    setNewSong({
      title: sub.title,
      artist: sub.artist,
      audioUrl: sub.link,
      coverUrl: '' // Admin needs to provide a cover
    });
    setIsAddingSong(true);
    
    // Update submission status
    try {
      await setDoc(doc(db, 'submissions', sub.id), { ...sub, status: 'approved' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `submissions/${sub.id}`);
    }
  };

  const handleRejectSubmission = async (sub: Submission) => {
    if (!isAdmin) return;
    try {
      await setDoc(doc(db, 'submissions', sub.id), { ...sub, status: 'rejected' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `submissions/${sub.id}`);
    }
  };

  return (
    <div className="flex-1 bg-transparent overflow-y-auto relative">
      {/* Header */}
      <header className="flex justify-between items-center p-4 md:p-6 sticky top-0 bg-black/20 backdrop-blur-xl border-b border-white/10 z-10">
        <div className="text-white font-bold text-xl md:text-2xl flex items-center gap-2 md:gap-3">
          VRifle Music
          <span className="text-[10px] bg-white/10 text-white/80 px-2 py-1 rounded-md font-medium tracking-wider uppercase border border-white/10 shadow-sm">Beta</span>
        </div>
        <div className="flex flex-col items-end">
          {user ? (
            <div className="flex items-center gap-4">
              {isAdmin && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsAddingSong(true)}
                    className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/10 text-white px-4 py-2 rounded-full font-bold hover:bg-white/20 hover:scale-105 transition shadow-lg"
                  >
                    <Plus size={20} /> {t('addSong')}
                  </button>
                  <button 
                    onClick={() => setShowAdminSubmissions(!showAdminSubmissions)}
                    className={`flex items-center gap-2 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full font-bold transition shadow-lg relative ${
                      showAdminSubmissions ? 'bg-green-500 text-black' : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    <Upload size={20} /> 
                    {t('submissions')}
                    {submissions.filter(s => s.status === 'pending').length > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-black">
                        {submissions.filter(s => s.status === 'pending').length}
                      </span>
                    )}
                  </button>
                </div>
              )}
              <span className="text-white font-medium">{user.displayName}</span>
              <button 
                onClick={() => setShowSettings(true)}
                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition"
                title={t('settings')}
              >
                <Settings size={24} />
              </button>
              <button onClick={logout} className="bg-white/10 backdrop-blur-md border border-white/10 text-white px-4 py-2 rounded-full hover:bg-white/20 transition">
                {t('logout')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowSettings(true)}
                  className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition"
                  title={t('settings')}
                >
                  <Settings size={24} />
                </button>
                <button onClick={login} className="bg-white/10 backdrop-blur-md border border-white/10 text-white font-bold px-6 py-2 rounded-full hover:bg-white/20 transition shadow-lg">
                  {t('login')}
                </button>
              </div>
              {authError && (
                <div className="text-red-400 text-xs max-w-xs text-right bg-red-900/20 p-2 rounded">
                  {authError}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="p-4 md:p-6 relative z-0">
        {showAdminSubmissions && isAdmin && (
          <div className="mb-8 bg-black/30 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-2xl overflow-x-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-white text-2xl font-bold tracking-tight">{t('userSubmissions')}</h3>
              <button 
                onClick={() => setShowAdminSubmissions(false)}
                className="text-white/60 hover:text-white transition"
              >
                {t('close')}
              </button>
            </div>
            
            {submissions.length === 0 ? (
              <p className="text-white/40 text-center py-8">{t('noSubmissions')}</p>
            ) : (
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-white/10 text-white/60 text-sm uppercase tracking-wider">
                    <th className="py-3 px-4 font-medium">{t('user')}</th>
                    <th className="py-3 px-4 font-medium">{t('song')}</th>
                    <th className="py-3 px-4 font-medium">{t('link')}</th>
                    <th className="py-3 px-4 font-medium">{t('status')}</th>
                    <th className="py-3 px-4 font-medium text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="text-white/80">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="border-b border-white/5 hover:bg-white/5 transition group">
                      <td className="py-4 px-4">
                        <div className="font-medium">{sub.userName}</div>
                        <div className="text-xs text-white/40">{new Date(sub.submittedAt).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}</div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-bold text-white">{sub.title}</div>
                        <div className="text-sm text-white/60">{sub.artist}</div>
                      </td>
                      <td className="py-4 px-4">
                        <a 
                          href={sub.link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline text-sm truncate max-w-[150px] inline-block"
                        >
                          {t('openLink')}
                        </a>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold tracking-tighter ${
                          sub.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                          sub.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {t(sub.status)}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        {sub.status === 'pending' && (
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => handleApproveSubmission(sub)}
                              className="p-2 bg-green-500/20 text-green-400 rounded-full hover:bg-green-500/40 transition"
                              title={t('approveAndAdd')}
                            >
                              <Plus size={16} />
                            </button>
                            <button 
                              onClick={() => handleRejectSubmission(sub)}
                              className="p-2 bg-red-500/20 text-red-400 rounded-full hover:bg-red-500/40 transition"
                              title={t('reject')}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {isAddingSong && (
          <div className="mb-8 bg-black/30 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-2xl">
            <h3 className="text-white text-xl font-bold mb-4">{t('addNewSong')}</h3>
            <form onSubmit={handleAddSong} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input 
                type="text" 
                placeholder={t('songTitle')} 
                value={newSong.title}
                onChange={e => setNewSong({...newSong, title: e.target.value})}
                className="bg-black/20 text-white px-4 py-2 rounded-lg border border-white/10 focus:outline-none focus:border-green-500 backdrop-blur-md"
                required
              />
              <input 
                type="text" 
                placeholder={t('artistName')} 
                value={newSong.artist}
                onChange={e => setNewSong({...newSong, artist: e.target.value})}
                className="bg-black/20 text-white px-4 py-2 rounded-lg border border-white/10 focus:outline-none focus:border-green-500 backdrop-blur-md"
                required
              />
              <input 
                type="text" 
                placeholder={t('audioUrl')} 
                value={newSong.audioUrl}
                onChange={e => setNewSong({...newSong, audioUrl: e.target.value})}
                className="bg-black/20 text-white px-4 py-2 rounded-lg border border-white/10 focus:outline-none focus:border-green-500 backdrop-blur-md"
                required
              />
              <input 
                type="url" 
                placeholder={t('coverUrl')} 
                value={newSong.coverUrl}
                onChange={e => setNewSong({...newSong, coverUrl: e.target.value})}
                className="bg-black/20 text-white px-4 py-2 rounded-lg border border-white/10 focus:outline-none focus:border-green-500 backdrop-blur-md"
                required
              />
              <div className="md:col-span-2 flex justify-end gap-2 mt-2">
                <button 
                  type="button" 
                  onClick={() => setIsAddingSong(false)}
                  className="px-6 py-2 rounded-full text-white hover:bg-white/10 transition"
                >
                  {t('cancel')}
                </button>
                <button 
                  type="submit"
                  className="bg-white/20 backdrop-blur-md border border-white/20 text-white px-6 py-2 rounded-full font-bold hover:bg-white/30 hover:scale-105 transition shadow-lg"
                >
                  {t('saveSong')}
                </button>
              </div>
            </form>
          </div>
        )}

        <h2 className="text-white text-2xl font-bold mb-6 drop-shadow-md">
          {currentView === 'home' ? t('featuredSongs') : currentView === 'library' ? t('library') : t('likedSongs')}
        </h2>
        
        {currentView !== 'home' && !user ? (
          <div className="text-center py-12 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10">
            <p className="text-white/60 mb-4">{t('loginToSubmit')}</p>
            <button onClick={login} className="bg-white text-black font-bold px-6 py-2 rounded-full hover:bg-zinc-200 transition shadow-lg">
              {t('login')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
            {songs
              .filter(song => {
                if (currentView === 'library') return libraryTracks.has(song.id);
                if (currentView === 'liked') return favorites.has(song.id);
                return true;
              })
              .map(song => (
              <div key={song.id} className="bg-white/5 backdrop-blur-lg border border-white/10 p-3 md:p-4 rounded-2xl hover:bg-white/10 transition group relative shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]">
                <div className="relative mb-3 md:mb-4">
                  <img 
                    src={getDirectImageUrl(song.coverUrl)} 
                    alt={song.title} 
                    className="w-full aspect-square object-cover object-center rounded-md shadow-lg" 
                    referrerPolicy="no-referrer"
                  />
                  <button 
                    onClick={() => currentSong?.id === song.id ? togglePlay() : playSong(song)}
                    className={`absolute inset-0 m-auto w-14 h-14 bg-white/20 backdrop-blur-xl border border-white/30 text-white rounded-full flex items-center justify-center shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:bg-white/30 hover:scale-110 transition-all z-10 ${currentSong?.id === song.id && isPlaying ? 'opacity-100 scale-105' : 'opacity-60 group-hover:opacity-100'}`}
                  >
                    {currentSong?.id === song.id && isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                  </button>
                </div>
                <h3 className="text-white font-semibold truncate">{song.title}</h3>
                <p className="text-zinc-400 text-sm truncate mb-4">{song.artist}</p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleFavorite(song.id)} className="text-zinc-400 hover:text-white transition" title={t('likedSongs')}>
                      <Heart size={20} fill={favorites.has(song.id) ? "currentColor" : "none"} className={favorites.has(song.id) ? "text-green-500" : ""} />
                    </button>
                    <button onClick={() => toggleLibrary(song.id)} className="text-zinc-400 hover:text-white transition" title={libraryTracks.has(song.id) ? t('removeFromLibrary') : t('addToLibrary')}>
                      {libraryTracks.has(song.id) ? <Check size={20} className="text-green-500" /> : <Plus size={20} />}
                    </button>
                    {isAdmin && (
                      <button onClick={() => setSongToDelete(song)} className="text-zinc-400 hover:text-red-500 transition ml-2" title={t('deleteSong')}>
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                  
                  {purchased.has(song.id) ? (
                    <button onClick={() => handleDownload(song)} className="bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 px-3 py-1.5 rounded-full transition flex items-center gap-1 text-sm font-medium backdrop-blur-md">
                      <Download size={16} /> {t('download')}
                    </button>
                  ) : (
                    <button 
                      disabled
                      className="bg-white/5 text-zinc-500 border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-1 text-sm font-medium backdrop-blur-md cursor-not-allowed"
                      title={t('purchaseDisabled')}
                    >
                      <Download size={16} /> 0.20€
                    </button>
                  )}
                </div>

                {/* PayPal Modal */}
                {downloadingSong === song.id && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xl rounded-2xl p-4 flex flex-col items-center justify-center z-20 border border-white/10">
                    <p className="text-white text-sm text-center mb-4 font-medium drop-shadow-md">{t('buyFor', { title: song.title, price: '0.20€' })}</p>
                    <div className="w-full max-w-[150px]">
                      <PayPalScriptProvider options={{ clientId: "AWsNo5DqreDWuDj8wh8QwRuN5UwAcV8wRbV0thPR5B-2gRgC86A0PfI3WY2nDwdS-f3rYPfcMrrzTysU", currency: "EUR" }}>
                        <PayPalButtons 
                          style={{ layout: "horizontal", height: 30 }}
                          createOrder={(data, actions) => {
                            return actions.order.create({
                              intent: "CAPTURE",
                              purchase_units: [{
                                amount: { value: "0.20", currency_code: "EUR" },
                                description: `Download ${song.title}`,
                                payee: {
                                  email_address: "sk.vrifle@gmail.com"
                                }
                              }]
                            });
                          }}
                          onApprove={async (data, actions) => {
                            if (actions.order) {
                              const details = await actions.order.capture();
                              if (user) {
                                try {
                                  const purchaseId = `${user.uid}_${song.id}_${Date.now()}`;
                                  await setDoc(doc(db, 'purchases', purchaseId), {
                                    userId: user.uid,
                                    songId: song.id,
                                    amount: 0.20,
                                    currency: 'EUR',
                                    paypalOrderId: details.id,
                                    purchasedAt: new Date().toISOString()
                                  });
                                  setPurchased(prev => new Set(prev).add(song.id));
                                  setDownloadingSong(null);
                                } catch (error) {
                                  if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
                                    handleFirestoreError(error, OperationType.WRITE, 'purchases');
                                  } else {
                                    console.error(error);
                                  }
                                }
                              }
                            }
                          }}
                          onCancel={() => setDownloadingSong(null)}
                        />
                      </PayPalScriptProvider>
                    </div>
                    <button onClick={() => setDownloadingSong(null)} className="mt-2 text-xs text-zinc-400 hover:text-white">{t('cancel')}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-12 p-6 border-t border-white/10 flex flex-col items-center justify-center gap-4 text-zinc-500 text-sm relative z-0">
        <div className="flex flex-wrap justify-center gap-4 md:gap-8">
          <button onClick={() => setActiveLegalModal('impressum')} className="hover:text-white transition">{t('impressum')}</button>
          <button onClick={() => setActiveLegalModal('datenschutz')} className="hover:text-white transition">{t('datenschutz')}</button>
          <button onClick={() => setActiveLegalModal('agb')} className="hover:text-white transition">{t('agb')}</button>
          <button onClick={() => setActiveLegalModal('widerruf')} className="hover:text-white transition">{t('widerruf')}</button>
        </div>
        <div className="flex flex-col items-center gap-1">
          <p>&copy; {new Date().getFullYear()} VRifle Music. {t('allRightsReserved')}</p>
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest">{t('aiGeneratedContent')}</p>
        </div>
      </footer>

      {/* Legal Modals */}
      {activeLegalModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-black/40 backdrop-blur-2xl border border-white/10 p-6 md:p-8 rounded-3xl max-w-2xl w-full shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] max-h-[80vh] flex flex-col">
            <h3 className="text-2xl font-bold text-white mb-4 capitalize">
              {activeLegalModal === 'agb' ? t('agbFull') : t(activeLegalModal)}
            </h3>
            <div className="text-white/80 overflow-y-auto pr-2 flex-1 space-y-4 text-sm leading-relaxed">
              {activeLegalModal === 'impressum' && (
                <>
                  <p><strong>Angaben gemäß § 5 TMG</strong></p>
                  <p><strong>Betreiber der Website:</strong></p>
                  <p>Lars Scherzer<br/>VRifle<br/>Alte Triebeler Straße 1a<br/>08606 Oelsnitz<br/>Deutschland</p>
                  <p><strong>Kontakt:</strong></p>
                  <p>E-Mail: <a href="mailto:sk.vrifle@gmail.com" className="text-blue-400 hover:underline">sk.vrifle@gmail.com</a><br/>Website: <a href="https://vrifle-3d.de" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">vrifle-3d.de</a></p>
                  <p><strong>Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:</strong></p>
                  <p>Lars Scherzer<br/>Alte Triebeler Straße 1a<br/>08606 Oelsnitz</p>
                </>
              )}
              {activeLegalModal === 'datenschutz' && (
                <div className="space-y-6">
                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">1. Allgemeine Hinweise</h4>
                    <p>Der Schutz Ihrer persönlichen Daten ist uns ein wichtiges Anliegen. Diese Datenschutzerklärung informiert Sie darüber, welche personenbezogenen Daten bei der Nutzung von VRifle Music erhoben und verarbeitet werden.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">2. Verantwortlicher</h4>
                    <p>
                      Lars Scherzer<br/>
                      VRifle<br/>
                      Alte Triebeler Straße 1a<br/>
                      08606 Oelsnitz<br/>
                      Deutschland
                    </p>
                    <p className="mt-2">
                      E-Mail: <a href="mailto:sk.vrifle@gmail.com" className="text-blue-400 hover:underline">sk.vrifle@gmail.com</a><br/>
                      Website: <a href="https://vrifle-3d.de" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">vrifle-3d.de</a>
                    </p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">3. Hosting und Content Delivery Network (CDN)</h4>
                    <p>Diese Website wird über den Dienst Cloudflare betrieben.</p>
                    <p className="mt-2"><strong>Anbieter:</strong><br/>Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA</p>
                    <p className="mt-2">Cloudflare bietet ein Content Delivery Network (CDN) sowie Sicherheitsfunktionen (z. B. DDoS-Schutz). Dabei wird der Datenverkehr über Server von Cloudflare geleitet.</p>
                    <p className="mt-2">Dabei können folgende Daten verarbeitet werden:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>IP-Adresse</li>
                      <li>Browsertyp und -version</li>
                      <li>Betriebssystem</li>
                      <li>Referrer-URL</li>
                      <li>Uhrzeit der Anfrage</li>
                    </ul>
                    <p className="mt-2">Die Nutzung von Cloudflare erfolgt im Interesse einer sicheren und effizienten Bereitstellung unseres Onlineangebotes (Art. 6 Abs. 1 lit. f DSGVO).</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">4. Datenerfassung auf der Website</h4>
                    <h5 className="font-bold text-white/90 mt-3 mb-1">Server-Log-Dateien</h5>
                    <p>Beim Besuch der Website werden automatisch Informationen erfasst:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>Browsertyp und -version</li>
                      <li>verwendetes Betriebssystem</li>
                      <li>Referrer URL</li>
                      <li>Hostname des zugreifenden Rechners</li>
                      <li>Uhrzeit der Serveranfrage</li>
                      <li>IP-Adresse (gekürzt)</li>
                    </ul>
                    <p className="mt-2">Diese Daten sind nicht bestimmten Personen zuordenbar und dienen ausschließlich der technischen Überwachung und Sicherheit.</p>

                    <h5 className="font-bold text-white/90 mt-4 mb-1">Registrierung und Login über Google</h5>
                    <p>Für die Nutzung bestimmter Funktionen ist ein Benutzerkonto erforderlich. Die Anmeldung erfolgt über den Dienst Google.</p>
                    <p className="mt-2">Dabei können folgende Daten verarbeitet werden:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>Name</li>
                      <li>E-Mail-Adresse</li>
                      <li>Google-Profil-ID</li>
                    </ul>
                    <p className="mt-2">Diese Daten werden zur Verwaltung Ihres Benutzerkontos verwendet (Art. 6 Abs. 1 lit. b DSGVO).</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">5. Nutzung der Plattform</h4>
                    <h5 className="font-bold text-white/90 mt-3 mb-1">Musikstreaming</h5>
                    <p>Bei der Nutzung der Streamingfunktion werden folgende Daten verarbeitet:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>abgespielte Inhalte</li>
                      <li>Nutzungszeitpunkte</li>
                      <li>technische Streamingdaten</li>
                    </ul>
                    <p className="mt-2">Diese Verarbeitung erfolgt zur Bereitstellung der Plattform (Art. 6 Abs. 1 lit. b DSGVO).</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">6. Zahlungsabwicklung</h4>
                    <p>Für kostenpflichtige Downloads erfolgt die Zahlung über PayPal.</p>
                    <p className="mt-2">Dabei werden zur Zahlungsabwicklung folgende Daten an PayPal übermittelt:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>Zahlungsbetrag</li>
                      <li>Transaktionsdaten</li>
                      <li>Zahlungsstatus</li>
                    </ul>
                    <p className="mt-2">Die Verarbeitung erfolgt zur Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">7. Datenübermittlung in Drittländer (insbesondere USA)</h4>
                    <p>Im Rahmen der Nutzung unserer Plattform kann es zur Übermittlung personenbezogener Daten in die Vereinigten Staaten von Amerika (USA) kommen.</p>
                    <p className="mt-2">Dies betrifft insbesondere folgende Dienstleister:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>Cloudflare</li>
                      <li>Google</li>
                      <li>PayPal</li>
                    </ul>
                    <p className="mt-2">Die USA gelten als Drittland ohne ein der EU gleichwertiges Datenschutzniveau.</p>
                    <p className="mt-2">Es besteht insbesondere das Risiko, dass:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>US-Behörden Zugriff auf personenbezogene Daten erhalten können</li>
                      <li>Betroffenenrechte möglicherweise nicht durchsetzbar sind</li>
                      <li>keine gleichwertigen Rechtsbehelfe bestehen</li>
                    </ul>
                    <p className="mt-2"><strong>Rechtsgrundlagen der Übermittlung</strong></p>
                    <p>Die Übermittlung erfolgt auf Grundlage von:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>Standardvertragsklauseln (SCC) gemäß Art. 46 DSGVO</li>
                      <li>ggf. EU-U.S. Data Privacy Framework (sofern anwendbar)</li>
                      <li>Einwilligung</li>
                    </ul>
                    <p className="mt-2">Sofern erforderlich, erfolgt die Datenübermittlung nur nach Ihrer ausdrücklichen Einwilligung gemäß Art. 6 Abs. 1 lit. a DSGVO.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">8. Speicherdauer</h4>
                    <p>Personenbezogene Daten werden nur so lange gespeichert, wie dies zur Erfüllung der jeweiligen Zwecke erforderlich ist oder gesetzliche Aufbewahrungspflichten bestehen.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">9. Ihre Rechte</h4>
                    <p>Sie haben jederzeit das Recht auf:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>Auskunft über Ihre gespeicherten Daten (Art. 15 DSGVO)</li>
                      <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
                      <li>Löschung Ihrer Daten (Art. 17 DSGVO)</li>
                      <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
                      <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
                      <li>Widerruf einer Einwilligung (Art. 7 Abs. 3 DSGVO)</li>
                    </ul>
                    <p className="mt-4">Zur Ausübung Ihrer Rechte wenden Sie sich bitte an:<br/>
                    <a href="mailto:sk.vrifle@gmail.com" className="text-blue-400 hover:underline">sk.vrifle@gmail.com</a></p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">10. Beschwerderecht bei der Aufsichtsbehörde</h4>
                    <p>Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung Ihrer personenbezogenen Daten zu beschweren.</p>
                    <p className="mt-2">Zuständig ist in der Regel die Aufsichtsbehörde Ihres Wohnortes oder unseres Unternehmenssitzes.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">11. Änderungen dieser Datenschutzerklärung</h4>
                    <p>Diese Datenschutzerklärung kann angepasst werden, um rechtlichen Anforderungen oder Änderungen unserer Leistungen gerecht zu werden.</p>
                  </section>
                </div>
              )}
              {activeLegalModal === 'agb' && (
                <div className="space-y-6">
                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">1. Geltungsbereich</h4>
                    <p>Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Nutzung der Musikplattform VRifle Music.</p>
                    <p className="mt-2"><strong>Anbieter der Plattform ist:</strong></p>
                    <p>
                      Lars Scherzer<br/>
                      VRifle<br/>
                      Alte Triebeler Straße 1a<br/>
                      08606 Oelsnitz<br/>
                      Deutschland<br/>
                      E-Mail: <a href="mailto:sk.vrifle@gmail.com" className="text-blue-400 hover:underline">sk.vrifle@gmail.com</a>
                    </p>
                    <p className="mt-2">Website: <a href="https://vrifle-3d.de" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">vrifle-3d.de</a></p>
                    <p className="mt-2">Mit der Nutzung der Plattform erklärt sich der Nutzer mit diesen AGB einverstanden.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">2. Leistungen der Plattform</h4>
                    <p>VRifle Music bietet Nutzern:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>kostenloses Streaming von Musik</li>
                      <li>kostenpflichtigen Download von Musikstücken</li>
                    </ul>
                    <p className="mt-2">Der Betreiber behält sich vor, Inhalte jederzeit zu ändern, zu erweitern oder zu entfernen.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">3. Registrierung und Nutzerkonto</h4>
                    <p>(1) Für die Nutzung bestimmter Funktionen, insbesondere des Musikplayers und des Kaufs von Downloads, ist ein Benutzerkonto erforderlich.</p>
                    <p>(2) Die Registrierung erfolgt ausschließlich über ein Google-Konto.</p>
                    <p>(3) Der Nutzer ist verpflichtet, seine Zugangsdaten vertraulich zu behandeln.</p>
                    <p>(4) Der Betreiber behält sich vor, Nutzerkonten bei Verstößen gegen diese AGB zu sperren oder zu löschen.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">4. Nutzung des kostenlosen Streamings</h4>
                    <p>(1) Das Streaming von Musik ist kostenlos.</p>
                    <p>(2) Die Nutzung der gestreamten Inhalte ist ausschließlich für private Zwecke gestattet.</p>
                    <p>(3) Insbesondere ist es untersagt:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>die Inhalte kommerziell zu nutzen</li>
                      <li>die Inhalte aufzunehmen, zu vervielfältigen oder weiterzuverbreiten</li>
                      <li>die Inhalte öffentlich zugänglich zu machen</li>
                    </ul>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">5. Musikdownloads und kommerzielle Nutzung</h4>
                    <p>(1) Nutzer haben die Möglichkeit, Musikstücke kostenpflichtig zu erwerben und herunterzuladen.</p>
                    <p>(2) Der Preis pro Musikstück beträgt 0,20 €.</p>
                    <p>(3) Mit dem Kauf eines Musikstücks erhält der Nutzer ein einfaches, zeitlich unbegrenztes Nutzungsrecht.</p>
                    <p>(4) Dieses Nutzungsrecht umfasst ausdrücklich auch die kommerzielle Nutzung der heruntergeladenen Musikstücke.</p>
                    <p>(5) Der Nutzer ist berechtigt, die Musik z. B. zu verwenden für:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>Videos (z. B. YouTube, Social Media)</li>
                      <li>kommerzielle Projekte</li>
                      <li>eigene Inhalte und Produktionen</li>
                    </ul>
                    <p className="mt-2">(6) Nicht gestattet ist jedoch:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>Weiterverkauf der Musik als eigenständiges Produkt</li>
                      <li>Weitergabe oder Vertrieb der Musikdateien an Dritte</li>
                      <li>Upload auf Streamingplattformen als eigener Inhalt</li>
                    </ul>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">6. Zahlungsbedingungen</h4>
                    <p>(1) Die Bezahlung erfolgt ausschließlich über PayPal.</p>
                    <p>(2) Voraussetzung für den Kauf ist ein gültiges PayPal-Konto.</p>
                    <p>(3) Mit Abschluss der Zahlung kommt ein verbindlicher Kaufvertrag zustande.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">7. Digitale Inhalte und Widerrufsrecht</h4>
                    <p>(1) Bei den angebotenen Produkten handelt es sich um digitale Inhalte.</p>
                    <p>(2) Der Nutzer stimmt ausdrücklich zu, dass die Ausführung des Vertrags vor Ablauf der Widerrufsfrist beginnt.</p>
                    <p>(3) Der Nutzer bestätigt, dass mit Beginn des Downloads sein Widerrufsrecht erlischt.</p>
                    <p>(4) Eine Rückerstattung ist ausgeschlossen.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">8. Urheberrechte</h4>
                    <p>(1) Alle Inhalte auf der Plattform sind urheberrechtlich geschützt.</p>
                    <p>(2) Die Rechte liegen beim Betreiber oder den jeweiligen Rechteinhabern.</p>
                    <p>(3) Die Nutzung ist nur im Rahmen der in diesen AGB eingeräumten Rechte zulässig.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">9. Verfügbarkeit der Plattform</h4>
                    <p>(1) Der Betreiber bemüht sich um eine möglichst unterbrechungsfreie Verfügbarkeit der Plattform.</p>
                    <p>(2) Es besteht kein Anspruch auf permanente Verfügbarkeit.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">10. Haftung</h4>
                    <p>(1) Der Betreiber haftet nur für Schäden, die auf vorsätzlichem oder grob fahrlässigem Verhalten beruhen.</p>
                    <p>(2) Für technische Störungen, Datenverluste oder Ausfälle von Drittanbietern wird keine Haftung übernommen, soweit gesetzlich zulässig.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">11. Änderungen der AGB</h4>
                    <p>Der Betreiber behält sich vor, diese AGB jederzeit zu ändern. Die weitere Nutzung der Plattform gilt als Zustimmung zu den geänderten Bedingungen.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">12. Anwendbares Recht</h4>
                    <p>Es gilt das Recht der Bundesrepublik Deutschland.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">13. Schlussbestimmungen</h4>
                    <p>Sollte eine Bestimmung dieser AGB unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>
                  </section>

                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">14. KI-generierte Inhalte</h4>
                    <p>(1) Die auf der Plattform angebotenen Musikstücke werden vollständig oder überwiegend mithilfe von künstlicher Intelligenz erstellt.</p>
                    <p>(2) Die Inhalte basieren auf Technologien, unter anderem unter Verwendung von KI-Systemen wie Suno, und werden durch den Betreiber weiterentwickelt, bearbeitet oder kuratiert.</p>
                    <p>(3) Es wird ausschließlich KI-generierte Musik angeboten. Es handelt sich nicht um klassische, von menschlichen Künstlern produzierte Musikwerke.</p>
                    <p>(4) Texte, Kompositionen und finale Inhalte werden durch VRifle erstellt bzw. kontrolliert und zur Nutzung bereitgestellt.</p>
                    <p>(5) Trotz KI-Erstellung unterliegen die angebotenen Inhalte den geltenden urheberrechtlichen bzw. nutzungsrechtlichen Bestimmungen gemäß diesen AGB.</p>
                  </section>
                </div>
              )}
              {activeLegalModal === 'widerruf' && (
                <div className="space-y-6">
                  <section>
                    <h4 className="text-lg font-bold text-white mb-2">Widerrufsbelehrung für digitale Inhalte</h4>
                    <h5 className="font-bold text-white/90 mb-1">1. Widerrufsrecht</h5>
                    <p>Als Verbraucher haben Sie grundsätzlich das Recht, innerhalb von 14 Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.</p>
                    <p className="mt-2">Bei VRifle Music betrifft dies ausschließlich digitale Inhalte (Musikdownloads).</p>
                  </section>

                  <section>
                    <h5 className="font-bold text-white/90 mb-1">2. Widerrufsfrist</h5>
                    <p>Die Widerrufsfrist beträgt 14 Tage ab dem Tag des Vertragsabschlusses (also dem Kauf eines Musikdownloads).</p>
                  </section>

                  <section>
                    <h5 className="font-bold text-white/90 mb-1">3. Ausschluss des Widerrufsrechts</h5>
                    <p>Das Widerrufsrecht erlischt bei digitalen Inhalten gemäß § 356 Abs. 5 BGB in Verbindung mit Art. 6 Abs. 1 lit. b DSGVO, sobald:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>der Download des digitalen Inhalts begonnen hat, und</li>
                      <li>der Nutzer ausdrücklich zugestimmt hat, dass die Ausführung des Vertrags vor Ablauf der Widerrufsfrist beginnt, und</li>
                      <li>der Nutzer Kenntnis davon hat, dass er dadurch sein Widerrufsrecht verliert.</li>
                    </ul>
                    <p className="mt-4"><strong>Bei VRifle Music gilt dies standardmäßig:</strong></p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>Musikdownloads werden sofort nach dem Kauf bereitgestellt</li>
                      <li>Mit dem Kauf bestätigen Sie, dass Sie die Sofortbereitstellung wünschen und damit auf Ihr Widerrufsrecht verzichten</li>
                    </ul>
                    <p className="mt-2">Daher sind Rückerstattungen ausgeschlossen.</p>
                  </section>

                  <section>
                    <h5 className="font-bold text-white/90 mb-1">4. Hinweis für den Kaufprozess</h5>
                    <p>Um rechtlich sicher zu sein, muss der Kaufprozess eine explizite Zustimmung enthalten, z. B. durch eine Checkbox:</p>
                    <p className="italic mt-2 bg-white/5 p-3 rounded-lg border border-white/10">
                      „Ich stimme ausdrücklich zu, dass der Download sofort bereitgestellt wird. Mir ist bekannt, dass ich dadurch mein Widerrufsrecht verliere.“
                    </p>
                    <p className="mt-2 text-xs text-white/40">Ohne diese Zustimmung wäre die Regelung angreifbar.</p>
                  </section>

                  <section>
                    <h5 className="font-bold text-white/90 mb-1">5. Zusammenfassung</h5>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>Alle Produkte auf VRifle Music sind digitale Inhalte</li>
                      <li>Keine Rückgabe oder Erstattung nach Downloadstart</li>
                      <li>Widerrufsrecht erlischt sofort bei Sofortdownload</li>
                    </ul>
                  </section>
                </div>
              )}
            </div>
            <div className="flex justify-end mt-6 pt-4 border-t border-white/10">
              <button 
                onClick={() => setActiveLegalModal(null)}
                className="px-6 py-2 rounded-full bg-white/10 backdrop-blur-md text-white font-bold hover:bg-white/20 transition shadow-lg"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Song Submission Modal */}
      {showSubmissionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-black/40 backdrop-blur-2xl border border-white/10 p-6 md:p-8 rounded-3xl max-w-md w-full shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-green-500/20 rounded-2xl flex items-center justify-center text-green-500">
                <Upload size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">{t('submitTitle')}</h3>
                <p className="text-white/60 text-sm">{t('submitSubtitle')}</p>
              </div>
            </div>

            {!user ? (
              <div className="text-center py-4">
                <p className="text-white/80 mb-6">{t('loginToSubmit')}</p>
                <button 
                  onClick={() => { login(); onCloseSubmissionModal(); }}
                  className="w-full py-3 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition shadow-lg"
                >
                  {t('loginWithGoogle')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmission} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 ml-1">{t('titleLabel')}</label>
                  <input 
                    type="text" 
                    value={submissionForm.title}
                    onChange={e => setSubmissionForm({...submissionForm, title: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-500/50 transition"
                    placeholder="z.B. Moonlight Sonata"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 ml-1">{t('artistLabel')}</label>
                  <input 
                    type="text" 
                    value={submissionForm.artist}
                    onChange={e => setSubmissionForm({...submissionForm, artist: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-500/50 transition"
                    placeholder="z.B. Beethoven"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 ml-1">{t('linkLabel')}</label>
                  <input 
                    type="url" 
                    value={submissionForm.link}
                    onChange={e => setSubmissionForm({...submissionForm, link: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-500/50 transition"
                    placeholder="https://..."
                    required
                  />
                </div>
                <div className="flex gap-3 mt-8">
                  <button 
                    type="button"
                    onClick={onCloseSubmissionModal}
                    className="flex-1 py-3 rounded-full text-white font-bold hover:bg-white/10 transition border border-white/10"
                  >
                    {t('cancel')}
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-3 bg-green-500 text-black font-bold rounded-full hover:bg-green-400 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? t('submitting') : t('submit')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {songToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-black/40 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl max-w-sm w-full shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
            <h3 className="text-xl font-bold text-white mb-2">{t('deleteSong')}</h3>
            <p className="text-white/70 mb-6">
              {t('deleteConfirm', { title: songToDelete.title, artist: songToDelete.artist })}
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setSongToDelete(null)}
                className="px-4 py-2 rounded-full text-white hover:bg-white/10 transition"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={confirmDeleteSong}
                className="px-4 py-2 rounded-full bg-red-500/80 backdrop-blur-md text-white font-bold hover:bg-red-500 transition shadow-lg"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-black/40 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl max-w-sm w-full shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">{t('settings')}</h3>
              <button onClick={() => setShowSettings(false)} className="text-white/70 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-white">
                  <Languages size={20} className="text-white/70" />
                  <span>{t('language')}</span>
                </div>
                <button 
                  onClick={() => setLanguage(language === 'de' ? 'en' : 'de')}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 text-white px-4 py-2 rounded-full text-sm font-bold transition"
                >
                  {language === 'de' ? 'Deutsch' : 'English'}
                </button>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <div className="flex items-center gap-3 text-white">
                  <Upload size={20} className="text-white/70" />
                  <div className="flex flex-col">
                    <span>{t('submitSong')}</span>
                    <span className="text-xs text-white/50">{t('comingSoon')}</span>
                  </div>
                </div>
                <button 
                  disabled
                  className="flex items-center gap-2 bg-white/5 border border-white/5 text-white/30 px-4 py-2 rounded-full text-sm font-bold cursor-not-allowed"
                >
                  {t('submit')}
                </button>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setShowSettings(false)}
                className="px-6 py-2 rounded-full bg-white text-black font-bold hover:bg-white/90 transition shadow-lg"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
