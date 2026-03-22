import React from 'react';
import { usePlayer } from '../context/PlayerContext';
import { Play, Pause, SkipBack, SkipForward, Volume2, Repeat, Shuffle } from 'lucide-react';
import { getDirectImageUrl } from '../utils/imageUtils';

export const Player: React.FC = () => {
  const { currentSong, isPlaying, togglePlay, progress, duration, volume, setVolume, seek, error } = usePlayer();

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (!currentSong) return null;

  return (
    <div className="h-20 md:h-24 bg-black/30 backdrop-blur-2xl border-t border-white/10 flex items-center justify-between px-3 md:px-4 text-white relative z-20">
      {/* Mobile Progress Bar */}
      <div className="md:hidden absolute top-0 left-0 w-full h-1 bg-white/10">
        <div className="h-full bg-green-500" style={{ width: `${(progress / (duration || 1)) * 100}%` }}></div>
        <input 
          type="range" 
          min="0" 
          max={duration || 100} 
          value={progress} 
          onChange={(e) => seek(Number(e.target.value))}
          className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {/* Song Info */}
      <div className="flex items-center gap-3 md:gap-4 w-2/3 md:w-1/3 pr-2">
        <img 
          src={getDirectImageUrl(currentSong.coverUrl)} 
          alt={currentSong.title} 
          className="w-12 h-12 md:w-14 md:h-14 rounded-md object-cover object-center shadow-sm flex-shrink-0" 
          referrerPolicy="no-referrer"
        />
        <div className="overflow-hidden">
          <h4 className="text-sm font-semibold truncate">{currentSong.title}</h4>
          <p className="text-xs text-zinc-400 truncate">{currentSong.artist}</p>
          {error && (
            <div className="mt-1 hidden md:block">
              <p className="text-xs text-red-500 truncate">{error}</p>
              {error.includes('Link prüfen') && (
                <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
                  Tipp: Falls du im Vorschau-Fenster bist, öffne die App oben rechts in einem neuen Tab.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center justify-center w-1/3 md:w-1/3">
        <div className="flex items-center gap-4 md:gap-6 mb-0 md:mb-2">
          <button className="text-zinc-400 hover:text-white hidden md:block"><Shuffle size={20} /></button>
          <button className="text-zinc-400 hover:text-white hidden md:block"><SkipBack size={24} /></button>
          <button 
            onClick={togglePlay}
            className="w-10 h-10 md:w-8 md:h-8 flex items-center justify-center bg-white/20 backdrop-blur-md border border-white/20 text-white rounded-full hover:bg-white/30 hover:scale-105 transition-all flex-shrink-0 shadow-lg"
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
          </button>
          <button className="text-zinc-400 hover:text-white hidden md:block"><SkipForward size={24} /></button>
          <button className="text-zinc-400 hover:text-white hidden md:block"><Repeat size={20} /></button>
        </div>
        <div className="hidden md:flex items-center gap-2 w-full max-w-md">
          <span className="text-xs text-zinc-400 w-10 text-right">{formatTime(progress)}</span>
          <input 
            type="range" 
            min="0" 
            max={duration || 100} 
            value={progress} 
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white hover:accent-green-500"
          />
          <span className="text-xs text-zinc-400 w-10">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Extras */}
      <div className="hidden md:flex items-center justify-end gap-2 w-1/3">
        <Volume2 size={20} className="text-zinc-400" />
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          value={volume} 
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white hover:accent-green-500"
        />
      </div>
    </div>
  );
};
