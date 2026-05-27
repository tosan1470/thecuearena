import React, { useState, useEffect, useRef } from "react";
import logo from "./assets/logo.png";
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
  const [isInGame, setIsInGame] = useState(false);
  const [username, setUsername] = useState(savedUsername);
  const [onlinePlayers, setOnlinePlayers] = useState(0);
  const [now, setNow]   = useState(Date.now());
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);

  const windowWidth = useWindowWidth();
  const isMobile    = windowWidth < 768;

  // Ref to the match snapshot unsubscribe fn — we cancel it before deleteDoc
  // so the snapshot never fires and overwrites our resolved match state.
  const matchUnsubRef = useRef(null);

  // Balance setter that keeps Firestore in sync
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

  // Auth state
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

  // Persist match history
  useEffect(() => {
    localStorage.setItem("matchHistory", JSON.stringify(matchHistory));
  }, [matchHistory]);

  // ---------------------------------------------------------------------------
  // onSnapshot for the current match.
  //
  // KEY FIX: when the doc is deleted (!docSnap.exists()), we must NOT reset
  // match state if it is already "finished" or "disputed". The winner calls
  // deleteDoc immediately after setting status:"finished", so the snapshot
  // fires and would overwrite the victory screen with null — showing "Defeat".
  //
  // We also use this listener to promote Player 1's match from "waiting" →
  // "playing" when an opponent joins, so the action buttons appear for them.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!match?.id) return;

    const matchRef = doc(db, "matches", match.id);
    const unsubscribe = onSnapshot(matchRef, (docSnap) => {
      if (!docSnap.exists()) {
        // Doc deleted — keep screen if already resolved, otherwise reset
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

      // If Firestore says the match is now "finished", resolve it here with
      // correct winnings — this is the path for the player who submitted
      // FIRST (pending state) and is waiting for the opponent to confirm.
      // The snapshot is how they learn the match resolved.
      if (data.status === "finished" && data.winner) {
        const iWon = data.winner === userId;
        const winnings = (data.bet ?? 0) * 2 * 0.9;

        // Unsubscribe immediately so nothing overwrites the result
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

      // Match still in progress — update normally
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

  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Live lobby
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

  // Auto-delete expired waiting matches
  useEffect(() => {
    if (!match?.id || match.status !== "waiting") return;
    if (match.expiresAt && match.expiresAt < now) {
      deleteDoc(doc(db, "matches", match.id)).catch(console.error);
      setMatch(null);
      setIsInGame(false);
    }
  }, [now, match]);

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
      });
      alert("Match created!");
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
      // Store full match data including player1 so result logic works correctly
      setMatch({
        id: matchId,
        bet: matchBet,
        status: "playing",
        player1: firestoreData.player1,
        player1Name: firestoreData.player1Name,
        player2: userId,
        player2Name: username || "Anonymous",
      });
      alert("Joined match! Game starting...");
    } catch (err) {
      console.error(err);
      alert(err.message || "Error joining match");
    }
  };

  // ---------------------------------------------------------------------------
  // Result submission — mutual confirmation required.
  //
  // The outcome object is built INSIDE the transaction so we always have the
  // correct winner/loser before the doc is deleted. We never re-read after the
  // transaction because the winner deletes the doc immediately and a subsequent
  // getDoc would return nothing.
  //
  // Only the WINNER calls deleteDoc. The loser just updates local state.
  // This prevents the race where the loser deletes first and the winner's
  // snapshot fires !exists before setMatch("finished") has rendered.
  // ---------------------------------------------------------------------------
  const handleSubmitResult = async (result) => {
    if (!match?.id) return;
    const matchRef = doc(db, "matches", match.id);
    let outcome = null;

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(matchRef);
        if (!snap.exists()) throw new Error("Match not found");
        const data = snap.data();

        // Derive opponent from Firestore — never from local state which may
        // be incomplete (e.g. Player 2's local state doesn't have player1).
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
          // "loss"
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
          // Cancel the snapshot listener BEFORE deleting the doc so it never
          // fires and overwrites our "finished" state with the Firestore doc
          // (which has no winnings field) or with null.
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
          // Cancel the listener so the winner's deleteDoc doesn't fire
          // !exists and accidentally reset the "Defeat" screen.
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
      });
      alert("Rematch created! Waiting for opponent...");
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
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      alert("Account created successfully!");
    } catch (error) {
      alert(error.message);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Login successful!");
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

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
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
        <div style={{ color: "#22c55e", fontWeight: "bold" }}>● LIVE</div>
        {user && (
          <button onClick={handleLogout}
            style={{ ...btnBase, background: "#ef4444", padding: "8px 16px", fontSize: "13px" }}>
            Logout
          </button>
        )}
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Derive playing state from match — true when both players are present
  // regardless of whether local state was set by create or join path
  const isPlaying =
    match?.status === "playing" &&
    match?.player1 &&
    match?.player2 &&
    match.player1 !== match.player2;

  return (
    <>
      <Header />

      {!user ? (
        <div style={{
          padding: isMobile ? "15px" : "30px", fontFamily: "Arial",
          background: "#0f172a", minHeight: "100vh", color: "white",
        }}>
          <h1 style={{
            fontSize: isMobile ? "32px" : "42px", fontWeight: "bold",
            color: "#38bdf8", marginBottom: "20px", textShadow: "0 0 20px #38bdf8",
          }}>
            thecuearena
          </h1>
          <div style={{ marginBottom: "10px" }}>
            <input type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: "10px" }}>
            <input type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: "15px" }}>
            <button onClick={handleSignUp}
              style={{ ...btnBase, background: "#22c55e", marginRight: "10px" }}>
              Sign Up
            </button>
            <button onClick={handleLogin}
              style={{ ...btnBase, background: "#38bdf8" }}>
              Login
            </button>
          </div>
        </div>

      ) : (
        <div style={{
          padding: isMobile ? "15px" : "30px", fontFamily: "Arial",
          background: "#0f172a", minHeight: "100vh", color: "white",
        }}>

          {/* Username */}
          <div style={{ marginBottom: "20px" }}>
            <input type="text" style={inputStyle} placeholder="Enter username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                localStorage.setItem("username", e.target.value);
              }}
            />
          </div>

          {/* Wallet */}
          <div style={{
            background: "#1e293b", padding: "20px", borderRadius: "15px",
            marginBottom: "20px", boxShadow: "0 0 15px rgba(56,189,248,0.3)",
          }}>
            <h2 style={{ color: "#38bdf8", margin: 0 }}>Wallet Balance</h2>
            <h1 style={{ marginTop: "10px", fontSize: isMobile ? "28px" : "36px" }}>
              {balance === null ? "Loading…" : `$${balance.toFixed(2)}`}
            </h1>
          </div>

          <button onClick={handleDeposit}
            style={{ ...glowBtn("#38bdf8", "56,189,248", false), marginRight: "10px", padding: "12px 20px" }}>
            Deposit $10
          </button>

          {/* Stats */}
          <div style={{
            marginTop: "15px", marginBottom: "20px",
            display: "flex", gap: "20px", flexWrap: "wrap",
          }}>
            <div style={{
              background: "#1e293b", padding: "12px 20px",
              borderRadius: "12px", border: "1px solid #334155",
            }}>
              🎮 Matches: {matches.length}
            </div>
            <div style={{
              background: "#1e293b", padding: "12px 20px",
              borderRadius: "12px", border: "1px solid #334155",
              color: "#22c55e", fontWeight: "bold",
            }}>
              ● LIVE PLAYERS: {onlinePlayers}
            </div>
          </div>

          {/* Create match */}
          <div style={{ marginTop: "20px" }}>
            <input type="number" style={inputStyle}
              placeholder="Enter bet ($1 min)" value={bet}
              onChange={(e) => setBet(e.target.value)}
            />
            <button onClick={handleCreateMatch} disabled={isInGame}
              style={{ ...glowBtn("#f59e0b", "245,158,11", isInGame), padding: "14px 24px", borderRadius: "12px", marginTop: "10px" }}>
              {isInGame ? "Already In Match" : "Create Match"}
            </button>
          </div>

          {/* Waiting */}
          {match?.status === "waiting" && (
            <div style={{ marginTop: "15px" }}>
              <p>Bet: ${match.bet} — Waiting for opponent…</p>
              <button onClick={handleCancelMatch}
                style={{ ...btnBase, background: "#ef4444", fontSize: "13px", padding: "8px 14px" }}>
                Cancel Match
              </button>
            </div>
          )}

          {/* Playing — uses derived isPlaying so it works for both creator and joiner */}
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

          {/* Finished */}
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

          {match?.status === "disputed" && (
            <div style={{
              marginTop: "15px", background: "#422006", border: "1px solid #f59e0b",
              padding: "15px", borderRadius: "12px",
            }}>
              <p style={{ color: "#fbbf24", margin: 0 }}>
                ⚠️ Match Disputed — Admin Review in Progress
              </p>
            </div>
          )}

          {/* Match History */}
          <div style={{
            marginTop: "20px", background: "#111827",
            padding: "15px", borderRadius: "12px",
          }}>
            <h3 style={{ color: "#22c55e" }}>📜 Match History</h3>
            {matchHistory.length === 0 ? (
              <p>No matches played yet</p>
            ) : (
              matchHistory.map((h, i) => (
                <div key={i} style={{
                  marginBottom: "8px",
                  color: h.result === "WIN" ? "#22c55e" : "#ef4444",
                }}>
                  {h.result === "WIN" ? "🏆" : "❌"} {h.result}{" "}
                  {h.result === "WIN" ? "+" : "-"}${h.amount.toFixed(2)}{" "}
                  ({h.date})
                </div>
              ))
            )}
          </div>

          {/* Available Matches */}
          <div style={{ marginTop: "20px" }}>
            <h3>Available Matches</h3>
            {matches.filter(
              (m) => m.status === "waiting" && m.player1 !== userId && m.expiresAt > now
            ).length === 0 ? (
              <p>No matches available</p>
            ) : (
              matches
                .filter(
                  (m) => m.status === "waiting" && m.player1 !== userId && m.expiresAt > now
                )
                .map((m) => (
                  <div key={m.id} style={{
                    background: "#1e293b", border: "1px solid #334155",
                    padding: "20px", marginBottom: "15px", borderRadius: "15px",
                    transition: "all 0.3s ease",
                  }}>
                    <p>Bet: ${m.bet}</p>
                    <p style={{ color: "#facc15", fontWeight: "bold", marginTop: "5px" }}>
                      ⏱ Expires in:{" "}
                      {String(Math.floor(Math.max(0, m.expiresAt - now) / 60000)).padStart(2, "0")}:
                      {String(Math.floor((Math.max(0, m.expiresAt - now) % 60000) / 1000)).padStart(2, "0")}
                    </p>
                    <div style={{
                      display: "inline-block", padding: "6px 12px",
                      borderRadius: "999px", background: "rgba(34,197,94,0.2)",
                      color: "#22c55e", fontWeight: "bold", marginBottom: "10px",
                      border: "1px solid #22c55e",
                    }}>
                      WAITING
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "10px" }}>
                      <div style={{
                        width: "45px", height: "45px", borderRadius: "50%",
                        background: "#22c55e", display: "flex", alignItems: "center",
                        justifyContent: "center", fontWeight: "bold", color: "white", fontSize: "18px",
                      }}>
                        {m.player1Name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ color: "#38bdf8", fontWeight: "bold", fontSize: "18px", margin: 0 }}>
                          {m.player1Name}
                        </p>
                        <small style={{ color: "#94a3b8" }}>Ready to Play</small>
                      </div>
                    </div>
                    <button onClick={() => handleJoinMatch(m.id, m.bet)}
                      disabled={isInGame}
                      style={{
                        ...glowBtn("#22c55e", "34,197,94", isInGame),
                        padding: "12px 20px", borderRadius: "10px",
                        marginTop: "10px", width: "100%",
                      }}>
                      {isInGame ? "In Match" : "Join Match"}
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
