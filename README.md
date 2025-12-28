# Docker Dashboard

A modern, responsive dashboard for managing your Docker containers. Create shortcuts (favorites) for your most used containers, organize them into sections, and access them quickly.

![Docker Dashboard](https://github.com/incari/docker-dashboard/assets/placeholder.png)

## Features

-   **Container Management**: View running containers, Start/Stop/Restart control.
-   **Shortcuts System**: Create favorites linking to specific ports or custom URLs.
-   **Organization**: Group shortcuts into collapsible sections.
-   **Drag & Drop**: Intuitive drag-and-drop interface for reordering shortcuts and sections (optimized for mobile & desktop).
-   **Tailscale Integration**: Optional support for detecting Tailscale IP addresses.
-   **Responsive Design**: Mobile-friendly interface with touch support.
-   **PWA Support**: Installable as a Progressive Web App.

## Prerequisites

-   [Node.js](https://nodejs.org/) (v18 or higher)
-   [pnpm](https://pnpm.io/) (Package manager)
-   [Docker](https://www.docker.com/) (Running locally for backend access)

## Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/incari/docker-dashboard.git
    cd docker-dashboard
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

You can run the entire application using Docker Compose.

1.  **Start the container:**

    ```bash
    docker-compose up -d
    ```

2.  **Access the dashboard:**
    Open [http://localhost:3080](http://localhost:3080) in your browser.

> **Configuration**: Check the `docker-compose.yml` file for volume mappings (data persistence) and network settings (Bridge mode vs Host mode for Tailscale support).

## Tech Stack

-   **Frontend**: React, Vite, Tailwind CSS, Framer Motion, @dnd-kit (Drag & Drop).
-   **Backend**: Node.js, Express, Better-SQLite3 (for persistent data).
-   **Icons**: Lucide React.
