import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "indiaportfolio-chikoo",
  appId: "1:75285110262:web:566e3a7999e63afe547bd7",
  storageBucket: "indiaportfolio-chikoo.firebasestorage.app",
  apiKey: "AIzaSyB8t5TVbmMZcZqYEWnHttCuoVTdRV9eRmA",
  authDomain: "indiaportfolio-chikoo.firebaseapp.com",
  messagingSenderId: "75285110262",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
