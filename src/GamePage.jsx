import React from "react";
import PoolGame from "./PoolGame";

export default function GamePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
      }}
    >
      <PoolGame />
    </div>
  );
}
