import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBkmx2uYHpNxrmsOpdo0x_d7W1lmUrH2k4",
  authDomain: "livetvoxoo.firebaseapp.com",
  databaseURL: "https://livetvoxoo-default-rtdb.firebaseio.com",
  projectId: "livetvoxoo",
  storageBucket: "livetvoxoo.firebasestorage.app",
  messagingSenderId: "946966649680",
  appId: "1:946966649680:web:19d322b4bdb3f2b1f22a55",
  measurementId: "G-22SGNTB68V"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database and get a reference to the service
export const database = getDatabase(app);
