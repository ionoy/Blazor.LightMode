import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';

export default {
  input: 'src/Boot.Server.Custom.ts', // Replace with your entry TypeScript file
  output: {
    file: '../wwwroot/boot.server.custom.js', // Output bundle file
    format: 'iife',         // Immediately Invoked Function Expression format for browsers
    name: 'MyApp',          // Global variable name for your app
    sourcemap: true         // Generate source maps
  },
  plugins: [
    resolve({
      browser: true,        // Resolve browser-compatible modules
      extensions: ['.js', '.ts']
    }),
    commonjs(),             // Convert CommonJS modules to ES6
    typescript({
      tsconfig: './tsconfig.json'
    })
  ]
};