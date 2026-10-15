import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/krub/400.css";
import "@fontsource/krub/500.css";
import "@fontsource/krub/600.css";
import "@fontsource/unica-one/400.css";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
