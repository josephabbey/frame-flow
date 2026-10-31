import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        Bun: "readonly",
        document: "readonly",
        history: "readonly",
        localStorage: "readonly",
        location: "readonly",
        window: "readonly",
        WebSocket: "readonly",
      },
    },
  },
);
