# IronFeast Website

This project is ready to deploy on Netlify. It uses Express and Nodemailer, and serves static files from the `public` directory.

## How to run locally

1. Install dependencies:
   ```sh
   npm install
   ```
2. Start the server:
   ```sh
   npm start
   ```
3. Build for Netlify:
   ```sh
   npm run build
   ```

## Netlify configuration
- `netlify.toml` is present for build and redirects.
- Static files are served from the `public` folder.
- Main entry point is `index.js`.
