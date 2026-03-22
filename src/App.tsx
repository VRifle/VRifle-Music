import React, { useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { PlayerProvider } from './context/PlayerContext';
import { LanguageProvider } from './context/LanguageContext';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { Player } from './components/Player';
import { seedDatabase } from './seed';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const [showSubmissionModal, setShowSubmissionModal] = React.useState(false);
  const [currentView, setCurrentView] = React.useState<'home' | 'library' | 'liked'>('home');

  useEffect(() => {
    seedDatabase().catch(console.error);
  }, []);

  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <PlayerProvider>
            <div className="h-screen flex flex-col bg-liquid text-white font-sans overflow-hidden">
              <div className="flex-1 flex overflow-hidden">
                <Sidebar currentView={currentView} onViewChange={setCurrentView} />
                <MainContent 
                  currentView={currentView}
                  showSubmissionModal={showSubmissionModal} 
                  onCloseSubmissionModal={() => setShowSubmissionModal(false)} 
                />
              </div>
              <Player />
            </div>
          </PlayerProvider>
        </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
