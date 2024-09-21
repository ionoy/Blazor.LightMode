import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import alias from '@rollup/plugin-alias';
import path from 'path';

export default {
  input: 'src/Boot.LightMode.ts', // Replace with your entry TypeScript file
  output: {
    file: '../wwwroot/blazor.lightmode.js', // Output bundle file
    format: 'iife',         // Immediately Invoked Function Expression format for browsers
    name: 'MyApp',          // Global variable name for your app
    sourcemap: true         // Generate source maps
  },
  plugins: [
    alias({
      entries: [
        {
          find: '@microsoft/dotnet-js-interop',
          replacement: path.resolve(
              __dirname,
              'node_modules/@microsoft/dotnet-js-interop/dist/Microsoft.JSInterop.js'
          ),
        },
      ],
    }),
    resolve({
      browser: true,        // Resolve browser-compatible modules
      extensions: ['.js', '.ts'],
      preferBuiltins: false,
      moduleDirectories: ['node_modules']
    }),
    commonjs({
      include: /node_modules/,
      extensions: ['.js', '.ts'],
    }),             // Convert CommonJS modules to ES6
    typescript({
      tsconfig: './tsconfig.json'
    })
  ]
};