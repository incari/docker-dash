# Docker Dashboard

A modern, responsive dashboard for managing your Docker containers. Create shortcuts (favorites) for your most used containers, organize them into sections, and access them quickly.

![Docker Dashboard](https://github.com/incari/docker-dash/assets/placeholder.png)

## Features

### Container Management
-   **Real-time Container Discovery**: Automatically detects and displays all running Docker containers on your server
-   **Container Controls**: Start, Stop, and Restart containers directly from the dashboard
-   **Quick Add from Containers**: Star icon on running containers to instantly create shortcuts
-   **Port Detection**: Automatically detects exposed ports from running containers

### Smart Shortcuts System
-   **Flexible URL Options**:
    -   Link to container ports (auto-detects server IP)
    -   Use custom URLs for external services
    -   Tailscale IP detection for secure remote access
-   **Customizable Appearance**:
    -   Choose from icon library (Lucide React icons)
    -   Use custom image URLs
    -   Upload your own images
    -   Custom names and descriptions
-   **Organization**: Group shortcuts into collapsible sections with drag-and-drop support

### Advanced Features
-   **Tailscale Integration**:
    -   Automatically detects Tailscale IP addresses when using host network mode
    -   Perfect for secure remote access to your homelab/server
    -   Works seamlessly with Unraid and other Linux hosts
-   **Drag & Drop Interface**:
    -   Reorder shortcuts within sections
    -   Move shortcuts between sections
    -   Reorganize sections
    -   Optimized for both mobile touch and desktop mouse interactions
-   **Responsive Design**:
    -   Mobile-first design with touch-friendly controls
    -   Desktop hover actions for quick access
    -   Adaptive layouts for all screen sizes
-   **PWA Support**: Install as a Progressive Web App on mobile devices or desktop
-   **Persistent Storage**: SQLite database for reliable data persistence across restarts

## Prerequisites

-   [Node.js](https://nodejs.org/) (v18 or higher)
-   [pnpm](https://pnpm.io/) (Package manager)
-   [Docker](https://www.docker.com/) (Running locally for backend access)

## Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/incari/docker-dash.git
    cd docker-dash
    ```

2.  **Install dependencies:**

    Install root dependencies (backend) and frontend dependencies:

    ```bash
    # Root (Backend)
    pnpm install

    # Frontend
    cd frontend
    pnpm install
    cd ..
    ```

## Running Locally

To run the application in development mode (which starts both backend and frontend concurrently):

```bash
pnpm dev
```

-   **Frontend**: [http://localhost:5173](http://localhost:5173)
-   **Backend API**: [http://localhost:3000](http://localhost:3000)

> **Note**: The backend needs access to the Docker socket (`/var/run/docker.sock`) to fetch container information. Ensure your user has permissions or run with necessary privileges if needed.

## Environment Variables

You can configure the application using environment variables. Create a `.env` file in the root directory (see `.env.example`).

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | The port the backend server runs on. | `3000` |
| `DOCKER_SOCKET` | Path to the Docker socket. | `/var/run/docker.sock` |
| `DB_PATH` | Path to the SQLite database file. | `./data/dashboard.db` |
| `UPLOAD_DIR` | Path to store uploaded images. | `./data/images` |
| `NODE_ENV` | Environment mode (`development`/`production`). | `production` |

## Running with Docker

### Using Docker Compose (Recommended)

Create a `docker-compose.yml` file:

```yaml
services:
  docker-dash:
    image: ghcr.io/incari/docker-dash:latest
    container_name: docker-dash
    restart: unless-stopped

    ports:
      - "3080:3000"

    volumes:
      # Mount Docker socket for container access
      - /var/run/docker.sock:/var/run/docker.sock:ro
      # Persistent data storage
      - ./data:/app/data

    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/app/data/dashboard.db
      - UPLOAD_DIR=/app/data/images
```

Then start the container:

```bash
docker-compose up -d
```

Access the dashboard at [http://localhost:3080](http://localhost:3080)

### Using Docker Run

Alternatively, run directly with Docker:

```bash
docker run -d \
  --name docker-dash \
  -p 3080:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v ./data:/app/data \
  -e NODE_ENV=production \
  -e PORT=3000 \
  ghcr.io/incari/docker-dash:latest
```

### Tailscale Support

For Tailscale IP detection (useful on Unraid/Linux hosts), use host network mode:

```yaml
services:
  docker-dash:
    image: ghcr.io/incari/docker-dash:latest
    container_name: docker-dash
    restart: unless-stopped
    network_mode: host  # Use host network for Tailscale detection

    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./data:/app/data

    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/app/data/dashboard.db
      - UPLOAD_DIR=/app/data/images
```

> **Note**: With `network_mode: host`, the app will be available at `http://HOST_IP:3000` (not 3080).

## Tech Stack

-   **Frontend**: React, Vite, Tailwind CSS, Framer Motion, @dnd-kit (Drag & Drop).
-   **Backend**: Node.js, Express, Better-SQLite3 (for persistent data).
-   **Icons**: Lucide React.
