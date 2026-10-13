import nextConfig from "eslint-config-next";

const config = [
  {
    ignores: [
      "dist/**",
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "scripts/**",
      "tests/**",
      "review_pipeline.js",
      "server.js",
      "documents/**",
      "temp/**",
    ],
  },
  ...nextConfig,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },
];

export default config;
