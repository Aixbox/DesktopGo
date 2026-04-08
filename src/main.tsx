import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { initTheme } from "./lib/theme";
import { initWindowStyle } from "./lib/windowStyle";

void initTheme().catch((e) => {
  console.error("Failed to initialize theme:", e);
});

void initWindowStyle().catch((e) => {
  console.error("Failed to initialize window style:", e);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
