import { networkInterfaces } from "node:os";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3000;

function getLanIp(): string | undefined {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return undefined;
}

const app = createApp();

app.listen(PORT, "0.0.0.0", () => {
  const lanIp = getLanIp();
  console.log(`TripSync server running on:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  if (lanIp) {
    console.log(`  Network: http://${lanIp}:${PORT}  <- use this on phones (same WiFi)`);
  } else {
    console.log(`  Network: could not detect a LAN IP — run \`ifconfig\` (mac/linux) or \`ipconfig\` (windows) to find it`);
  }
});
