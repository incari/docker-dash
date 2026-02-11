# Docker Dashboard

A modern, responsive dashboard for managing your Docker containers. Create shortcuts (favorites) for your most used containers, organize them into sections, and access them quickly.

## Installation

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

## Environment Variables

You can configure the application using environment variables. Create a `.env` file in the root directory (see `.env.example`).

| Variable        | Description                                    | Default                |
| :-------------- | :--------------------------------------------- | :--------------------- |
| `PORT`          | The port the backend server runs on.           | `3000`                 |
| `DOCKER_SOCKET` | Path to the Docker socket.                     | `/var/run/docker.sock` |
| `DB_PATH`       | Path to the SQLite database file.              | `./data/dashboard.db`  |
| `UPLOAD_DIR`    | Path to store uploaded images.                 | `./data/images`        |
| `NODE_ENV`      | Environment mode (`development`/`production`). | `production`           |

## Running Locally

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

- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:3000](http://localhost:3000)

> **Note**: The backend needs access to the Docker socket (`/var/run/docker.sock`) to fetch container information. Ensure your user has permissions or run with necessary privileges if needed.

### Tailscale Support

For Tailscale IP detection (useful on Unraid/Linux hosts), use host network mode:

```yaml
services:
  docker-dash:
    image: ghcr.io/incari/docker-dash:latest
    container_name: docker-dash
    restart: unless-stopped
    network_mode: host # Use host network for Tailscale detection

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

## Features

### Container Management

- **Real-time Container Discovery**: Automatically detects and displays all running Docker containers on your server.
- **Container Controls**: Start, Stop, and Restart containers directly from the dashboard _note_ Editing the container to use a URL will still track the container to start/stop the container.
- **Quick Add from Containers**: Star icon on running containers to instantly create shortcuts
- **Port Detection**: Automatically detects exposed ports from running containers. _note_ Some container can use multiple ports, in this case you can select the port you want to use when you create the shortcut.
- **Auto-Icon Detection**: Automatically fetches container icons from [Homarr Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) library based on container name
- **Custom Icon Mappings**: Support for custom icons for specific containers (see [CUSTOM_DOCKER_ICONS.md](CUSTOM_DOCKER_ICONS.md))

### Smart Shortcuts System

- **Flexible URL Options**:
  - Link to container ports (auto-detects server IP)
  - Use custom URLs for external services
  - Tailscale IP detection for secure remote access
- **Customizable Appearance**:
  - Choose from icon library (Lucide React icons)
  - Use custom image URLs
  - **Upload your own images** with built-in image management
  - **Delete uploaded images** with confirmation dialog
  - Custom names and descriptions
  - Support for GIFs and SVG images
    ![Animated gift support](/public/gifs-support.gif "Gifs support")
- **Organization**: Group shortcuts into collapsible sections with drag-and-drop support
- **Multiple View Modes**: Switch between Compact, Icon, List, and Table views in Management page
- **Icon Migration Tool**: Bulk update container icons and descriptions from Homarr Dashboard Icons library

### Bookmarks

- **Bookmark your favorite websites**:
  - Add a name, description, url and icon
  - Choose from icon library (Lucide React icons)
  - Use custom image URLs
  - Same image management as shortcuts

### Advanced Features

- **Tailscale Integration**:
  - Automatically detects Tailscale IP addresses when using host network mode
  - Perfect for secure remote access to your homelab/server
  - Works seamlessly with Unraid and other Linux hosts
- **Drag & Drop Interface**:
  - Reorder shortcuts within sections
  - Move shortcuts between sections
  - Reorganize sections
  - Optimized for both mobile touch and desktop mouse interactions
- **Responsive Design**:
  - Mobile-first design with touch-friendly controls
  - Desktop hover actions for quick access
  - Adaptive layouts for all screen sizes
- **PWA Support**: Install as a Progressive Web App on mobile devices or desktop
- **Persistent Storage**: SQLite database for reliable data persistence across restarts

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [pnpm](https://pnpm.io/) (Package manager)
- [Docker](https://www.docker.com/) (Running locally for backend access)

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Framer Motion, @dnd-kit (Drag & Drop), i18next (Internationalization)
- **Backend**: Node.js, Express, Better-SQLite3 (for persistent data), Multer (file uploads)
- **Icons**: Lucide React

## Recent Updates

Check out the [CHANGELOG.md](CHANGELOG.md) for detailed information about recent features and improvements.

### Latest Features (2024)

- ✅ **Homarr Dashboard Icons Integration**: Automatic icon detection from the [Homarr Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) library
- ✅ **Custom Icon Mappings**: Support for custom container icons with priority over default library (see [CUSTOM_DOCKER_ICONS.md](CUSTOM_DOCKER_ICONS.md))
- ✅ **Icon Migration Tool**: Bulk update existing shortcuts with new icons and descriptions from Homarr library
- ✅ **Internationalization**: Full i18n support with English and Spanish translations
- ✅ **Image Upload & Management**: Upload custom images (PNG, JPG, GIF, SVG) with deletion support
- ✅ **Multiple View Modes**: Compact, Icon, List, and Table views in Management page
- ✅ **Enhanced Drag & Drop**: Improved visual feedback and touch support for mobile and desktop
- ✅ **Performance Optimizations**: React hooks optimization and better state management
- ✅ **TypeScript Improvements**: Better type safety and error handling
- ✅ **UI/UX Enhancements**: Improved dashboard organization and responsive design

[Feedback and features requests](https://tally.so/r/aQ2zNE)

### Roadmap

- More flexible UI card to display more information from the container and shortcut
- Add more filters to the management page
- Group by docker images that run multiple containers from the same image (like Docker Desktop does)
- Batch Creation: Efficiently create multiple shortcuts in one operation
- Dark/Light theme toggle
- Export/Import dashboard configuration
