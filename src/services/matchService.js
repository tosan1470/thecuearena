import { db } from "../firebase";
import {
  collection,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

export async function createMatch(uid) {
  const docRef = await addDoc(
    collection(db, "matches"),
    {
      player1: uid,
      player2: null,
      status: "waiting",
      turn: 1,
      scores: [0, 0],
      winner: null,
      balls: [],
      createdAt: serverTimestamp()
    }
  );

  return docRef.id;
}
