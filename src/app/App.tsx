import { useState } from "react";
import { TopHeader } from "../components/header/TopHeader";
import { ChartContainer } from "../components/chart/ChartContainer";
import { PineEditorPanel } from "../components/editor/PineEditorPanel";
import { StatusBar } from "../components/common/StatusBar";
import "./app.css";

export function App() {
  const [pineEditorOpen, setPineEditorOpen] = useState(false);

  return (
    <div className="app-shell">
      <TopHeader
        pineEditorOpen={pineEditorOpen}
        onTogglePineEditor={() => setPineEditorOpen((v) => !v)}
      />
      <main className="app-main">
        <ChartContainer />
      </main>
      <PineEditorPanel
        open={pineEditorOpen}
        onClose={() => setPineEditorOpen(false)}
      />
      <StatusBar />
    </div>
  );
}
