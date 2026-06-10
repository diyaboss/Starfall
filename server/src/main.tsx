import React from "react";
import ReactDOM from "react-dom/client";
import { LobbyScreen } from "@/screens/LobbyScreen";
import { GameScreen } from "@/screens/GameScreen";
import { useSocketConnection } from "@/hooks/useSocket";
import { useGameStore, selectMyPlayer, selectPhase } from "@/store/gameStore";

function App(): React.ReactElement {
  useSocketConnection();

  const myPlayer = useGameStore(selectMyPlayer);
  const phase = useGameStore(selectPhase);

  if (!myPlayer || phase === "lobby" ) {
    return <LobbyScreen />;
  }

  return <GameScreen />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);