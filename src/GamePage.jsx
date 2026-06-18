import PoolGame from "./PoolGame";

export default function GamePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        padding: "20px",
      }}
    >
      <h1 style={{ color: "white", textAlign: "center" }}>
        Pool Game
      </h1>

      <PoolGame />
    </div>
  );
}