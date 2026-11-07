/** @type {import("prettier").Config} */
const config = {
  useTabs: false,
  singleQuote: false,
  trailingComma: "all",
  tabWidth: 2,
  printWidth: 110,
  plugins: ["prettier-plugin-svelte"],
  overrides: [{ files: "*.svelte", options: { parser: "svelte" } }],
};

export default config;
