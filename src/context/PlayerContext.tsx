import React, { createContext, useContext, useState, useRef, useEffect } from 'react';

export interface Song {
  id: string;
  title: string;
  artist: string;
  driveId: string; // Keeping for backward compatibility
  audioUrl?: string; // New field for Dropbox or direct links
  coverUrl: string;
  duration?: number;
}

interface PlayerContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  error: string | null;
  playSong: (song: Song) => void;
  togglePlay: () => void;
  setVolume: (vol: number) => void;
  seek: (time: number) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    const updateProgress = () => setProgress(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    const handleError = (e: Event) => {
      console.error("Audio playback error:", e);
      setError("Fehler beim Abspielen. Bitte prüfe, ob die Google Drive Datei für 'Jeder, der über den Link verfügt' freigegeben ist.");
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current && currentSong) {
      setError(null);
      
      let newSrc = '';
      
      // Check if we have a new audioUrl (like Dropbox) or fallback to old driveId
      const sourceUrl = currentSong.audioUrl || currentSong.driveId || '';
      
      if (sourceUrl.includes('dropbox.com')) {
        // Convert Dropbox share link to direct download link
        // e.g. https://www.dropbox.com/s/xyz/song.mp3?dl=0 -> https://dl.dropboxusercontent.com/s/xyz/song.mp3
        newSrc = sourceUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
      } else if (sourceUrl.includes('drive.google.com') || currentSong.driveId) {
        // Fallback to Google Drive logic for older songs
        const match = sourceUrl.match(/[-\w]{25,}/);
        const actualDriveId = match ? match[0] : sourceUrl;
        newSrc = `https://docs.google.com/uc?export=download&id=${actualDriveId}&confirm=t`;
      } else {
        newSrc = sourceUrl; // Direct URL
      }
      
      if (!audioRef.current.src.includes(newSrc) && audioRef.current.src !== newSrc) {
        audioRef.current.src = newSrc;
        audioRef.current.load();
      }
    }
  }, [currentSong]);

  useEffect(() => {
    if (audioRef.current && currentSong) {
      if (isPlaying) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            console.error("Play error:", e);
            if (e.name === 'NotAllowedError') {
              setError("Autoplay blockiert. Bitte klicke manuell auf Play.");
            } else {
              setError(`Fehler: ${e.message}. Link prüfen!`);
            }
            setIsPlaying(false);
          });
        }
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentSong]);

  const playSong = (song: Song) => {
    if (currentSong?.id === song.id) {
      setIsPlaying(true);
      return;
    }
    setCurrentSong(song);
    setIsPlaying(true);
  };

  const togglePlay = () => {
    if (!currentSong) return;
    setIsPlaying(!isPlaying);
  };

  const setVolume = (vol: number) => {
    setVolumeState(vol);
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  };

  return (
    <PlayerContext.Provider value={{ currentSong, isPlaying, volume, progress, duration, error, playSong, togglePlay, setVolume, seek }}>
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within PlayerProvider');
  return context;
};
