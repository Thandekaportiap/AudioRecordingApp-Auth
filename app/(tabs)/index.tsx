import React, { useState, useEffect } from 'react';
import { 
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library'; // Permissions update
import * as Permissions from 'expo-permissions'; // For permissions
import { askAsync } from 'expo-permissions';

const AudioRecorderApp = () => {
  const [recording, setRecording] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [sound, setSound] = useState(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [permissionResponse, setPermissionResponse] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(null);


  useEffect(() => {
    loadRecordings();
    requestPermission(); // Request permission when the app loads
    return () => {
      if (recording) {
        stopRecording();
      }
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);



  const loadRecordings = async () => {
    try {
      const storedRecordings = await AsyncStorage.getItem('recordings');
      if (storedRecordings) {
        setRecordings(JSON.parse(storedRecordings));
      }
    } catch (error) {
      console.error('Error loading recordings:', error);
    }
  };

  const saveRecordings = async (updatedRecordings) => {
    try {
      await AsyncStorage.setItem('recordings', JSON.stringify(updatedRecordings));
    } catch (error) {
      console.error('Error saving recordings:', error);
    }
  };

  async function requestPermission() {
    const { status } = await Audio.requestPermissionsAsync();  // Correct permission request for audio recording
    if (status !== 'granted') {
      alert('Permission to access microphone is required!');
    }
  }
  
  async function startRecording() {
    try {
      const permissionResponse = await Audio.requestPermissionsAsync();  // Request permission here
      
      if (permissionResponse.status !== 'granted') {
        console.log('Permission to access microphone was denied!');
        await requestPermission();
        return;
      }
      
      // Set audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
  
      console.log('Starting recording...');
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
      console.log('Recording started');
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  async function stopRecording() {
    console.log('Stopping recording...');
    if (recording) {
      setRecording(undefined);
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      const uri = recording.getURI();
      const newRecording = {
        id: Date.now().toString(),
        date: new Date().toLocaleString(),
        uri,
      };
      setRecordings(prevRecordings => {
        const updatedRecordings = [...prevRecordings, newRecording];
        saveRecordings(updatedRecordings);
        return updatedRecordings;
      });
    }
    setIsRecording(false);
  }

  const playRecording = async (uri, id) => {
    try {
      if (currentlyPlaying) {
        await currentlyPlaying.stopAsync();
        await currentlyPlaying.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync({ uri });
      setSound(newSound);
      setCurrentlyPlaying(newSound);
      
      await newSound.playAsync();
      newSound.setOnPlaybackStatusUpdate(status => {
        if (status.didJustFinish) {
          setCurrentlyPlaying(null);
        }
      });
    } catch (error) {
      console.error('Error playing recording:', error);
      Alert.alert('Error', 'Failed to play recording');
    }
  };

  const deleteRecording = async (id) => {
    Alert.alert(
      'Delete Recording',
      'Are you sure you want to delete this recording?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updatedRecordings = recordings.filter(recording => recording.id !== id);
            setRecordings(updatedRecordings);
            await saveRecordings(updatedRecordings);
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={styles.recordingItem}>
      <View style={styles.recordingInfo}>
        <Text style={styles.recordingDate}>{item.date}</Text>
      </View>
      <View style={styles.recordingControls}>
        <TouchableOpacity
          onPress={() => playRecording(item.uri, item.id)}
          style={styles.controlButton}
        >
          <MaterialIcons name="play-arrow" size={24} color="#007AFF" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => deleteRecording(item.id)}
          style={styles.controlButton}
        >
          <MaterialIcons name="delete" size={24} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Audio Recorder</Text>
      </View>

      <FlatList
        data={recordings}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        style={styles.list}
        ListEmptyComponent={() => (
          <Text style={styles.emptyText}>No recordings yet</Text>
        )}
      />

      <TouchableOpacity
        style={[styles.recordButton, isRecording && styles.recordingButton]}
        onPress={isRecording ? stopRecording : startRecording}
      >
        <MaterialIcons
          name={isRecording ? 'stop' : 'mic'}
          size={32}
          color="white"
        />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#cde0ff',
    padding: 26,
  },
  header: {
    padding: 26,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    alignSelf: 'center',
  },
  list: {
    flex: 1,
    padding: 16,
  },
  recordingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recordingInfo: {
    flex: 1,
  },
  recordingDate: {
    fontSize: 16,
    color: '#1C1C1E',
  },
  recordingControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlButton: {
    padding: 8,
    marginLeft: 8,
  },
  recordButton: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  recordingButton: {
    backgroundColor: '#FF3B30',
  },
  emptyText: {
    textAlign: 'center',
    color: 'red',
    fontSize: 22,
    marginTop: 32,
  },
});

export default AudioRecorderApp;
