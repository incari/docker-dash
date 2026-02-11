/**
 * Docker client configuration
 */

import Docker from 'dockerode';

// Docker connection - uses socket by default
export const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock'
});

export type DockerInstance = typeof docker;

