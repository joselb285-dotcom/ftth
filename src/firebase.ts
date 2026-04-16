import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyD6QyikRd81h1iyziQYJmj6x9mmyZ99EaM",
  authDomain: "ftth-gis.firebaseapp.com",
  projectId: "ftth-gis",
  storageBucket: "ftth-gis.firebasestorage.app",
  messagingSenderId: "686826427206",
  appId: "1:686826427206:web:3e533cef039a03cb168b47"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
