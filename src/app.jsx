import React, { useState, useEffect, createContext, useContext, useMemo, useRef } from 'react';
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/react";
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithCustomToken,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  query,
  where,
  serverTimestamp,
  getDocs,
  deleteDoc,
  addDoc,
  orderBy,
  runTransaction
} from 'firebase/firestore';

import userIcon from './assets/user-icon.png';
import lockIcon from './assets/lock-icon.png';
import chatIcon from './assets/chat-icon.png';
import emailIcon from './assets/email-icon.jpeg';
import friendIcon from './assets/friend-icon.png';

import ParticleBackground from './ParticleBackground';

// Constants
const APP_ID = 'chatconnect-app';

const AppContext = createContext(null);

const useAppContext = () => useContext(AppContext);

const AppProvider = ({ children }) => {
  const firebaseAppRef = useRef(null);

  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [currentUser, setCurrentUser] = useState(undefined);
  const [userId, setUserId] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [isFirebaseOffline, setIsFirebaseOffline] = useState(false);

  const [profile, setProfile] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [currentInviteCode, setCurrentInviteCode] = useState('');

//Firebase config
const firebaseConfig = useMemo(() => ({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}), []);

  const currentAppId = APP_ID;
  const initialAuthToken = null;

  // Generate random 6-character alphanumeric invite code
  const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  // Create a new room for the current user
  const createNewRoom = async () => {
    if (!db || !userId || !profile) return;
    
    try {
      console.log("AppProvider: Creating new room for user:", userId);
      const newRoomCode = generateInviteCode();
      console.log("AppProvider: Generated room code:", newRoomCode);
      
      // Room doc ID = invite code
      const newRoomRef = doc(db, `artifacts/${currentAppId}/rooms`, newRoomCode);
      
      await setDoc(newRoomRef, {
        code: newRoomCode,
        users: [userId],
        user_details: { [userId]: profile.username },
        createdAt: serverTimestamp()
      });
      
      console.log("AppProvider: Room created with code as ID:", newRoomCode);
      setCurrentInviteCode(newRoomCode);
    } catch (error) {
      console.error("AppProvider: Error creating new room:", error);
    }
  };
  

  // Join a room using invite code
  const joinRoom = async (inviteCode) => {
    if (!db || !userId || !profile) {
      return { success: false, message: 'App services not ready' };
    }
  
    try {
      const normalizedCode = inviteCode.trim().toUpperCase();
  
      if (currentInviteCode === normalizedCode) {
        return { success: false, message: "You can't join your own room code." };
      }
  
      const roomRef = doc(db, `artifacts/${currentAppId}/rooms`, normalizedCode);
  
      await runTransaction(db, async (transaction) => {
        const roomSnap = await transaction.get(roomRef);
        if (!roomSnap.exists()) throw new Error('Room not found');
  
        const roomData = roomSnap.data();
        if (roomData.users.length >= 2) throw new Error('Room is already full');
        if (roomData.users.includes(userId)) throw new Error('You are already in this room');
  
        // Prevent duplicate 1-on-1 rooms
        const existingRoomQuery = query(
          collection(db, `artifacts/${currentAppId}/rooms`),
          where("users", "array-contains", userId)
        );
        const existingRooms = await getDocs(existingRoomQuery);
        for (const existingRoom of existingRooms.docs) {
          const existingData = existingRoom.data();
          if (existingData.users.includes(roomData.users[0])) {
            throw new Error('You already have a room with this user');
          }
        }
  
        const updatedUsers = [...roomData.users, userId];
        const updatedUserDetails = { ...roomData.user_details, [userId]: profile.username };
        transaction.update(roomRef, {
          users: updatedUsers,
          user_details: updatedUserDetails
        });
      });
  
      return { success: true, message: 'Successfully joined room' };
    } catch (error) {
      console.error("AppProvider: Error joining room:", error);
      let errorMessage = 'Error joining room';
      if (error.message === 'Room is already full') errorMessage = 'Room is already full';
      if (error.message === 'You are already in this room') errorMessage = 'You are already in this room';
      if (error.message === 'You already have a room with this user') errorMessage = 'You already have a room with this user';
      if (error.message === 'Room not found') errorMessage = 'Invalid room code';
  
      return { success: false, message: errorMessage };
    }
  };
  
  

  // Delete a room
  const deleteRoom = async (roomId) => {
    if (!db || !userId) return false;
    
    try {
      // First, get the room to find its code
      const roomRef = doc(db, `artifacts/${currentAppId}/rooms`, roomId);
      const roomSnap = await getDoc(roomRef);
      
      if (roomSnap.exists()) {
        const roomData = roomSnap.data();
        
        // Delete the room code mapping if it exists
        if (roomData.code) {
          try {
            const codeRef = doc(db, `artifacts/${currentAppId}/roomCodes`, roomData.code);
            await deleteDoc(codeRef);
            console.log("AppProvider: Room code mapping deleted for code:", roomData.code);
          } catch (codeDeleteError) {
            console.warn("AppProvider: Could not delete room code mapping:", codeDeleteError);
          }
        }
      }
      
      // Delete the room document
      await deleteDoc(roomRef);
      console.log("AppProvider: Room deleted successfully");
      return true;
    } catch (error) {
      console.error("AppProvider: Error deleting room:", error);
      return false;
    }
  };

  // Create a new room for the original user after someone joins their room
  const createNewRoomForOriginalUser = async (originalUserId) => {
    if (!db || !originalUserId) return false;
    
    try {
      const newRoomCode = generateInviteCode();
      
      const newRoomRef = doc(collection(db, `artifacts/${currentAppId}/rooms`));
      const userProfileRef = doc(db, `artifacts/${currentAppId}/users/${originalUserId}/profile`, 'userProfile');
      const userProfileSnap = await getDoc(userProfileRef);
      if (!userProfileSnap.exists()) {
        console.error("Could not find profile for original user:", originalUserId);
        return { success: false, error: "Profile not found" };
      }
      const originalUsername = userProfileSnap.data().username;
      // Create the room document
      await setDoc(newRoomRef, {
        code: newRoomCode,
        users: [originalUserId],
        user_details: { [originalUserId]: originalUsername },
        createdAt: serverTimestamp()
      });
      
      // Create the roomCodes mapping document
      const roomCodeRef = doc(db, `artifacts/${currentAppId}/roomCodes`, newRoomCode);
      await setDoc(roomCodeRef, {
        roomId: newRoomRef.id,
        createdBy: originalUserId,
        createdAt: serverTimestamp()
      });
      
      console.log("AppProvider: New room code mapping created for original user with code:", newRoomCode);
      return { success: true, roomId: newRoomRef.id, code: newRoomCode };
    
    } catch (error) {
      console.error("AppProvider: Error creating new room for original user:", error);
      return { success: false, error };
    }
  };

  useEffect(() => {
    if (!firebaseAppRef.current) {
      try {
        const firebaseApp = initializeApp(firebaseConfig);
        firebaseAppRef.current = firebaseApp;

        const firestoreDb = getFirestore(firebaseApp);
        setDb(firestoreDb);
        const firebaseAuth = getAuth(firebaseApp);
        setAuth(firebaseAuth);

        const checkOnlineStatus = () => {
          setIsFirebaseOffline(!navigator.onLine);
        };
        window.addEventListener('online', checkOnlineStatus);
        window.addEventListener('offline', checkOnlineStatus);
        checkOnlineStatus();

        const authenticateUser = async () => {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            }
          } catch (error) {
            console.error("AppProvider: Initial Firebase authentication failed (authenticateUser fn):", error);
          }
        };
        authenticateUser();

      } catch (initError) {
        console.error("AppProvider: Error during Firebase initialization:", initError);
        setAuthReady(true);
        setLoading(false);
      }
    }
  }, [firebaseConfig]);

  useEffect(() => {
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        setUserId(user ? user.uid : null);
        setAuthReady(true);
        console.log("AppProvider: onAuthStateChanged fired. User UID:", user ? user.uid : 'null', "Email:", user ? user.email : 'null', "AuthReady:", true);
      });

      return () => {
        console.log("AppProvider: Cleaning up onAuthStateChanged listener.");
        unsubscribe();
      };
    }
  }, [auth]);

  useEffect(() => {
    console.log("AppProvider useEffect [LOADING STATE]: State Update - authReady:", authReady, "loading:", loading, "currentUser UID:", currentUser?.uid, "userId:", userId, "db instance:", !!db, "currentUser is undefined:", currentUser === undefined);
    if (authReady && currentUser !== undefined && db) {
      setLoading(false);
    } else {
      console.log("AppProvider: App still loading. Waiting for authReady, currentUser, and db.");
    }
  }, [authReady, currentUser, db, loading, userId]);

  useEffect(() => {
    let unsubscribeProfile;
    let unsubscribeRooms;

    if (db && userId !== undefined) {

      if (userId) {
        const userDocRef = doc(db, `artifacts/${currentAppId}/users/${userId}/profile`, 'userProfile');
        unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data());
          } else {
            console.warn("AppProvider: Profile document does not exist for userId:", userId);
            setProfile(null);
          }
        }, (error) => {
          console.error("AppProvider: Error fetching profile:", error);
          setProfile(null);
        });

        // Listen for rooms where the current user is a member
        const roomsRef = collection(db, `artifacts/${currentAppId}/rooms`);
        const roomsQuery = query(roomsRef, where("users", "array-contains", userId));
        unsubscribeRooms = onSnapshot(roomsQuery, (snapshot) => {
          const roomsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setRooms(roomsList);
          console.log("AppProvider: Rooms list updated:", roomsList);
          
          // Set current invite code from the user's own room (if exists)
          const userRoom = roomsList.find(room => room.users.length === 1 && room.users[0] === userId);
          if (userRoom) {
            setCurrentInviteCode(userRoom.code);
          } else {
            setCurrentInviteCode('');
          }
          
          // Check if the user's single-user room just became full (someone joined)
          const previousRooms = rooms;
          const previousSingleUserRoom = previousRooms.find(room => room.users.length === 1 && room.users[0] === userId);
          const currentSingleUserRoom = roomsList.find(room => room.users.length === 1 && room.users[0] === userId);
          
          if (previousSingleUserRoom && !currentSingleUserRoom && roomsList.length > 0) {
            // User's single-user room became full, create a new one for them
            console.log("AppProvider: User's room became full, creating new single-user room");
            createNewRoomForOriginalUser(userId);
          }
        }, (error) => {
          console.error("AppProvider: Error fetching rooms:", error);
        });
      } else {
        setProfile(null);
        setRooms([]);
        setCurrentInviteCode('');
      }
    }

    return () => {
      if (unsubscribeProfile) unsubscribeProfile();
      if (unsubscribeRooms) unsubscribeRooms();
    };
  }, [db, userId, currentAppId]);

  const contextValue = {
    app: firebaseAppRef.current,
    db,
    auth,
    currentUser,
    userId,
    loading,
    authReady,
    canvasAppId: currentAppId,
    profile,
    rooms,
    currentInviteCode,
    isFirebaseOffline,
    createNewRoom,
    joinRoom,
    deleteRoom,
    createNewRoomForOriginalUser
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

const AuthPage = ({ onAuthSuccess, onNavigateToForgotPassword, onSignupSuccess }) => {
  const { auth, db, authReady, canvasAppId, currentUser, isFirebaseOffline } = useAppContext();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (currentUser !== undefined && authReady) {
      if (currentUser) {
        console.log("AuthPage useEffect: User authenticated, triggering onAuthSuccess.");
        onAuthSuccess();
      } else {
        console.log("AuthPage useEffect: No current user after authReady, staying on auth page.");
      }
    }
  }, [currentUser, authReady, onAuthSuccess]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!authReady) {
      setMessage('Authentication services not ready. Please wait.');
      console.warn("AuthPage handleSubmit: Auth services not ready.");
      return;
    }
    if (isFirebaseOffline) {
      setMessage('You are offline. Please check your internet connection.');
      console.warn("AuthPage handleSubmit: Offline.");
      return;
    }
    setIsLoading(true);
    setMessage('');
    console.log("AuthPage: Submitting form. Is Login:", isLogin, "Username:", username, "Email (if signup):", email);

    if (!auth || !db) {
      setMessage('Firebase services not fully initialized. Please wait a moment and try again.');
      setIsLoading(false);
      console.error("AuthPage handleSubmit: Firebase auth or db not ready. Aborting.");
      return;
    }

    try {
      if (isLogin) {
        const usersRef = collection(db, `artifacts/${canvasAppId}/public/data/userProfiles`);
        const q = query(usersRef, where("username", "==", username));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setMessage('Username not found or incorrect password.');
          setIsLoading(false);
          console.log("AuthPage: Login failed - Username not found.");
          return;
        }

        const userData = querySnapshot.docs[0].data();
        const userEmail = userData.email;
        console.log("AuthPage: Found email for username:", userEmail);

        await signInWithEmailAndPassword(auth, userEmail, password);
        setMessage('Logged in successfully! Waiting for auth state to update...');
      } else {
        const usersRef = collection(db, `artifacts/${canvasAppId}/public/data/userProfiles`);
        const usernameQuery = query(usersRef, where("username", "==", username));
        const emailQuery = query(usersRef, where("email", "==", email));

        const [usernameSnapshot, emailSnapshot] = await Promise.all([
          getDocs(usernameQuery),
          getDocs(emailQuery)
        ]);

        if (!usernameSnapshot.empty) {
          setMessage('Username already taken.');
          setIsLoading(false);
          return;
        }
        if (!emailSnapshot.empty) {
          setMessage('Email already registered.');
          setIsLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        onSignupSuccess(email, username, uid);
        setMessage('Account created successfully! Waiting for profile setup...');
      }
    } catch (error) {
      console.error('AuthPage: Authentication/Firestore operation error:', error);
      let errorMessage = 'An unknown error occurred.';
      if (error.code) {
        switch (error.code) {
          case 'auth/invalid-email':
            errorMessage = 'Invalid email address format.';
            break;
          case 'auth/user-disabled':
            errorMessage = 'This user account has been disabled.';
            break;
          case 'auth/user-not-found':
            errorMessage = 'No user found with this email.';
            break;
          case 'auth/wrong-password':
            errorMessage = 'Incorrect password.';
            break;
          case 'auth/email-already-in-use':
            errorMessage = 'This email is already registered.';
            break;
          case 'auth/weak-password':
            errorMessage = 'Password should be at least 6 characters.';
            break;
          case 'auth/operation-not-allowed':
            errorMessage = 'Email/password sign-in is not enabled. Please check Firebase settings.';
            break;
          case 'permission-denied':
            errorMessage = 'Permission denied. Check Firestore Security Rules.';
            break;
          default:
            errorMessage = `Error: ${error.message}`;
            break;
        }
      }
      setMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <div className="w-full bg-zinc-900 bg-opacity-70 py-4 px-6 flex justify-center items-center shadow-lg relative z-10">
        <h1 className="title text-teal-400 mb-0">ChatConnect</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="login-box bg-zinc-800 p-8 rounded-xl shadow-2xl w-full max-w-md mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-6">
            {isLogin ? 'Login' : 'Create Account'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-zinc-200 text-sm font-semibold mb-2" htmlFor="email">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  className="w-full px-4 py-2 bg-zinc-700 border border-zinc-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition duration-200 text-white placeholder-zinc-400"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required={!isLogin}
                />
              </div>
            )}
            <div>
              <label className="block text-zinc-200 text-sm font-semibold mb-2" htmlFor="username">
                Username
              </label>
              <div className="relative">
                <img src={userIcon} alt="User Icon" className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 opacity-70" />
                <input
                  type="text"
                  id="username"
                  className="w-full pl-10 pr-4 py-2 bg-zinc-700 border border-zinc-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition duration-200 text-white placeholder-zinc-400"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-zinc-200 text-sm font-semibold mb-2" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <img src={lockIcon} alt="Lock Icon" className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 opacity-70" />
                <input
                  type="password"
                  id="password"
                  className="w-full pl-10 pr-4 py-2 bg-zinc-700 border border-zinc-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition duration-200 text-white placeholder-zinc-400"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 transition duration-300 shadow-md transform hover:scale-105 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-zinc-800"
              disabled={isLoading || !authReady || isFirebaseOffline}
            >
              {isLoading ? 'Processing...' : (isLogin ? 'Login' : 'Create Account')}
            </button>
          </form>
          <p className="mt-6 text-center text-zinc-400">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-teal-400 hover:text-teal-300 font-semibold transition duration-200 focus:outline-none"
            >
              {isLogin ? 'Create Account' : 'Login'}
            </button>
          </p>
          {isLogin && (
            <button
              onClick={onNavigateToForgotPassword}
              className="text-teal-500 hover:text-teal-400 text-sm mt-2 text-center w-full transition duration-200 focus:outline-none"
            >
              Forgot password?
            </button>
          )}
          {message && (
            <div className="mt-4 p-3 text-sm text-center text-yellow-300 bg-yellow-800 border border-yellow-700 rounded-lg">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ForgotPasswordPage = ({ onNavigateToAuth }) => {
  const { auth, authReady, isFirebaseOffline } = useAppContext();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!authReady) {
      setMessage('Authentication services not ready. Please wait.');
      console.warn("ForgotPasswordPage: Auth services not ready.");
      return;
    }
    if (isFirebaseOffline) {
      setMessage('You are offline. Please check your internet connection.');
      console.warn("ForgotPasswordPage: Offline.");
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      if (!auth) {
        console.error("ForgotPasswordPage: Auth instance is null. Cannot send reset email.");
        setMessage('Authentication service not available. Please try again.');
        setIsLoading(false);
        return;
      }
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset link sent to your email. Please check your inbox.');
      setEmail('');
    } catch (error) {
      console.error('ForgotPasswordPage: Password reset error:', error);
      let errorMessage = 'Failed to send reset email. Please check the email address.';
      if (error.code) {
        switch (error.code) {
          case 'auth/invalid-email':
            errorMessage = 'Invalid email address format.';
            break;
          case 'auth/user-not-found':
            errorMessage = 'No user found with this email.';
            break;
          default:
            errorMessage = `Error: ${error.message}`;
            break;
        }
      }
      setMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <div className="w-full bg-zinc-900 bg-opacity-70 py-4 px-6 flex justify-center items-center shadow-lg relative z-10">
        <h1 className="title text-teal-400 mb-0">ChatConnect</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="login-box bg-zinc-800 p-8 rounded-xl shadow-2xl w-full max-w-md mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-6">
            Forgot Password
          </h2>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-zinc-200 text-sm font-semibold mb-2" htmlFor="reset-email">
                Enter your Email
              </label>
              <div className="relative">
                <img src={emailIcon} alt="Email Icon" className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 opacity-70" />
                <input
                  type="email"
                  id="reset-email"
                  className="w-full pl-10 pr-4 py-2 bg-zinc-700 border border-zinc-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition duration-200 text-white placeholder-zinc-400"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 transition duration-300 shadow-md transform hover:scale-105 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-zinc-800"
              disabled={isLoading || !authReady || isFirebaseOffline}
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
          <button
            onClick={onNavigateToAuth}
            className="text-teal-400 hover:text-teal-300 font-semibold mt-4 text-center w-full transition duration-200 focus:outline-none"
            >
            Back to Login
          </button>
          {message && (
            <div className="mt-4 p-3 text-sm text-center text-yellow-300 bg-yellow-800 border border-yellow-700 rounded-lg">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const RoomsListPage = ({ onOpenChat, onBackToDashboard, onDeleteRoom }) => {
  const { rooms, profile } = useAppContext();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmMessage, setConfirmMessage] = useState('');

  const handleDeleteClick = (roomId, otherUserDisplayName) => {
    console.log("RoomsListPage: Delete button clicked for room with:", otherUserDisplayName);
    setShowConfirmModal(true);
    setConfirmMessage(`Are you sure you want to delete the room with ${otherUserDisplayName}? This action cannot be undone.`);
    setConfirmAction(() => async () => {
      await onDeleteRoom(roomId);
      setShowConfirmModal(false);
    });
  };

  const handleConfirm = () => {
    if (confirmAction) {
      confirmAction();
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirmModal(false);
    setConfirmAction(null);
  };

  // Get other user's display name for a room
const getOtherUserDisplayName = (room) => {
  if (!room.users) return 'Unknown User';
  if (room.users.length === 1) return 'Waiting for someone to join...';
  
  // Find the other user's ID (the one that is NOT the current logged-in user)
  const otherUserId = room.users.find(uid => uid !== profile?.userId);
  if (!otherUserId) return 'Another User';
  
  // Read the username from the user_details map
  return room.user_details?.[otherUserId] || 'Unknown User';
};

  return (
    <div className="min-h-screen relative flex flex-col">
      <div className="w-full bg-zinc-900 bg-opacity-70 py-4 px-6 flex justify-between items-center shadow-lg relative z-10">
        <h1 className="title text-teal-400 mb-0">ChatConnect</h1>
        <button
          onClick={onBackToDashboard}
          className="bg-zinc-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-zinc-700 transition duration-300 shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          Back to Dashboard
        </button>
      </div>

      <div className="flex-1 p-4 relative z-10 max-w-4xl w-full mx-auto">
        <div className="bg-zinc-800 p-8 rounded-xl shadow-xl text-zinc-100">
          <h2 className="text-3xl font-bold text-white mb-6">Your Rooms</h2>
          {rooms.length === 0 ? (
            <p className="text-zinc-300">You don't have any rooms yet. Create one or join one from the dashboard!</p>
          ) : (
            <ul className="space-y-3">
              {rooms.map(room => {
                const otherUserDisplayName = getOtherUserDisplayName(room);
                return (
                  <li
                    key={room.id}
                    className="flex items-center justify-between bg-zinc-700 p-4 rounded-lg"
                  >
                    <span
                      className="text-lg font-semibold text-teal-300 cursor-pointer hover:text-teal-200 transition duration-200"
                      onClick={() => {
                        onOpenChat(room.id, otherUserDisplayName);
                      }}
                    >
                      {otherUserDisplayName}
                    </span>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          onOpenChat(room.id, otherUserDisplayName);
                        }}
                        className="bg-teal-600 text-white px-4 py-2 rounded-md text-sm hover:bg-teal-700 transition focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        Chat
                      </button>
                      <button
                        onClick={() => handleDeleteClick(room.id, otherUserDisplayName)}
                        className="bg-red-600 text-white px-4 py-2 rounded-md text-sm hover:bg-red-700 transition focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        Delete Room
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-800 rounded-xl shadow-2xl p-6 w-full max-w-sm text-center text-zinc-100">
            <h3 className="text-xl font-bold text-white mb-4">Confirm Deletion</h3>
            <p className="text-zinc-300 mb-6">{confirmMessage}</p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={handleConfirm}
                className="bg-red-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-red-700 transition duration-300 shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-zinc-800"
              >
                Yes, Delete
              </button>
              <button
                onClick={handleCancelConfirm}
                className="bg-zinc-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-zinc-700 transition duration-300 shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ChatSpace = ({ roomId, otherUserDisplayName, onBackToRooms }) => {
  const { db, userId, profile, canvasAppId, isFirebaseOffline, rooms } = useAppContext();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);
  
  // Get the current room to check if it has 2 users
  const currentRoom = rooms.find(room => room.id === roomId);
  const canChat = currentRoom && currentRoom.users && currentRoom.users.length === 2;

  useEffect(() => {
    if (!db || !roomId) {
      console.warn("ChatSpace useEffect: Skipping message listener setup due to missing DB or roomId.");
      return;
    }

    const messagesRef = collection(db, `artifacts/${canvasAppId}/directMessages/${roomId}/messages`);
    const q = query(messagesRef, orderBy("timestamp"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    }, (error) => {
      console.error("ChatSpace: Error fetching messages:", error);
    });

    return () => {
      unsubscribe();
    };
  }, [db, roomId, canvasAppId]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleNewMessageChange = (e) => {
    setNewMessage(e.target.value);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!newMessage.trim() || !db || !userId || !profile || !roomId) {
      console.warn("ChatSpace: Message not sent: Missing data or invalid state.", {
        newMessage: newMessage.trim(),
        db: db,
        userId: userId,
        profile: profile,
        roomId: roomId
      });
      return;
    }
    if (isFirebaseOffline) {
      console.warn("ChatSpace: Message not sent: Offline.");
      return;
    }

    try {
      const messagesRef = collection(db, `artifacts/${canvasAppId}/directMessages/${roomId}/messages`);
      await addDoc(messagesRef, {
        senderId: userId,
        senderUsername: profile.username,
        text: newMessage.trim(),
        timestamp: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      console.error("ChatSpace: Error sending message:", error);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <div className="w-full bg-zinc-900 bg-opacity-70 py-4 px-6 flex justify-between items-center shadow-lg relative z-10">
        <h1 className="title text-teal-400 mb-0">ChatConnect</h1>
        <button
          onClick={onBackToRooms}
          className="bg-zinc-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-zinc-700 transition duration-300 shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          Back to Rooms
        </button>
      </div>

      <div className="flex-1 p-4 relative z-10 max-w-4xl w-full mx-auto flex flex-col">
        <div className="bg-zinc-800 p-6 rounded-xl shadow-xl flex-1 flex flex-col overflow-hidden">
          <h2 className="text-2xl font-bold text-white mb-4">Chat with {otherUserDisplayName}</h2>

          {!canChat ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-zinc-400 text-lg mb-2">Waiting for someone to join...</p>
                <p className="text-zinc-500 text-sm">The chat will be available once the room is full</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {messages.length === 0 ? (
                  <p className="text-zinc-400 text-center mt-10">Say hello to start the conversation!</p>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.senderId === userId ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] p-3 rounded-lg shadow-md ${
                            msg.senderId === userId
                              ? 'bg-teal-600 text-white rounded-br-none'
                              : 'bg-zinc-700 text-zinc-100 rounded-bl-none'
                          }`}
                        >
                          <p className="font-semibold text-sm mb-1">
                            {msg.senderId === userId ? 'You' : msg.senderUsername}
                          </p>
                          <p className="text-base">{msg.text}</p>
                          <p className="text-xs text-right opacity-70 mt-1">
                            {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <form onSubmit={handleSendMessage} className="mt-4 flex gap-2">
                <div className="relative flex-1">
                  <img src={chatIcon} alt="Chat Icon" className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 opacity-70" />
                  <input
                    type="text"
                    value={newMessage}
                    onChange={handleNewMessageChange}
                    placeholder="Type your message..."
                    className="w-full pl-10 pr-4 py-2 bg-zinc-700 border border-zinc-600 rounded-lg focus:ring-2 focus:ring-teal-500 text-white placeholder-zinc-400"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-teal-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-teal-700 transition duration-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-zinc-800"
                  disabled={isFirebaseOffline}
                >
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const FAQsPage = ({ onBackToDashboard }) => {
  const faqs = [
    {
      question: "How do I create a room?",
      answer: "From your Dashboard, click on 'Create New Room'. This will generate a unique 6-character room code that you can share with someone to invite them to join."
    },
    {
      question: "How do I join a room?",
      answer: "From your Dashboard, click on 'Join Room' and enter the 6-character room code that was shared with you. Currently, only 2 users can join a room at a time."
    },
    {
      question: "How do I start a chat?",
      answer: "Once you're in a room with another person, go to your 'Rooms List' and click 'Chat' next to the room. The chat will only be available when the room has 2 users."
    },
    {
      question: "Can I reset my account password?",
      answer: "Password functionality is not yet available inside the app's UI. Please log-out then click on 'Forgot Password' to reset it via an email link!"
    }
  ];

  return (
    <div className="min-h-screen relative flex flex-col">
      <div className="w-full bg-zinc-900 bg-opacity-70 py-4 px-6 flex justify-between items-center shadow-lg relative z-10">
        <h1 className="title text-teal-400 mb-0">ChatConnect</h1>
        <button
          onClick={onBackToDashboard}
          className="bg-zinc-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-zinc-700 transition duration-300 shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          Back to Dashboard
        </button>
      </div>

      <div className="flex-1 p-4 relative z-10 max-w-4xl w-full mx-auto">
        <div className="bg-zinc-800 p-8 rounded-xl shadow-xl text-zinc-100">
          <h2 className="text-3xl font-bold text-white mb-6">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-zinc-700 p-5 rounded-lg border border-zinc-600">
                <h3 className="text-xl font-semibold text-teal-300 mb-2">{faq.question}</h3>
                <p className="text-zinc-200">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};




const Dashboard = ({ handleNavigateToRooms, handleNavigateToFAQs }) => {
  const { auth, userId, loading: appLoading, profile, rooms, currentInviteCode, isFirebaseOffline, createNewRoom, joinRoom } = useAppContext();
  const [dashboardError, setDashboardError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [showChatroomComingSoon, setShowChatroomComingSoon] = useState(false);

  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinRoomMessage, setJoinRoomMessage] = useState('');
  const [showJoinRoomModal, setShowJoinRoomModal] = useState(false);

  useEffect(() => {
    if (profile !== undefined) {
      if (profile === null && userId) {
        setDashboardError("User profile not found. Please ensure you've created an account.");
      } else {
        setDashboardError(null);
      }
    }
  }, [profile, userId]);

  const handleLogout = async () => {
    setShowConfirmModal(true);
    setConfirmMessage('Are you sure you want to log out?');
    setConfirmAction(() => async () => {
      try {
        if (!auth) {
          console.error("Dashboard: Auth instance is null. Cannot log out.");
          return;
        }
        await signOut(auth);
      } catch (error) {
        console.error('Dashboard: Logout error:', error);
      } finally {
        setShowConfirmModal(false);
      }
    });
  };

  const handleConfirm = () => {
    if (confirmAction) {
      confirmAction();
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirmModal(false);
    setConfirmAction(null);
  };

    const handleJoinRoom = async () => {
    if (!roomCodeInput.trim()) {
      setJoinRoomMessage('Please enter a room code.');
      return;
    }

    // Normalize the input (uppercase and trim)
    const normalizedCode = roomCodeInput.trim().toUpperCase();

    const result = await joinRoom(normalizedCode);
    if (result.success) {
      setJoinRoomMessage(result.message);
      setRoomCodeInput('');
      setShowJoinRoomModal(false);
    } else {
      setJoinRoomMessage(result.message);
    }
  };

  const handleCreateNewRoom = async () => {
    await createNewRoom();
  };

  // Get other user's display name for a room
const getOtherUserDisplayName = (room) => {
  if (!room.users) return 'Unknown User';
  if (room.users.length === 1) return 'Waiting for someone to join...';
  
  // Find the other user's ID (the one that is NOT the current logged-in user)
  const otherUserId = room.users.find(uid => uid !== profile?.userId);
  if (!otherUserId) return 'Another User';
  
  // Read the username from the user_details map we added
  return room.user_details?.[otherUserId] || 'Unknown User';
};

  if (appLoading || profile === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-zinc-800 p-8 rounded-xl shadow-lg text-center">
          <p className="text-xl font-semibold text-zinc-200">Loading application data...</p>
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-teal-500 mx-auto mt-4"></div>
        </div>
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-zinc-800 p-8 rounded-xl shadow-lg text-center">
          <p className="text-xl font-semibold text-red-400">Error:</p>
          <p className="text-zinc-200 mt-2">{dashboardError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-zinc-800"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  if (!profile && userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-zinc-800 p-8 rounded-xl shadow-lg text-center">
          <p className="text-xl font-semibold text-zinc-200">User profile not found.</p>
          <p className="text-zinc-400 mt-2">Please ensure you've created an account and try logging in again.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-zinc-800"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex flex-col">
      <div className="w-full bg-zinc-900 bg-opacity-70 py-4 px-6 flex justify-between items-center shadow-lg mb-6 relative z-10">
        <h1 className="title text-teal-400 mb-0">ChatConnect</h1>
        <button
          onClick={handleLogout}
          className="bg-red-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-red-700 transition duration-300 shadow-md transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          Logout
        </button>
      </div>

      {isFirebaseOffline && (
        <div className="w-full bg-yellow-800 text-yellow-200 text-center py-2 text-sm relative z-20">
          You are currently offline. Some features may not work.
        </div>
      )}

      <div className="bg-zinc-800 p-8 rounded-xl shadow-xl w-full max-w-4xl mb-6 flex-1 text-zinc-100 relative z-10 mx-auto">
        <h2 className="text-3xl font-bold text-white mb-6">
          Welcome, {profile?.username}!
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-teal-950 p-4 rounded-lg border border-teal-800">
            <h3 className="text-xl font-semibold text-teal-200 mb-2">Rooms List ({rooms.length})</h3>
            {rooms.length === 0 ? (
              <p className="text-zinc-300">You don't have any rooms yet. Create one or join one!</p>
            ) : (
              <ul className="list-disc list-inside text-zinc-300">
                {rooms.map(room => (
                  <li key={room.id} className="py-1">
                    {getOtherUserDisplayName(room)}
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={handleNavigateToRooms}
              className="mt-3 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-teal-950"
            >
              View Rooms
            </button>
          </div>

          <div className="bg-purple-950 p-4 rounded-lg border border-purple-800 flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-semibold text-purple-200 mb-2">Join Room</h3>
              <p className="text-zinc-300 mb-3">Enter a room code to join an existing room.</p>
            </div>
            <button
              onClick={() => {
                setShowJoinRoomModal(true);
              }}
              className="mt-3 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-purple-950 self-start"
            >
              Join Room
            </button>
          </div>

          <div className="bg-blue-950 p-4 rounded-lg border border-blue-800">
            <h3 className="text-xl font-semibold text-blue-200 mb-2">Create New Room</h3>
            <p className="text-zinc-300">Create a new room and get an invite code to share.</p>
            <button
              onClick={handleCreateNewRoom}
              className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-blue-950"
            >
              Create Room
            </button>
          </div>

          {currentInviteCode && (
            <div className="bg-green-950 p-4 rounded-lg border border-green-800">
              <h3 className="text-xl font-semibold text-green-200 mb-2">Your Invite Code</h3>
              <p className="text-zinc-300 mb-2">Share this code with someone to invite them to your room:</p>
              <div className="bg-green-900 p-3 rounded-lg text-center">
                <code className="text-2xl font-mono text-green-300">{currentInviteCode}</code>
              </div>
            </div>
          )}

          <div className="bg-amber-950 p-4 rounded-lg border border-amber-800">
            <h3 className="text-xl font-semibold text-amber-200 mb-2">FAQs</h3>
            <p className="text-zinc-300">Find answers to common questions about ChatConnect.</p>
            <button
              onClick={handleNavigateToFAQs}
              className="mt-3 bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-amber-950"
            >
              Read FAQs
            </button>
          </div>
        </div>
      </div>

      {showChatroomComingSoon && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-800 rounded-xl shadow-2xl p-6 w-full max-w-sm text-center text-zinc-100">
            <h3 className="text-xl font-bold text-white mb-4">Feature Coming Soon!</h3>
            <p className="text-zinc-300 mb-6">Chatroom functionality is under development. Stay tuned!</p>
            <button
              onClick={() => setShowChatroomComingSoon(false)}
              className="bg-teal-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-teal-700 transition duration-300 shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-zinc-800"
            >
              Got It!
            </button>
          </div>
        </div>
      )}

      {showJoinRoomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-800 rounded-xl shadow-2xl p-6 w-full max-w-md text-zinc-100">
            <h3 className="text-2xl font-bold text-white mb-4">Join Room</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-zinc-200 text-sm font-semibold mb-2" htmlFor="room-code">
                  Room Code
                </label>
                <div className="relative">
                  <img src={friendIcon} alt="Friend Icon" className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 opacity-70" />
                  <input
                    type="text"
                    id="room-code"
                    className="w-full pl-10 pr-4 py-2 bg-zinc-700 border border-zinc-600 rounded-lg focus:ring-2 focus:ring-purple-500 text-white placeholder-zinc-400"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value)}
                    placeholder="Enter 6-character room code"
                    maxLength={6}
                  />
                </div>
              </div>
              {joinRoomMessage && (
                <p className={`text-sm text-center ${joinRoomMessage.includes('Successfully') ? 'text-green-400' : 'text-yellow-400'}`}>
                  {joinRoomMessage}
                </p>
              )}
              <div className="flex space-x-3">
                <button
                  onClick={handleJoinRoom}
                  className="flex-1 bg-purple-600 text-white py-2 rounded-lg font-semibold hover:bg-purple-700 transition disabled:opacity-50"
                  disabled={isFirebaseOffline}
                >
                  Join Room
                </button>
                <button
                  onClick={() => {
                    setShowJoinRoomModal(false);
                    setRoomCodeInput('');
                    setJoinRoomMessage('');
                  }}
                  className="flex-1 bg-zinc-600 text-white py-2 rounded-lg font-semibold hover:bg-zinc-700 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-800 rounded-xl shadow-2xl p-6 w-full max-w-sm text-center text-zinc-100">
            <h3 className="text-xl font-bold text-white mb-4">Confirm Action</h3>
            <p className="text-zinc-300 mb-6">{confirmMessage}</p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={handleConfirm}
                className="bg-red-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-red-700 transition duration-300 shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-zinc-800"
              >
                Yes
              </button>
              <button
                onClick={handleCancelConfirm}
                className="bg-zinc-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-zinc-700 transition duration-300 shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-800"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const App = () => {
  const { currentUser, loading, authReady, db, canvasAppId, deleteRoom } = useAppContext();
  const [currentPage, setCurrentPage] = useState('auth');
  const [pendingSignupData, setPendingSignupData] = useState(null);
  const [selectedRoomForChat, setSelectedRoomForChat] = useState(null);

  const handleNavigateToRooms = () => {
    setCurrentPage('roomsList');
  };

  const handleNavigateToChat = (roomId, otherUserDisplayName) => {
    console.log("App: Navigating to Chat Space with room:", roomId, "other user:", otherUserDisplayName);
    setSelectedRoomForChat({ id: roomId, displayName: otherUserDisplayName });
    setCurrentPage('chatSpace');
  };

  const handleBackToRooms = () => {
    console.log("App: Navigating back to Rooms List.");
    setSelectedRoomForChat(null);
    setCurrentPage('roomsList');
  };

  const handleNavigateToFAQs = () => {
    console.log("App: Navigating to FAQs page.");
    setCurrentPage('faq');
  };

  const handleBackToDashboard = () => {
    console.log("App: Navigating back to Dashboard.");
    setCurrentPage('dashboard');
  };

  const handleDeleteRoom = async (roomId) => {
    if (!deleteRoom) {
      console.error("App handleDeleteRoom: deleteRoom function not available.");
      return;
    }

    try {
      const success = await deleteRoom(roomId);
      if (success) {
        console.log("App: Room deleted successfully.");
        // If currently in the chat for this room, go back to rooms list
        if (selectedRoomForChat && selectedRoomForChat.id === roomId) {
          setSelectedRoomForChat(null);
          setCurrentPage('roomsList');
        }
      } else {
        console.error("App: Failed to delete room.");
      }
    } catch (error) {
      console.error("App handleDeleteRoom: Error during room deletion:", error);
    }
  };

  useEffect(() => {

    if (!loading && authReady && currentUser !== undefined && db && canvasAppId) {
      if (currentUser) {
        const handleUserAuthenticated = async () => {
          const privateProfileRef = doc(db, `artifacts/${canvasAppId}/users/${currentUser.uid}/profile`, 'userProfile');
          const publicProfileRef = doc(db, `artifacts/${canvasAppId}/public/data/userProfiles`, currentUser.uid);

          try {
            const privateDocSnap = await getDoc(privateProfileRef);

            if (privateDocSnap.exists() && privateDocSnap.data().username && privateDocSnap.data().email) {
              setCurrentPage('dashboard');
              setPendingSignupData(null);
            } else {
              console.warn("App: Authenticated user has incomplete profile or profile not found. Attempting to create/complete profile.");
              if (pendingSignupData && currentUser.uid === pendingSignupData.tempUserId) {
                await setDoc(privateProfileRef, {
                  username: pendingSignupData.username.trim(),
                  email: pendingSignupData.email.trim(),
                  createdAt: serverTimestamp(),
                  userId: currentUser.uid
                });
                await setDoc(publicProfileRef, {
                  username: pendingSignupData.username.trim(),
                  email: pendingSignupData.email.trim(),
                  userId: currentUser.uid
                });
                setPendingSignupData(null);
                setCurrentPage('dashboard');
              } else {
                console.warn("App: Authenticated user has no profile and no pending signup data or mismatch. Navigating to auth page.");
                setCurrentPage('auth');
              }
            }
          } catch (error) {
            console.error("App: Error checking/creating profile:", error);
            setCurrentPage('auth');
          }
        };
        handleUserAuthenticated();
      } else {
        setCurrentPage('auth');
        setPendingSignupData(null);
      }
    }
  }, [currentUser, loading, authReady, db, canvasAppId, pendingSignupData]);

  const handleSignupSuccess = (email, username, uid) => {
    console.log("App: handleSignupSuccess called with email:", email, "username:", username, "uid:", uid);
    setPendingSignupData({ email, username, tempUserId: uid });
  };

  const handleAuthSuccess = () => {
    console.log("App: handleAuthSuccess called, useEffect will manage navigation.");
  };

  const handleNavigateToForgotPassword = () => {
    console.log("App: Navigating to Forgot Password page.");
    setCurrentPage('forgotPassword');
  };

  const handleNavigateToAuth = () => {
    console.log("App: Navigating to Auth page.");
    setCurrentPage('auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-teal-500 mx-auto"></div>
          <p className="mt-4 text-lg text-zinc-200">Loading application...</p>
        </div>
      </div>
    );
  }

  switch (currentPage) {
    case 'auth':
      return <AuthPage onAuthSuccess={handleAuthSuccess} onNavigateToForgotPassword={handleNavigateToForgotPassword} onSignupSuccess={handleSignupSuccess} />;
    case 'forgotPassword':
      return <ForgotPasswordPage onNavigateToAuth={handleNavigateToAuth} />;
    case 'dashboard':
      return <Dashboard handleNavigateToRooms={handleNavigateToRooms} handleNavigateToFAQs={handleNavigateToFAQs} />;
    case 'roomsList':
      return <RoomsListPage onOpenChat={handleNavigateToChat} onBackToDashboard={handleBackToDashboard} onDeleteRoom={handleDeleteRoom} />;
    case 'chatSpace':
      return <ChatSpace roomId={selectedRoomForChat?.id} otherUserDisplayName={selectedRoomForChat?.displayName} onBackToRooms={handleBackToRooms} />;
    case 'faq':
      return <FAQsPage onBackToDashboard={handleBackToDashboard} />;
    default:
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <p className="text-xl text-zinc-200">Something went wrong. Please refresh.</p>
        </div>
      );
  }
};

export default function AppWrapper() {
  return (
    <>
      <ParticleBackground />

      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>
        {`
        body {
          font-family: 'Inter', sans-serif;
        }
        .relative input {
          padding-left: 2.5rem !important;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #27272a;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4b5563;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
        `}
      </style>
      <AppProvider>
        <App />
      </AppProvider>
      <Analytics />
      <SpeedInsights />
      <footer className="w-full bg-zinc-900 bg-opacity-70 py-4 px-6 text-center text-zinc-400 text-sm shadow-inner mt-auto relative z-10">
        <p>© {new Date().getFullYear()} Aryan Kotwal. All Rights Reserved.</p>
        <div className="flex justify-center space-x-4 mt-2">
          <a href="https://www.linkedin.com/in/aryankotwal" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-blue-400 transition duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.044-1.852-3.044-1.853 0-2.136 1.445-2.136 2.943v5.67H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.062 2.062 0 012.063-2.065 2.063 2.063 0 012.064 2.065 2.062 2.062 0 01-2.064 2.065zm-.012 13.012H3.25V9h2.075v11.445zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.454C23.203 24 24 23.227 24 22.271V1.729C24 .774 23.203 0 22.225 0z"></path>
            </svg>
          </a>
          <a href="mailto:kotwal.aryan01@gmail.com" className="text-zinc-400 hover:text-red-400 transition duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 
                2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 
                4l-8 5-8-5V6l8 5 8-5v2z"/>
            </svg>
          </a>
          <a href="https://github.com/AryanKo" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 .5C5.73.5.5 5.73.5 12c0 
             5.1 3.29 9.41 7.86 10.94.58.11.79-.25.79-.55 
             0-.27-.01-1.16-.02-2.1-3.2.7-3.87-1.54-3.87-1.54-.53-1.35-1.3-1.71-1.3-1.71-1.07-.73.08-.72.08-.72 
             1.18.08 1.8 1.21 1.8 1.21 1.05 1.8 2.76 1.28 
             3.43.98.11-.76.41-1.28.74-1.58-2.56-.29-5.26-1.28-5.26-5.7 
             0-1.26.45-2.28 1.2-3.09-.12-.29-.52-1.45.11-3.02 
             0 0 .98-.31 3.2 1.18a11.2 11.2 0 0 1 5.82 0c2.22-1.49 3.2-1.18 
             3.2-1.18.63 1.57.23 2.73.11 3.02.75.81 1.2 1.83 
             1.2 3.09 0 4.43-2.7 5.41-5.28 5.69.42.37.8 1.1.8 2.22 
             0 1.6-.02 2.89-.02 3.28 0 .3.21.66.8.55A10.99 10.99 
             0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/>
          </svg>
          </a>
        </div>
      </footer>
    </>
  );
}
