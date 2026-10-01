#!/usr/bin/env node
// Stands in for the ssh binary: answers like ssh would for a few known
// machines, and otherwise does what `ssh host docker system dial-stdio` does -
// pipes stdin/stdout to a Docker API, here the fake daemon on FAKE_DOCKER_PORT.
import fs from "node:fs";
import net from "node:net";

const args = process.argv.slice(2);
const host = args[args.indexOf("--") + 1];

if (process.env.FAKE_SSH_LOG) {
  fs.appendFileSync(process.env.FAKE_SSH_LOG, JSON.stringify(args) + "\n");
}

const failures = {
  denied: "me@denied: Permission denied (publickey).",
  unknownkey: "Host key verification failed.",
  nodocker: "bash: line 1: docker: command not found",
};

if (failures[host]) {
  // Exit only once it is written: on macOS a pipe write is asynchronous, and
  // process.exit would drop it - real ssh never does.
  process.stderr.write(failures[host] + "\n", () =>
    process.exit(host === "nodocker" ? 127 : 255),
  );
} else {
  const socket = net.connect(Number(process.env.FAKE_DOCKER_PORT), "127.0.0.1");
  process.stdin.pipe(socket);
  socket.pipe(process.stdout);
  socket.on("close", () => process.exit(0));
  socket.on("error", (error) => {
    process.stderr.write(`ssh: connect to host ${host}: ${error.message}\n`, () =>
      process.exit(255),
    );
  });
}
