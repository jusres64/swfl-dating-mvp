# SWFL Founding Beta - Starter MVP

## Quick Setup (Windows PowerShell)

1. Unzip this folder onto your computer (for example, `C:\Users\YourName\Desktop\swfl-dating-mvp`).
2. Open PowerShell inside that folder and install dependencies:
   ```powershell
   npm install
   ```
3. Set up your free database at https://supabase.com:
   - Create a new project.
   - Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and click **Run**.
   - Go to **Project Settings -> API** and copy your `Project URL` and `service_role` key.
4. Set up your free video account at https://livekit.io:
   - Create a free Cloud project.
   - Copy your `WebSocket URL`, `API Key`, and `API Secret`.
5. Rename `.env.local.example` to `.env.local` and paste your 5 keys inside.
6. Start the app locally in PowerShell:
   ```powershell
   npm run dev
   ```
   Then open http://localhost:3000 in your browser.
