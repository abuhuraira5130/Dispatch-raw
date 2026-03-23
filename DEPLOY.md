# 🚀 Deployment Guide: YouTube SEO Generator

Your project is ready for real-time production use. This is a client-side React application powered by Vite, which means you can deploy it for free on almost any static hosting provider.

## 🏆 Recommended: Vercel (Easiest)

1. **Push your code to GitHub/GitLab/Bitbucket.**
2. Go to [Vercel.com](https://vercel.com/) and click **"Add New" > "Project"**.
3. Import your repository.
4. Vercel will automatically detect **Vite**.
5. Click **"Deploy"**.
6. Once finished, you will get a permanent URL (e.g., `dispatch-raw.vercel.app`).

## 🥈 Alternative: Netlify

1. Go to [Netlify.com](https://www.netlify.com/).
2. Drag and drop your `dist` folder (after running `npm run build`) into the Netlify dashboard.
3. OR connect your GitHub repo for automatic deployments.

## 🛠️ Manual Deployment (Any Server)

If you have your own server or cPanel:
1. Run `npm run build` on your local machine.
2. This creates a `dist/` folder.
3. Upload the contents of `dist/` to your server's `public_html` or root directory.

---

### 🛰️ Security & Your API Key
- **No Backend Required**: This app runs entirely in the user's browser.
- **Key Safety**: Users must provide their own Gemini API key in the "API Settings" section. Keys are stored safely in their browser's **LocalStorage** and are never sent to your server.
- **Safety Protocol**: This ensures you (the owner) don't have to pay for other people's API usage, and their keys remain private.

---

### 🚔 Deployment Checklist
- [x] Run `npm run lint` to check for errors (Passed ✅)
- [x] Run `npm run build` to verify production bundle (Passed ✅)
- [x] Update Gemini prompt for accurate "Dispatch Raw" branding (Completed ✅)
- [x] Fix Viral Radar links for YouTube redirection (Completed ✅)
- [x] Add mandatory agency disclaimer (Completed ✅)
