// contexts/AudioContext.tsx
import { createContext, useContext, useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';

interface Recording {
  id: string;
  uri: string;
  duration: number;
  title: string;
  createdAt: string;
  userId: string;
}

interface AudioContextType {
  recordings: Recording[];
  currentRecording: Audio.Recording | null;
  isRecording: boolean;
  currentSound: Audio.Sound | null;
  isPlaying: boolean;
  currentPlayingId: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  playRecording: (recordingId: string) => Promise<void>;
  stopPlaying: () => Promise<void>;
  deleteRecording: (recordingId: string) => Promise<void>;
  updateRecordingTitle: (recordingId: string, newTitle: string) => Promise<void>;
}

const AudioContext = createContext<AudioContextType | null>(null);

const RECORDINGS_STORAGE_KEY = 'audioRecordings';

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [currentRecording, setCurrentRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSound, setCurrentSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);

  // Load recordings on mount and when user changes
  useEffect(() => {
    if (user) {
      loadRecordings();
    }
  }, [user]);

  // Cleanup function
  useEffect(() => {
    return () => {
      if (currentRecording) {
        currentRecording.stopAndUnloadAsync();
      }
      if (currentSound) {
        currentSound.unloadAsync();
      }
    };
  }, []);

  const loadRecordings = async () => {
    try {
      const storedRecordings = await AsyncStorage.getItem(RECORDINGS_STORAGE_KEY);
      if (storedRecordings) {
        const parsedRecordings: Recording[] = JSON.parse(storedRecordings);
        // Filter recordings for current user
        setRecordings(parsedRecordings.filter(rec => rec.userId === user?.id));
      }
    } catch (error) {
      console.error('Error loading recordings:', error);
      Alert.alert('Error', 'Failed to load recordings');
    }
  };

  const saveRecordings = async (updatedRecordings: Recording[]) => {
    try {
      // Get all recordings for other users
      const storedRecordings = await AsyncStorage.getItem(RECORDINGS_STORAGE_KEY);
      let otherUserRecordings: Recording[] = [];
      if (storedRecordings) {
        const allRecordings: Recording[] = JSON.parse(storedRecordings);
        otherUserRecordings = allRecordings.filter(rec => rec.userId !== user?.id);
      }

      // Combine and save all recordings
      await AsyncStorage.setItem(
        RECORDINGS_STORAGE_KEY,
        JSON.stringify([...otherUserRecordings, ...updatedRecordings])
      );
    } catch (error) {
      console.error('Error saving recordings:', error);
      throw new Error('Failed to save recordings');
    }
  };

  const startRecording = async () => {
    try {
      // Request permissions
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please grant microphone access to record audio.');
        return;
      }

      // Configure audio
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await newRecording.startAsync();
      setCurrentRecording(newRecording);
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    try {
      if (!currentRecording || !user) return;

      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();
      if (!uri) throw new Error('No recording URI');

      // Get recording status for duration
      const status = await currentRecording.getStatusAsync();
      
      // Create new recording object
      const newRecording: Recording = {
        id: Date.now().toString(),
        uri,
        duration: status.durationMillis || 0,
        title: `Recording ${recordings.length + 1}`,
        createdAt: new Date().toISOString(),
        userId: user.id,
      };

      // Update recordings
      const updatedRecordings = [...recordings, newRecording];
      setRecordings(updatedRecordings);
      await saveRecordings(updatedRecordings);

      setCurrentRecording(null);
      setIsRecording(false);
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const playRecording = async (recordingId: string) => {
    try {
      // Stop current playback if any
      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
      }

      const recording = recordings.find(r => r.id === recordingId);
      if (!recording) throw new Error('Recording not found');

      const { sound } = await Audio.Sound.createAsync(
        { uri: recording.uri },
        { shouldPlay: true }
      );

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setIsPlaying(status.isPlaying);
          if (status.didJustFinish) {
            setCurrentPlayingId(null);
            setIsPlaying(false);
          }
        }
      });

      setCurrentSound(sound);
      setCurrentPlayingId(recordingId);
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing recording:', error);
      Alert.alert('Error', 'Failed to play recording');
    }
  };

  const stopPlaying = async () => {
    try {
      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        setCurrentSound(null);
        setCurrentPlayingId(null);
        setIsPlaying(false);
      }
    } catch (error) {
      console.error('Error stopping playback:', error);
      Alert.alert('Error', 'Failed to stop playback');
    }
  };

  const deleteRecording = async (recordingId: string) => {
    try {
      // Stop if currently playing
      if (currentPlayingId === recordingId) {
        await stopPlaying();
      }

      const recording = recordings.find(r => r.id === recordingId);
      if (!recording) return;

      // Delete file
      await FileSystem.deleteAsync(recording.uri, { idempotent: true });

      // Update recordings list
      const updatedRecordings = recordings.filter(r => r.id !== recordingId);
      setRecordings(updatedRecordings);
      await saveRecordings(updatedRecordings);
    } catch (error) {
      console.error('Error deleting recording:', error);
      Alert.alert('Error', 'Failed to delete recording');
    }
  };

  const updateRecordingTitle = async (recordingId: string, newTitle: string) => {
    try {
      const updatedRecordings = recordings.map(recording =>
        recording.id === recordingId
          ? { ...recording, title: newTitle }
          : recording
      );
      setRecordings(updatedRecordings);
      await saveRecordings(updatedRecordings);
    } catch (error) {
      console.error('Error updating recording title:', error);
      Alert.alert('Error', 'Failed to update recording title');
    }
  };

  return (
    <AudioContext.Provider
      value={{
        recordings,
        currentRecording,
        isRecording,
        currentSound,
        isPlaying,
        currentPlayingId,
        startRecording,
        stopRecording,
        playRecording,
        stopPlaying,
        deleteRecording,
        updateRecordingTitle,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};