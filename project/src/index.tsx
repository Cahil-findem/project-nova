import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AiInput } from "./screens/AiInput";

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <AiInput />
  </StrictMode>,
);
