import { defineConfig } from "vite"

// https://vitejs.dev/config/
export default defineConfig({
  root: "awardsearch",
  envDir: "../",
  clearScreen: false,

  test: {
    maxConcurrency: 5,
    testTimeout: 3 * 60000, // incase we get in the test queue on browserless
    coverage: {
      reporter: ["lcovonly"],
      enabled: true,
      clean: true
    },
    sequence: { shuffle: true },
    passWithNoTests: true,

    reporters: ["default", "json"],
    outputFile: "test-results.json"
  }
})
