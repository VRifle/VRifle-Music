import React from 'react';
import { Home, Library, PlusSquare, Heart } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface SidebarProps {
  currentView: 'home' | 'library' | 'liked';
  onViewChange: (view: 'home' | 'library' | 'liked') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  const { t } = useLanguage();

  return (
    <div className="hidden md:flex w-64 bg-black/20 backdrop-blur-xl border-r border-white/10 h-full flex-col text-gray-300 p-6 z-20">
      <div className="text-2xl font-bold text-white mb-8 flex items-center gap-2">
        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(34,197,94,0.5)]">
          <span className="text-black text-sm">VR</span>
        </div>
        VRifle Music <span className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded-md ml-1 font-medium tracking-wider uppercase border border-white/10">Beta</span>
      </div>
      
      <nav className="space-y-2 mb-8">
        <button 
          onClick={() => onViewChange('home')} 
          className={`flex items-center gap-4 p-2 rounded-lg transition-all w-full text-left ${currentView === 'home' ? 'text-white bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}
        >
          <Home size={24} />
          <span className="font-semibold">{t('home')}</span>
        </button>
        <button 
          onClick={() => onViewChange('library')} 
          className={`flex items-center gap-4 p-2 rounded-lg transition-all w-full text-left ${currentView === 'library' ? 'text-white bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}
        >
          <Library size={24} />
          <span className="font-semibold">{t('library')}</span>
        </button>
      </nav>

      <div className="space-y-2 mb-6">
        <button className="flex items-center gap-4 hover:text-white hover:bg-white/5 p-2 rounded-lg transition-all w-full text-left">
          <PlusSquare size={24} className="text-gray-400" />
          <span className="font-semibold">{t('createPlaylist')}</span>
        </button>
        <button 
          onClick={() => onViewChange('liked')} 
          className={`flex items-center gap-4 p-2 rounded-lg transition-all w-full text-left ${currentView === 'liked' ? 'text-white bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}
        >
          <Heart size={24} className={currentView === 'liked' ? 'text-white' : 'text-gray-400'} />
          <span className="font-semibold">{t('likedSongs')}</span>
        </button>
      </div>

      <hr className="border-white/10 mb-4" />

      <div className="flex-1 overflow-y-auto space-y-2">
        {/* Playlists will go here */}
        <p className="text-sm text-gray-400">My Playlist #1</p>
        <p className="text-sm text-gray-400">Chill Vibes</p>
      </div>
    </div>
  );
};
