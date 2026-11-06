import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens/fonts.css";
import "./styles/tokens/colors.css";
import "./styles/tokens/typography.css";
import "./styles/tokens/spacing.css";
import "./styles/tokens/radius.css";
import "./styles/tokens/elevation.css";
import "./styles/tokens/base.css";
import "./styles/app.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
