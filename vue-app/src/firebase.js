import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDoc, doc, setDoc, query, where, getDocs, orderBy } from "firebase/firestore";

// TODO: REMPLACER PAR VOS VRAIES CLÉS FIREBASE !
const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",
  authDomain: "votre-projet.firebaseapp.com",
  projectId: "votre-projet",
  storageBucket: "votre-projet.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

let app, auth, db;
let isFirebaseConfigured = false;

try {
  // Simple check to avoid crashing if config is default dummy
  if (firebaseConfig.apiKey !== "VOTRE_API_KEY") {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseConfigured = true;
  }
} catch (e) {
  console.error("Firebase initialization error", e);
}

const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  if (!isFirebaseConfigured) {
    alert("Firebase n'est pas configuré. Veuillez ajouter vos clés dans src/firebase.js.");
    return null;
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Erreur de connexion", error);
    throw error;
  }
};

export const logout = async () => {
  if (!isFirebaseConfigured) return;
  await signOut(auth);
};

export const onAuthChange = (callback) => {
  if (!isFirebaseConfigured) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

// Partager un quiz (Upload sur Firestore)
export const shareQuiz = async (quizData) => {
  if (!isFirebaseConfigured) throw new Error("Firebase non configuré.");
  
  try {
    const docRef = await addDoc(collection(db, "shared_quizzes"), {
      title: quizData.title || "Quiz Partagé",
      questions: quizData.questions,
      createdAt: new Date(),
      authorId: auth.currentUser ? auth.currentUser.uid : "anonymous",
      authorName: auth.currentUser ? auth.currentUser.displayName : "Anonyme"
    });
    return docRef.id;
  } catch (e) {
    console.error("Erreur partage quiz", e);
    throw e;
  }
};

// Récupérer un quiz partagé
export const getSharedQuiz = async (quizId) => {
  if (!isFirebaseConfigured) throw new Error("Firebase non configuré.");
  
  try {
    const docRef = doc(db, "shared_quizzes", quizId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      throw new Error("Quiz introuvable.");
    }
  } catch (e) {
    console.error("Erreur recupération quiz", e);
    throw e;
  }
};

// Enregistrer le score d'un utilisateur
export const saveUserScore = async (quizTitle, score, maxScore) => {
  if (!isFirebaseConfigured || !auth.currentUser) return;

  try {
    await addDoc(collection(db, "user_scores"), {
      userId: auth.currentUser.uid,
      quizTitle: quizTitle,
      score: score,
      maxScore: maxScore,
      date: new Date()
    });
  } catch (e) {
    console.error("Erreur sauvegarde score", e);
  }
};

// Récupérer l'historique des scores
export const getUserScores = async () => {
  if (!isFirebaseConfigured || !auth.currentUser) return [];

  try {
    const q = query(
      collection(db, "user_scores"), 
      where("userId", "==", auth.currentUser.uid),
      orderBy("date", "desc")
    );
    const querySnapshot = await getDocs(q);
    const scores = [];
    querySnapshot.forEach((doc) => {
      scores.push({ id: doc.id, ...doc.data() });
    });
    return scores;
  } catch (e) {
    console.error("Erreur récupération scores", e);
    return [];
  }
};

export { auth, db, isFirebaseConfigured };
