import React, { useState, useEffect, useRef } from "react";
import logo from "./assets/logo.png";
import PoolGame from "./PoolGame";
import GamePage from "./GamePage";
import { Routes, Route } from "react-router-dom";

import {
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  deleteDoc,
  runTransaction,
  setDoc,
  getDoc
} from "firebase/firestore";
import { db, auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

const userId =
  localStorage.getItem("userId") ||
  Math.random().toString(36).substring(7);
localStorage.setItem("userId", userId);

const savedUsername = localStorage.getItem("username") || "";

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

async function fetchBalance(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) return snap.data().balance ?? 10;
  await setDoc(doc(db, "users", uid), { balance: 10 });
  return 10;
}

async function persistBalance(uid, newBalance) {
  await setDoc(doc(db, "users", uid), { balance: newBalance }, { merge: true });
}

export default function App() {
  const [bet, setBet]                   = useState("");
  const [balance, setBalanceState]      = useState(null);
  const [matches, setMatches]           = useState([]);
  const [match, setMatch]               = useState(null);
  const [matchHistory, setMatchHistory] = useState(
    JSON.parse(localStorage.getItem("matchHistory")) || []
  );
  const [isInGame, setIsInGame]     = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput]       = useState("");
  const chatBottomRef = useRef(null);
  const [username, setUsername] = useState(savedUsername);
  const [onlinePlayers, setOnlinePlayers] = useState(0);
  const [now, setNow]   = useState(Date.now());
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dob, setDob] = useState("");
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [agreedToS, setAgreedToS]       = useState(false);
  const [agreedPP, setAgreedPP]         = useState(false);
  const [modalContent, setModalContent] = useState(null);
  const [user, setUser] = useState(null);
  const [gameFinished, setGameFinished] = useState(false);
  const windowWidth = useWindowWidth();
  const isMobile    = windowWidth < 768;

  const matchUnsubRef = useRef(null);

  const setBalance = (updaterOrValue) => {
    setBalanceState((prev) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(prev ?? 0)
          : updaterOrValue;
      if (user?.uid) persistBalance(user.uid, next).catch(console.error);
      return next;
    });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const saved = await fetchBalance(firebaseUser.uid);
        setBalanceState(saved);
      } else {
        setBalanceState(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem("matchHistory", JSON.stringify(matchHistory));
  }, [matchHistory]);

  useEffect(() => {
    if (!match?.id) return;

    const matchRef = doc(db, "matches", match.id);
    const unsubscribe = onSnapshot(matchRef, (docSnap) => {
      if (!docSnap.exists()) {
        setMatch((current) => {
          if (current?.status === "finished" || current?.status === "disputed") {
            return current;
          }
          setIsInGame(false);
          return null;
        });
        return;
      }

      const data = docSnap.data();

      if (data.status === "finished" && data.winner) {
        const iWon = data.winner === userId;
        const winnings = (data.bet ?? 0) * 2 * 0.9;

        if (matchUnsubRef.current) {
          matchUnsubRef.current();
          matchUnsubRef.current = null;
        }

        if (iWon) {
          setBalance((prev) => prev + winnings);
          setMatchHistory((prev) => [
            { result: "WIN", amount: winnings, date: new Date().toLocaleTimeString() },
            ...prev,
          ]);
          setMatch({ status: "finished", winnings });
        } else {
          setMatchHistory((prev) => [
            { result: "LOSS", amount: data.bet, date: new Date().toLocaleTimeString() },
            ...prev,
          ]);
          setMatch({ status: "finished", winnings: 0 });
        }
        setIsInGame(false);
        return;
      }

      if (data.status === "disputed") {
        if (matchUnsubRef.current) {
          matchUnsubRef.current();
          matchUnsubRef.current = null;
        }
        setMatch((current) => ({ ...current, status: "disputed" }));
        setIsInGame(false);
        return;
      }

      setMatch((current) => {
        if (current?.status === "finished" || current?.status === "disputed") {
          return current;
        }
        return { id: docSnap.id, ...data };
      });
      setIsInGame(data.status === "playing" || data.status === "waiting");
    });

    matchUnsubRef.current = unsubscribe;
    return () => {
      unsubscribe();
      matchUnsubRef.current = null;
    };
  }, [match?.id]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "matches"), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMatches(list);
      const players = new Set();
      list.forEach((m) => {
        if (m.player1) players.add(m.player1);
        if (m.player2) players.add(m.player2);
      });
      setOnlinePlayers(players.size);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!match?.id || match.status !== "waiting") return;
    if (match.expiresAt && match.expiresAt < now) {
      deleteDoc(doc(db, "matches", match.id)).catch(console.error);
      setMatch(null);
      setIsInGame(false);
    }
  }, [now, match]);

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || !match?.id) return;
    setChatInput("");
    try {
      await addDoc(collection(db, "matches", match.id, "chat"), {
        text,
        senderId: userId,
        senderName: username || "Anonymous",
        createdAt: Date.now(),
      });
    } catch (err) {
      console.error("Chat error:", err);
    }
  };

  const handleDeposit = async () => {
    try {
      const response = await fetch(
        "https://thecuearena-backend.onrender.com/create-checkout-session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: 10, uid: user.uid }),
        }
      );
      const data = await response.json();
      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      alert("Could not reach payment server. Try again later.");
    }
  };

  const handleCreateMatch = async () => {
    const entryFee = parseFloat(bet);
    if (isNaN(entryFee) || entryFee < 1) {
      alert("Please enter a valid bet amount ($1 minimum)");
      return;
    }
    if ((balance ?? 0) < entryFee) {
      alert("Insufficient balance");
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "matches"), {
        bet: entryFee,
        status: "waiting",
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000 * 60 * 5,
        player1: userId,
        player1Name: username || "Anonymous",
        player2: null,
        winClaim: null,
      });
      setBalance((prev) => prev - entryFee);
      setMatch({
        id: docRef.id,
        bet: entryFee,
        status: "waiting",
        player1: userId,
        player1Name: username || "Anonymous",
        player2: null,
        expiresAt: Date.now() + 1000 * 60 * 5,
      });
    } catch (err) {
      console.error(err);
      alert("Error creating match");
    }
  };

  const handleJoinMatch = async (matchId, matchBet) => {
    if ((balance ?? 0) < matchBet) {
      alert("Insufficient balance");
      return;
    }
    try {
      const matchRef = doc(db, "matches", matchId);
      let firestoreData = null;

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(matchRef);
        if (!snap.exists())            throw new Error("Match no longer exists");
        const data = snap.data();
        if (data.status !== "waiting") throw new Error("Match is no longer available");
        if (data.player1 === userId)   throw new Error("You cannot join your own match");
        firestoreData = data;
        transaction.update(matchRef, {
          status: "playing",
          player2: userId,
          player2Name: username || "Anonymous",
        });
      });

      setBalance((prev) => prev - matchBet);
      setMatch({
        id: matchId,
        bet: matchBet,
        status: "playing",
        player1: firestoreData.player1,
        player1Name: firestoreData.player1Name,
        player2: userId,
        player2Name: username || "Anonymous",
      });
    } catch (err) {
      console.error(err);
      alert(err.message || "Error joining match");
    }
  };

  const handleSubmitResult = async (result) => {
    if (!match?.id) return;
    const matchRef = doc(db, "matches", match.id);
    let outcome = null;

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(matchRef);
        if (!snap.exists()) throw new Error("Match not found");
        const data = snap.data();

        const opponentId =
          data.player1 === userId ? data.player2 : data.player1;
        const existingClaim = data.winClaim ?? {};

        if (result === "win") {
          if (existingClaim[opponentId] === "win") {
            transaction.update(matchRef, { status: "disputed" });
            outcome = { status: "disputed", bet: data.bet };
          } else if (existingClaim[opponentId] === "loss") {
            transaction.update(matchRef, { status: "finished", winner: userId });
            outcome = { status: "finished", winner: userId, bet: data.bet };
          } else {
            transaction.update(matchRef, {
              winClaim: { ...existingClaim, [userId]: "win" },
            });
            outcome = { status: "pending" };
          }
        } else {
          if (existingClaim[opponentId] === "win") {
            transaction.update(matchRef, { status: "finished", winner: opponentId });
            outcome = { status: "finished", winner: opponentId, bet: data.bet };
          } else {
            transaction.update(matchRef, {
              winClaim: { ...existingClaim, [userId]: "loss" },
            });
            outcome = { status: "pending" };
          }
        }
      });

      if (outcome.status === "finished") {
        const iWon    = outcome.winner === userId;
        const winnings = (outcome.bet ?? 0) * 2 * 0.9;

        if (iWon) {
          setBalance((prev) => prev + winnings);
          setMatchHistory((prev) => [
            { result: "WIN", amount: winnings, date: new Date().toLocaleTimeString() },
            ...prev,
          ]);
          setMatch({ status: "finished", winnings });
          setIsInGame(false);
          if (matchUnsubRef.current) {
            matchUnsubRef.current();
            matchUnsubRef.current = null;
          }
          deleteDoc(matchRef).catch(console.error);
        } else {
          setMatchHistory((prev) => [
            { result: "LOSS", amount: outcome.bet, date: new Date().toLocaleTimeString() },
            ...prev,
          ]);
          setMatch({ status: "finished", winnings: 0 });
          setIsInGame(false);
          if (matchUnsubRef.current) {
            matchUnsubRef.current();
            matchUnsubRef.current = null;
          }
        }

      } else if (outcome.status === "disputed") {
        setMatch((m) => ({ ...m, status: "disputed" }));
        setIsInGame(false);
        alert("Both players claimed the win. The match has been flagged for admin review.");
      } else {
        alert(
          result === "win"
            ? "Win recorded. Waiting for opponent to confirm their result."
            : "Loss recorded. Waiting for opponent to confirm their result."
        );
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "Error submitting result");
    }
  };

  const handleRematch = async () => {
    const entryFee = 1;
    if ((balance ?? 0) < entryFee) {
      alert("Insufficient balance for rematch");
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "matches"), {
        bet: entryFee,
        status: "waiting",
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000 * 60 * 5,
        player1: userId,
        player1Name: username || "Anonymous",
        player2: null,
        winClaim: null,
      });
      setBalance((prev) => prev - entryFee);
      setMatch({
        id: docRef.id,
        bet: entryFee,
        status: "waiting",
        player1: userId,
        player1Name: username || "Anonymous",
        player2: null,
        expiresAt: Date.now() + 1000 * 60 * 5,
      });
    } catch (err) {
      console.error(err);
      alert("Error creating rematch");
    }
  };

  const handleDispute = async () => {
    if (!match?.id) return;
    try {
      await updateDoc(doc(db, "matches", match.id), { status: "disputed" });
      setMatch((m) => ({ ...m, status: "disputed" }));
      setIsInGame(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelMatch = async () => {
    if (!match?.id) return;
    try {
      await deleteDoc(doc(db, "matches", match.id));
      setBalance((prev) => prev + match.bet);
      setMatch(null);
      setIsInGame(false);
    } catch (err) {
      console.error(err);
      alert("Error cancelling match");
    }
  };

  const handleSignUp = async () => {
    if (!agreedToS) { alert("Please agree to the Terms of Service to continue."); return; }
    if (!agreedPP)  { alert("Please agree to the Privacy Policy to continue."); return; }
    if (password !== confirmPassword) { alert("Passwords do not match."); return; }
    if (password.length < 6) { alert("Password must be at least 6 characters."); return; }
    if (!dob) { alert("Please enter your date of birth."); return; }
    const dobDate = new Date(dob);
    const today = new Date();
    const age = today.getFullYear() - dobDate.getFullYear() -
      (today < new Date(today.getFullYear(), dobDate.getMonth(), dobDate.getDate()) ? 1 : 0);
    if (age < 18) { alert("You must be at least 18 years old to register."); return; }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", userCredential.user.uid), { dob, balance: 10 });
      alert("Account created successfully!");
      setIsSignUpMode(false);
      setConfirmPassword("");
      setDob("");
    } catch (error) {
      alert(error.message);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setBalanceState(null);
    setMatch(null);
    setIsInGame(false);
  };

  const inputStyle = {
    width: isMobile ? "100%" : "250px",
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid #334155",
    background: "#1e293b",
    color: "white",
    marginRight: "10px",
    boxSizing: "border-box",
  };

  const btnBase = {
    border: "none",
    padding: "10px 20px",
    borderRadius: "10px",
    color: "white",
    cursor: "pointer",
    fontWeight: "bold",
  };

  const glowBtn = (color, glowRgb, disabled) => ({
    ...btnBase,
    background: disabled ? "#475569" : color,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : `0 0 15px rgba(${glowRgb},0.5)`,
    transition: "all 0.3s ease",
  });

  const Header = () => (
    <div style={{
      width: "100%", padding: "15px 30px", background: "#111827",
      borderBottom: "1px solid #1e293b", display: "flex",
      justifyContent: "space-between", alignItems: "center",
      position: "sticky", top: 0, zIndex: 1000, boxSizing: "border-box",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <img src={logo} alt="thecuearena" style={{
          width: "55px", height: "55px", borderRadius: "12px",
          boxShadow: "0 0 15px rgba(234,179,8,0.6)",
        }} />
        <h2 style={{ color: "#38bdf8", margin: 0, textShadow: "0 0 10px #38bdf8" }}>
          thecuearena
        </h2>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ color: "#22c55e", fontWeight: "bold" }}>&#9679; LIVE</div>
        {user && (
          <button onClick={handleLogout}
            style={{ ...btnBase, background: "#ef4444", padding: "8px 16px", fontSize: "13px" }}>
            Logout
          </button>
        )}
      </div>
    </div>
  );

  // ── TRUE when both players are in and the game is live ───────────────────
  const isPlaying =
    match?.status === "playing" &&
    match?.player1 &&
    match?.player2 &&
    match.player1 !== match.player2;

  // ── DOOR TO THE POOL ROOM: render PoolGame when match is active ──────────
  if (user && isPlaying) {
    return (
      <>
        <Header />
        <PoolGame
          matchId={match.id}
          userId={userId}
          match={match}
          onSubmitResult={handleSubmitResult}
          onDispute={handleDispute}
        />
      </>
    );
  }

  // ── Everything else: lobby / waiting / finished screens ──────────────────
  return (
    <Routes>
      <Route
        path="/"
        element={
          <>
            <Header />

            {!user ? (
              /* ══ LOGIN / SIGN UP ══════════════════════════════════════════════════ */
              <div style={{
                padding: isMobile ? "15px" : "30px", fontFamily: "Arial",
                background: "#0f172a", minHeight: "100vh", color: "white",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ textAlign: "center", marginBottom: "30px" }}>
                  <img src={logo} alt="thecuearena" style={{
                    width: "80px", height: "80px", borderRadius: "16px",
                    boxShadow: "0 0 25px rgba(234,179,8,0.7)", marginBottom: "12px",
                  }} />
                  <h1 style={{
                    fontSize: isMobile ? "28px" : "36px", fontWeight: "bold",
                    color: "#38bdf8", margin: 0, textShadow: "0 0 20px #38bdf8",
                  }}>thecuearena</h1>
                </div>

                <div style={{
                  background: "#1e293b", borderRadius: "20px", padding: "30px",
                  width: isMobile ? "100%" : "400px", boxSizing: "border-box",
                  boxShadow: "0 0 30px rgba(56,189,248,0.2)", border: "1px solid #334155",
                }}>
                  {/* Tab toggle */}
                  <div style={{ display: "flex", marginBottom: "24px", borderRadius: "10px", overflow: "hidden", border: "1px solid #334155" }}>
                    <button onClick={() => setIsSignUpMode(false)} style={{
                      flex: 1, padding: "10px", border: "none", fontWeight: "bold", cursor: "pointer", fontSize: "14px", transition: "all 0.2s",
                      background: !isSignUpMode ? "#38bdf8" : "transparent", color: !isSignUpMode ? "white" : "#94a3b8",
                    }}>Login</button>
                    <button onClick={() => setIsSignUpMode(true)} style={{
                      flex: 1, padding: "10px", border: "none", fontWeight: "bold", cursor: "pointer", fontSize: "14px", transition: "all 0.2s",
                      background: isSignUpMode ? "#22c55e" : "transparent", color: isSignUpMode ? "white" : "#94a3b8",
                    }}>Sign Up</button>
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", color: "#94a3b8", fontSize: "12px", marginBottom: "5px" }}>EMAIL</label>
                    <input type="email" placeholder="you@example.com" value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{ ...inputStyle, width: "100%", marginRight: 0 }} />
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", color: "#94a3b8", fontSize: "12px", marginBottom: "5px" }}>PASSWORD</label>
                    <input type="password" placeholder="Min. 6 characters" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ ...inputStyle, width: "100%", marginRight: 0 }} />
                  </div>

                  {isSignUpMode && (
                    <>
                      <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", color: "#94a3b8", fontSize: "12px", marginBottom: "5px" }}>CONFIRM PASSWORD</label>
                        <input type="password" placeholder="Re-enter password" value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          style={{ ...inputStyle, width: "100%", marginRight: 0,
                            borderColor: confirmPassword && confirmPassword !== password ? "#ef4444" : "#334155" }} />
                        {confirmPassword && confirmPassword !== password && (
                          <p style={{ color: "#ef4444", fontSize: "11px", margin: "4px 0 0" }}>Passwords do not match</p>
                        )}
                        {confirmPassword && confirmPassword === password && (
                          <p style={{ color: "#22c55e", fontSize: "11px", margin: "4px 0 0" }}>&#10003; Passwords match</p>
                        )}
                      </div>

                      <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", color: "#94a3b8", fontSize: "12px", marginBottom: "5px" }}>
                          DATE OF BIRTH <span style={{ color: "#64748b" }}>(must be 18+)</span>
                        </label>
                        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)}
                          max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split("T")[0]}
                          style={{ ...inputStyle, width: "100%", marginRight: 0, colorScheme: "dark" }} />
                      </div>

                      <div style={{ marginBottom: "16px", marginTop: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                          <input type="checkbox" id="tos" checked={agreedToS} onChange={(e) => setAgreedToS(e.target.checked)}
                            style={{ width: "16px", height: "16px", accentColor: "#22c55e", cursor: "pointer", flexShrink: 0 }} />
                          <label htmlFor="tos" style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.4 }}>
                            I agree to the{" "}
                            <span onClick={() => setModalContent("tos")}
                              style={{ color: "#38bdf8", cursor: "pointer", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              Terms of Service
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                              </svg>
                            </span>
                          </label>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <input type="checkbox" id="pp" checked={agreedPP} onChange={(e) => setAgreedPP(e.target.checked)}
                            style={{ width: "16px", height: "16px", accentColor: "#22c55e", cursor: "pointer", flexShrink: 0 }} />
                          <label htmlFor="pp" style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.4 }}>
                            I agree to the{" "}
                            <span onClick={() => setModalContent("pp")}
                              style={{ color: "#38bdf8", cursor: "pointer", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              Privacy Policy
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                              </svg>
                            </span>
                          </label>
                        </div>
                      </div>
                    </>
                  )}

                  <button onClick={isSignUpMode ? handleSignUp : handleLogin} style={{
                    width: "100%", padding: "13px", borderRadius: "10px", border: "none",
                    fontWeight: "bold", fontSize: "15px", cursor: "pointer",
                    background: isSignUpMode ? "#22c55e" : "#38bdf8", color: "white", marginTop: "8px",
                    boxShadow: isSignUpMode ? "0 0 20px rgba(34,197,94,0.4)" : "0 0 20px rgba(56,189,248,0.4)",
                    transition: "all 0.2s",
                  }}>
                    {isSignUpMode ? "Create Account" : "Login"}
                  </button>

                  <p style={{ textAlign: "center", color: "#64748b", fontSize: "13px", marginTop: "16px", marginBottom: 0 }}>
                    {isSignUpMode
                      ? <>Already have an account?{" "}<span onClick={() => setIsSignUpMode(false)} style={{ color: "#38bdf8", cursor: "pointer" }}>Login</span></>
                      : <>New here?{" "}<span onClick={() => setIsSignUpMode(true)} style={{ color: "#22c55e", cursor: "pointer" }}>Create an account</span></>
                    }
                  </p>
                </div>
              </div>

            ) : (
              /* ══ LOBBY ═══════════════════════════════════════════════════════════ */
              <div style={{
                padding: isMobile ? "15px" : "30px", fontFamily: "Arial",
                background: "#0f172a", minHeight: "100vh", color: "white",
              }}>

                {/* Username */}
                <div style={{ marginBottom: "20px" }}>
                  <input type="text" style={inputStyle} placeholder="Enter username" value={username}
                    onChange={(e) => { setUsername(e.target.value); localStorage.setItem("username", e.target.value); }} />
                </div>

                {/* Wallet */}
                <div style={{
                  background: "#1e293b", padding: "20px", borderRadius: "15px",
                  marginBottom: "20px", boxShadow: "0 0 15px rgba(56,189,248,0.3)",
                }}>
                  <h2 style={{ color: "#38bdf8", margin: 0 }}>Wallet Balance</h2>
                  <h1 style={{ marginTop: "10px", fontSize: isMobile ? "28px" : "36px" }}>
                    {balance === null ? "Loading..." : `$${balance.toFixed(2)}`}
                  </h1>
                </div>

                <button onClick={handleDeposit}
                  style={{ ...glowBtn("#38bdf8", "56,189,248", false), marginRight: "10px", padding: "12px 20px" }}>
                  Deposit $10
                </button>

                {/* Stats */}
                <div style={{ marginTop: "15px", marginBottom: "20px", display: "flex", gap: "20px", flexWrap: "wrap" }}>
                  <div style={{ background: "#1e293b", padding: "12px 20px", borderRadius: "12px", border: "1px solid #334155" }}>
                    🎮 Matches: {matches.length}
                  </div>
                  <div style={{ background: "#1e293b", padding: "12px 20px", borderRadius: "12px", border: "1px solid #334155", color: "#22c55e", fontWeight: "bold" }}>
                    &#9679; LIVE PLAYERS: {onlinePlayers}
                  </div>
                </div>

                {/* Create match */}
                <div style={{ marginTop: "20px" }}>
                  <input type="number" style={inputStyle} placeholder="Enter bet ($1 min)" value={bet}
                    onChange={(e) => setBet(e.target.value)} />
                  <button onClick={handleCreateMatch} disabled={isInGame}
                    style={{ ...glowBtn("#f59e0b", "245,158,11", isInGame), padding: "14px 24px", borderRadius: "12px", marginTop: "10px" }}>
                    {isInGame ? "Already In Match" : "Create Match"}
                  </button>
                </div>

                {/* ── WAITING FOR OPPONENT ── */}
                {match?.status === "waiting" && (
                  <div style={{ marginTop: "15px" }}>
                    <p>Bet: ${match.bet} &mdash; Waiting for opponent...</p>
                    <button onClick={handleCancelMatch}
                      style={{ ...btnBase, background: "#ef4444", fontSize: "13px", padding: "8px 14px" }}>
                      Cancel Match
                    </button>
                  </div>
                )}

                {/* Playing */}
                {isPlaying && (
                  <div style={{ marginTop: "15px" }}>
                    <p style={{ marginBottom: "10px" }}>
                      Game in progress vs{" "}
                      <strong>
                        {match.player1 === userId ? match.player2Name : match.player1Name}
                      </strong>
                    </p>
                    <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "12px" }}>
                      Both players must confirm the result. If both claim a win, the match goes to admin review.
                    </p>
                    <button onClick={() => handleSubmitResult("win")}
                      style={{ ...glowBtn("#22c55e", "34,197,94", false), marginRight: "10px" }}>
                      I Won
                    </button>
                    <button onClick={() => handleSubmitResult("loss")}
                      style={{ ...glowBtn("#ef4444", "239,68,68", false), marginRight: "10px" }}>
                      I Lost
                    </button>
                    <button onClick={handleDispute}
                      style={{ ...glowBtn("#f59e0b", "245,158,11", false) }}>
                      Dispute
                    </button>
                  </div>
                )}

                {/* Match created / waiting card */}
                {match && match.status === "waiting" && (
                  <div style={{
                    marginTop: "24px", background: "#1e293b", borderRadius: "16px",
                    border: "1px solid #334155", padding: "24px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎱</div>
                    <h3 style={{ color: "#38bdf8", margin: "0 0 8px" }}>Match Created!</h3>
                    <p style={{ color: "#94a3b8", margin: "0 0 4px" }}>
                      Bet: <strong style={{ color: "white" }}>${match.bet}</strong>
                    </p>
                    <p style={{ color: "#94a3b8", margin: "0 0 16px" }}>Waiting for an opponent to join...</p>
                    <p style={{ color: "#facc15", fontWeight: "bold", marginBottom: "20px" }}>
                      ⏱ Expires in:{" "}
                      {String(Math.floor(Math.max(0, (match.expiresAt ?? 0) - now) / 60000)).padStart(2, "0")}:
                      {String(Math.floor((Math.max(0, (match.expiresAt ?? 0) - now) % 60000) / 1000)).padStart(2, "0")}
                    </p>
                    <button onClick={handleCancelMatch}
                      style={{ ...btnBase, background: "#ef4444", padding: "10px 20px" }}>
                      Cancel Match
                    </button>
                  </div>
                )}

                {/* ── FINISHED ── */}
                {match?.status === "finished" && (
                  <div style={{ marginTop: "15px" }}>
                    {(match.winnings ?? 0) > 0 ? (
                      <div style={{
                        background: "#14532d", border: "1px solid #22c55e",
                        padding: "20px", borderRadius: "15px", textAlign: "center",
                        boxShadow: "0 0 20px rgba(34,197,94,0.5)",
                      }}>
                        <h2 style={{ color: "#22c55e" }}>🏆 Victory!</h2>
                        <p>You won ${match.winnings.toFixed(2)}</p>
                      </div>
                    ) : (
                      <div style={{
                        background: "#450a0a", border: "1px solid #ef4444",
                        padding: "20px", borderRadius: "15px", textAlign: "center",
                      }}>
                        <h2 style={{ color: "#ef4444" }}>❌ Defeat</h2>
                        <p>Better luck next time.</p>
                      </div>
                    )}
                    <button onClick={handleRematch}
                      style={{ ...glowBtn("#f59e0b", "245,158,11", false), marginTop: "15px" }}>
                      Rematch ($1 Entry Fee)
                    </button>
                  </div>
                )}

                {match?.status === "completed" && (
                  <p style={{ marginTop: "15px" }}>Match Completed — Winner Paid</p>
                )}

                {/* ── DISPUTED ── */}
                {match?.status === "disputed" && (
                  <div style={{
                    marginTop: "15px", background: "#422006", border: "1px solid #f59e0b",
                    padding: "15px", borderRadius: "12px",
                  }}>
                    <p style={{ color: "#fbbf24", margin: 0 }}>⚠️ Match Disputed — Admin Review in Progress</p>
                  </div>
                )}

                {/* ── MATCH HISTORY ── */}
                <div style={{ marginTop: "20px", background: "#111827", padding: "15px", borderRadius: "12px" }}>
                  <h3 style={{ color: "#22c55e" }}>📜 Match History</h3>
                  {matchHistory.length === 0 ? (
                    <p>No matches played yet</p>
                  ) : (
                    matchHistory.map((h, i) => (
                      <div key={i} style={{ marginBottom: "8px", color: h.result === "WIN" ? "#22c55e" : "#ef4444" }}>
                        {h.result === "WIN" ? "🏆" : "❌"} {h.result}{" "}
                        {h.result === "WIN" ? "+" : "-"}${h.amount.toFixed(2)} ({h.date})
                      </div>
                    ))
                  )}
                </div>

                {/* ── AVAILABLE MATCHES ── */}
                <div style={{ marginTop: "20px" }}>
                  <h3>Available Matches</h3>
                  {matches.filter((m) => m.status === "waiting" && m.player1 !== userId && m.expiresAt > now).length === 0 ? (
                    <p>No matches available</p>
                  ) : (
                    matches
                      .filter((m) => m.status === "waiting" && m.player1 !== userId && m.expiresAt > now)
                      .map((m) => (
                        <div key={m.id} style={{
                          background: "#1e293b", border: "1px solid #334155",
                          padding: "20px", marginBottom: "15px", borderRadius: "15px",
                        }}>
                          <p>Bet: ${m.bet}</p>
                          <p style={{ color: "#facc15", fontWeight: "bold", marginTop: "5px" }}>
                            ⏱ Expires in:{" "}
                            {String(Math.floor(Math.max(0, m.expiresAt - now) / 60000)).padStart(2, "0")}:
                            {String(Math.floor((Math.max(0, m.expiresAt - now) % 60000) / 1000)).padStart(2, "0")}
                          </p>
                          <div style={{
                            display: "inline-block", padding: "6px 12px", borderRadius: "999px",
                            background: "rgba(34,197,94,0.2)", color: "#22c55e", fontWeight: "bold",
                            marginBottom: "10px", border: "1px solid #22c55e",
                          }}>WAITING</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "10px" }}>
                            <div style={{
                              width: "45px", height: "45px", borderRadius: "50%", background: "#22c55e",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: "bold", color: "white", fontSize: "18px",
                            }}>
                              {m.player1Name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p style={{ color: "#38bdf8", fontWeight: "bold", fontSize: "18px", margin: 0 }}>{m.player1Name}</p>
                              <small style={{ color: "#94a3b8" }}>Ready to Play</small>
                            </div>
                          </div>
                          <button onClick={() => handleJoinMatch(m.id, m.bet)} disabled={isInGame}
                            style={{ ...glowBtn("#22c55e", "34,197,94", isInGame), padding: "12px 20px", borderRadius: "10px", marginTop: "10px", width: "100%" }}>
                            {isInGame ? "In Match" : "Join Match"}
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}

            {/* ══ TERMS / PRIVACY MODAL ════════════════════════════════════════════ */}
            {modalContent && (
              <div onClick={() => setModalContent(null)} style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
                display: "flex", alignItems: "center", justifyContent: "center",
                zIndex: 9999, padding: "20px", boxSizing: "border-box",
              }}>
                <div onClick={(e) => e.stopPropagation()} style={{
                  background: "#1e293b", borderRadius: "16px", padding: "28px",
                  maxWidth: "500px", width: "100%", maxHeight: "80vh", overflowY: "auto",
                  border: "1px solid #334155", boxShadow: "0 0 40px rgba(56,189,248,0.2)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h2 style={{ margin: 0, color: "#38bdf8", fontSize: "18px" }}>
                      {modalContent === "tos" ? "Terms of Service" : "Privacy Policy"}
                    </h2>
                    <button onClick={() => setModalContent(null)} style={{
                      background: "transparent", border: "none", color: "#94a3b8",
                      cursor: "pointer", fontSize: "22px", lineHeight: 1, padding: "4px 8px",
                    }}>✕</button>
                  </div>

                  {modalContent === "tos" ? (
                    <div style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.7 }}>
                      <p><strong style={{ color: "white" }}>1. Acceptance of Terms</strong><br />By creating an account and using thecuearena, you agree to be bound by these Terms of Service.</p>
                      <p><strong style={{ color: "white" }}>2. Eligibility</strong><br />You must be at least 18 years of age to register and participate.</p>
                      <p><strong style={{ color: "white" }}>3. Fair Play</strong><br />All match results must be reported honestly. Fraudulent claims will result in account suspension and forfeiture of funds.</p>
                      <p><strong style={{ color: "white" }}>4. Wagers &amp; Fees</strong><br />A 10% platform fee is deducted from the total match pool. Entry fees are non-refundable once a match begins.</p>
                      <p><strong style={{ color: "white" }}>5. Disputes</strong><br />Disputed matches are reviewed by admins. Admin decisions are final.</p>
                      <p><strong style={{ color: "white" }}>6. Account Termination</strong><br />We reserve the right to suspend accounts that violate these terms or engage in fraudulent activity.</p>
                      <p><strong style={{ color: "white" }}>7. Changes to Terms</strong><br />These terms may be updated at any time. Continued use constitutes acceptance.</p>
                    </div>
                  ) : (
                    <div style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.7 }}>
                      <p><strong style={{ color: "white" }}>1. Information We Collect</strong><br />We collect your email, date of birth, username, match history, and wallet balance. Payments are processed securely by Stripe.</p>
                      <p><strong style={{ color: "white" }}>2. How We Use Your Information</strong><br />Your data is used solely to operate the platform.</p>
                      <p><strong style={{ color: "white" }}>3. Data Storage</strong><br />Your data is stored securely in Firebase. We do not sell or share your personal information.</p>
                      <p><strong style={{ color: "white" }}>4. Date of Birth</strong><br />Collected to verify the 18+ age requirement. Stored securely and not publicly visible.</p>
                      <p><strong style={{ color: "white" }}>5. Cookies &amp; Local Storage</strong><br />We use browser local storage for session and username preference. No third-party tracking cookies.</p>
                      <p><strong style={{ color: "white" }}>6. Your Rights</strong><br />You may request account deletion at any time. Data will be removed within 30 days.</p>
                      <p><strong style={{ color: "white" }}>7. Contact</strong><br />For privacy questions, contact us through the platform's support channel.</p>
                    </div>
                  )}

                  <button onClick={() => {
                    if (modalContent === "tos") setAgreedToS(true);
                    else setAgreedPP(true);
                    setModalContent(null);
                  }} style={{
                    width: "100%", marginTop: "20px", padding: "12px", borderRadius: "10px",
                    border: "none", fontWeight: "bold", fontSize: "14px", cursor: "pointer",
                    background: "#22c55e", color: "white", boxShadow: "0 0 15px rgba(34,197,94,0.4)",
                  }}>
                    I Agree
                  </button>
                </div>
              </div>
            )}
          </>
        }
      />
      <Route path="/game" element={<GamePage />} />
    </Routes>
  );
}
