# SST Dashboard - Setup Guide

> Step-by-step installation and configuration guide for the React dashboard

## Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- **SST Node API** running and accessible

## Quick Start

### 1. Clone the Repository

```bash
# From the repository root
cd apps/web
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### 4. Configure Server Connection

1. On first load, you'll see the login page
2. Click "Add Server" or the settings icon
3. Enter your SST Node API details:
   - **Name**: Display name (e.g., "My DayZ Server")
   - **API URL**: Full URL to API (e.g., `http://192.168.1.100:3001`)
   - **API Key**: Your API key (optional if using JWT auth)
4. Click Save
5. Login with your username/password

---

## Production Build

### Build for Production

```bash
npm run build
```

Output is in the `dist/` folder.

### Preview Production Build

```bash
npm run preview
```

---

## Deployment Options

### Option 1: Static Hosting (Recommended)

The dashboard is a static site that can be hosted anywhere:

- **Nginx** (see below)
- **Apache**
- **Netlify**
- **Vercel**
- **GitHub Pages**
- **AWS S3 + CloudFront**

### Option 2: Docker

```bash
docker build -t sst-dashboard .
docker run -p 80:80 sst-dashboard
```

Or with Docker Compose:

```bash
docker-compose up -d
```

### Option 3: Serve from Node.js

```bash
npm install -g serve
serve -s dist -l 3000
```

---

## Nginx Configuration

Example nginx config for serving the dashboard:

```nginx
server {
    listen 80;
    server_name dashboard.yourserver.com;
    root /var/www/sst-dashboard/dist;
    index index.html;

    # Handle SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Proxy API requests (optional)
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Environment Variables

For Docker deployments, you can configure via environment:

```env
# .env.docker
VITE_DEFAULT_API_URL=http://api.yourserver.com:3001
```

Note: Vite environment variables must be prefixed with `VITE_`.

---

## Map Tiles

The dashboard uses DayZ map images for the player map.

### Map Location

Place map tiles in:
```
public/maps/chernarusplus/map.png
public/maps/enoch/map.png
public/maps/sakhal/map.png
```

### Map Size

Maps should be 15360 x 15360 pixels (or scaled appropriately).

---

## Multi-Server Support

The dashboard supports connecting to multiple SST API servers:

1. Go to Settings
2. Add multiple server configurations
3. Use the dropdown in the header to switch servers
4. Each server maintains its own authentication

Server configurations are stored in browser localStorage.

---

## Troubleshooting

### "Failed to fetch" / Network Error

- Check that the API server is running
- Check CORS configuration on the API
- Verify the API URL is correct
- Check firewall/network access

### Login Fails

- Verify username/password
- Check API server logs for errors
- Ensure API database has users

### Map Not Loading

- Check map tiles exist in `public/maps/`
- Check browser console for 404 errors
- Verify map file is correct size

### Blank Page After Build

- Check browser console for errors
- Ensure `index.html` is served for all routes
- Check base URL configuration in `vite.config.ts`

---

## Development

### Project Structure

```
apps/web/
├── src/
│   ├── App.tsx           # Main component
│   ├── main.tsx          # Entry point
│   ├── components/       # React components
│   │   ├── features/     # Feature components
│   │   └── ui/           # UI primitives
│   ├── services/         # API & utilities
│   └── types/            # TypeScript types
├── public/
│   └── maps/             # Map tile images
├── docs/                 # Documentation
└── package.json
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

---

## Next Steps

- [API Documentation](../../api/docs/API.md)
- [Contributing](../CONTRIBUTING.md)
