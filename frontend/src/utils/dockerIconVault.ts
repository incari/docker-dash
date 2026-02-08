/**
 * Utility functions for docker-icon-vault integration
 * Maps container names to curated Docker icons from https://incari.github.io/docker-icon-vault/
 */

const DOCKER_ICON_VAULT_BASE_URL =
  "https://incari.github.io/docker-icon-vault/icons";

/**
 * List of available icons in docker-icon-vault
 * This list should be kept in sync with the vault repository
 */
const AVAILABLE_DOCKER_ICONS = [
  "memcached",
  "nginx",
  "busybox",
  "alpine",
  "redis",
  "postgres",
  "ubuntu",
  "python",
  "node",
  "mysql",
  "mongo",
  "httpd",
  "rabbitmq",
  "traefik",
  "docker",
  "hello-world",
  "mariadb",
  "openjdk",
  "golang",
  "debian",
  "ruby",
  "wordpress",
  "php",
  "sonarqube",
  "haproxy",
  "influxdb",
  "consul",
  "nextcloud",
  "amazonlinux",
  "elasticsearch",
  "tomcat",
  "maven",
  "caddy",
  "eclipse-mosquitto",
  "telegraf",
  "vault",
  "bash",
  "adminer",
  "ghost",
  "solr",
  "kong",
  "zookeeper",
  "neo4j",
  "gradle",
  "perl",
  "buildpack-deps",
  "eclipse-temurin",
  "cassandra",
  "nats",
  "kibana",
  "percona",
  "drupal",
  "composer",
  "logstash",
  "couchdb",
  "chronograf",
  "matomo",
  "fedora",
  "amazoncorretto",
  "rust",
  "flink",
  "couchbase",
  "joomla",
  "phpmyadmin",
  "groovy",
  "rethinkdb",
  "rocket.chat",
  "redmine",
  "erlang",
  "elixir",
  "kapacitor",
  "jruby",
  "odoo",
  "mediawiki",
  "jetty",
  "oraclelinux",
  "pypy",
  "rockylinux",
  "clojure",
  "arangodb",
  "xwiki",
  "ros",
  "archlinux",
  "swift",
  "znc",
  "hylang",
  "gcc",
  "tomee",
  "haxe",
  "websphere-liberty",
  "sapmachine",
  "yourls",
  "varnish",
  "crate",
  "aerospike",
  "photon",
  "julia",
  "orientdb",
  "open-liberty",
  "bonita",
  "ibmjava",
  "monica",
  "almalinux",
  "fluentd",
  "r-base",
  "ibm-semeru-runtimes",
  "neurodebian",
  "storm",
  "irssi",
  "haskell",
  "backdrop",
  "cirros",
  "lightstreamer",
  "geonetwork",
  "friendica",
  "postfixadmin",
  "convertigo",
  "gazebo",
  "dart",
  "swipl",
  "eggdrop",
  "rakudo-star",
  "silverpeas",
  "mageia",
  "spark",
  "clickhouse",
  "alt",
  "hitch",
  "satosa",
  "krakend",
  "api-firewall",
];

/**
 * Normalize container name to match docker-icon-vault naming convention
 * Examples:
 * - "python" -> "python"
 * - "python/pytorch" -> "python-pytorch"
 * - "my-nginx-container" -> "my-nginx-container" (matching happens in getDockerIconVaultUrl)
 * - "postgres:latest" -> "postgres"
 * - "postgres-db-1" -> "postgres-db-1" (will match "postgres" icon)
 */
export function normalizeContainerName(containerName: string): string {
  if (!containerName) return "";

  // Remove version tags (e.g., ":latest", ":14.2")
  let normalized = containerName.split(":")[0] || "";

  // Convert slashes to hyphens (e.g., "python/pytorch" -> "python-pytorch")
  normalized = normalized.replace(/\//g, "-");

  // Convert to lowercase
  normalized = normalized.toLowerCase();

  return normalized;
}

/**
 * Get the docker-icon-vault URL for a container name
 * Returns the icon URL if available, otherwise returns null
 */
export function getDockerIconVaultUrl(containerName: string): string | null {
  const normalized = normalizeContainerName(containerName);

  // Check if the normalized name exists in the vault
  if (AVAILABLE_DOCKER_ICONS.includes(normalized)) {
    return `${DOCKER_ICON_VAULT_BASE_URL}/${normalized}.png`;
  }

  // Try to find a match with priority:
  // 1. Icon name at the start (e.g., "postgres-db-1" matches "postgres")
  // 2. Icon name as a word boundary (e.g., "my-nginx-app" matches "nginx")
  // 3. Icon name anywhere in the string

  // Priority 1: Starts with icon name followed by hyphen or end
  let partialMatch = AVAILABLE_DOCKER_ICONS.find((icon) => {
    const pattern = new RegExp(`^${icon}(-|$)`);
    return pattern.test(normalized);
  });

  if (partialMatch) {
    return `${DOCKER_ICON_VAULT_BASE_URL}/${partialMatch}.png`;
  }

  // Priority 2: Icon name appears as a complete word (surrounded by hyphens or at boundaries)
  partialMatch = AVAILABLE_DOCKER_ICONS.find((icon) => {
    const pattern = new RegExp(`(^|-)${icon}(-|$)`);
    return pattern.test(normalized);
  });

  if (partialMatch) {
    return `${DOCKER_ICON_VAULT_BASE_URL}/${partialMatch}.png`;
  }

  // Priority 3: Icon name appears anywhere in the container name
  partialMatch = AVAILABLE_DOCKER_ICONS.find((icon) =>
    normalized.includes(icon),
  );

  if (partialMatch) {
    return `${DOCKER_ICON_VAULT_BASE_URL}/${partialMatch}.png`;
  }

  return null;
}

/**
 * Get the appropriate icon for a container
 * Returns docker-icon-vault URL if available, otherwise returns the default icon name
 */
export function getContainerIcon(
  containerName: string,
  defaultIcon: string = "Server",
): string {
  const vaultUrl = getDockerIconVaultUrl(containerName);
  return vaultUrl || defaultIcon;
}
