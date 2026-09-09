/**
 * Example Queries for AI Chat
 * Provides sample queries users can click to get started
 */

/**
 * Example query interface
 */
export interface ExampleQuery {
  /** Display text for the example */
  text: string;
  /** Category of the example */
  category: "containers" | "shortcuts" | "control" | "search";
  /** Icon name (Lucide icon) */
  icon: string;
  /** Description of what the query does */
  description: string;
}

/**
 * Available example queries
 */
export const exampleQueries: ExampleQuery[] = [
  // Container queries
  {
    text: "Show me all my containers",
    category: "containers",
    icon: "Container",
    description: "List all Docker containers with their status",
  },
  {
    text: "Which containers are running?",
    category: "containers",
    icon: "Play",
    description: "Show only running containers",
  },
  {
    text: "Show me stopped containers",
    category: "containers",
    icon: "Square",
    description: "List all stopped containers",
  },
  {
    text: "How many containers do I have?",
    category: "containers",
    icon: "Hash",
    description: "Get a count of total containers",
  },

  // Search queries
  {
    text: "Find my postgres database",
    category: "search",
    icon: "Search",
    description: "Search for containers by name",
  },
  {
    text: "Show me all nginx containers",
    category: "search",
    icon: "Search",
    description: "Find containers matching 'nginx'",
  },
  {
    text: "Find containers with 'web' in the name",
    category: "search",
    icon: "Search",
    description: "Search for web-related containers",
  },

  // Shortcut queries
  {
    text: "List all my shortcuts",
    category: "shortcuts",
    icon: "Star",
    description: "Show all dashboard shortcuts",
  },
  {
    text: "Show my favorite shortcuts",
    category: "shortcuts",
    icon: "Heart",
    description: "Display favorited shortcuts",
  },
  {
    text: "How many shortcuts do I have?",
    category: "shortcuts",
    icon: "Hash",
    description: "Get shortcut count",
  },

  // Control queries (require confirmation)
  {
    text: "Start the nginx container",
    category: "control",
    icon: "Play",
    description: "Start a stopped container (requires confirmation)",
  },
  {
    text: "Stop the postgres container",
    category: "control",
    icon: "Square",
    description: "Stop a running container (requires confirmation)",
  },
  {
    text: "Restart the redis container",
    category: "control",
    icon: "RotateCw",
    description: "Restart a container (requires confirmation)",
  },
];

/**
 * Get examples by category
 * @param category - Category to filter by
 * @returns Filtered examples
 */
export function getExamplesByCategory(
  category: ExampleQuery["category"]
): ExampleQuery[] {
  return exampleQueries.filter((example) => example.category === category);
}

/**
 * Get random examples
 * @param count - Number of examples to return
 * @returns Random examples
 */
export function getRandomExamples(count: number = 3): ExampleQuery[] {
  const shuffled = [...exampleQueries].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Get examples for first-time users
 * @returns Beginner-friendly examples
 */
export function getBeginnerExamples(): ExampleQuery[] {
  return [
    exampleQueries[0], // Show me all my containers
    exampleQueries[4], // Find my postgres database
    exampleQueries[7], // List all my shortcuts
  ];
}

/**
 * Category metadata
 */
export const categoryMetadata = {
  containers: {
    name: "Containers",
    description: "View and manage Docker containers",
    color: "blue",
  },
  shortcuts: {
    name: "Shortcuts",
    description: "Manage dashboard shortcuts",
    color: "purple",
  },
  control: {
    name: "Control",
    description: "Start, stop, and restart containers",
    color: "green",
  },
  search: {
    name: "Search",
    description: "Find specific containers or shortcuts",
    color: "yellow",
  },
} as const;

/**
 * Get category color class
 * @param category - Category name
 * @returns Tailwind color class
 */
export function getCategoryColorClass(category: ExampleQuery["category"]): string {
  const colorMap = {
    containers: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    shortcuts: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    control: "bg-green-500/20 text-green-400 border-green-500/30",
    search: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };

  return colorMap[category];
}

