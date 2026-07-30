import React from "react";
import ReactDOM from "react-dom/client";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "./styles.css";
import { App } from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Theme
      accentColor="blue"
      grayColor="slate"
      panelBackground="solid"
      radius="medium"
      scaling="100%"
    >
      <App />
    </Theme>
  </React.StrictMode>,
);
