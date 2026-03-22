import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './utils/firestoreErrorHandler';

const DUMMY_SONGS = [
  {
    id: 'song1',
    title: 'Lofi Chill',
    artist: 'VRifle Beats',
    driveId: '1v_9H6-0Q_1J9_9H6-0Q_1J9_9H6-0Q_1', // Replace with real public drive ID
    coverUrl: 'https://picsum.photos/seed/lofi/400/400',
    addedAt: new Date().toISOString()
  },
  {
    id: 'song2',
    title: 'Synthwave Night',
    artist: 'Neon Rider',
    driveId: '1v_9H6-0Q_1J9_9H6-0Q_1J9_9H6-0Q_2',
    coverUrl: 'https://picsum.photos/seed/synth/400/400',
    addedAt: new Date().toISOString()
  },
  {
    id: 'song3',
    title: 'Acoustic Sunrise',
    artist: 'Morning Wood',
    driveId: '1v_9H6-0Q_1J9_9H6-0Q_1J9_9H6-0Q_3',
    coverUrl: 'https://picsum.photos/seed/acoustic/400/400',
    addedAt: new Date().toISOString()
  }
];

export const seedDatabase = async () => {
  try {
    const songsSnap = await getDocs(collection(db, 'songs'));
    if (songsSnap.empty) {
      for (const song of DUMMY_SONGS) {
        await setDoc(doc(db, 'songs', song.id), song);
      }
    }
  } catch (error) {
    // Only throw if it's not a permission error or if we want to handle it
    if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.WRITE, 'songs');
    } else {
      console.error(error);
    }
  }
};
