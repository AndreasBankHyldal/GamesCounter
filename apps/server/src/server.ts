import { Server, Origins } from "boardgame.io/server";
import { FiveHundred } from "@gamescounter/games";
import { makeRoomCode } from "./codes";
import { startCleanup } from "./cleanup";

const PORT = Number(process.env.PORT ?? 8000);

// Allowed browser origins for the game + lobby API. Localhost is always allowed
// for development; the deployed web origin comes from CLIENT_ORIGIN. Vercel
// preview URLs (*.vercel.app) are allowed via regex so previews work too.
const origins: (string | RegExp)[] = [Origins.LOCALHOST, /\.vercel\.app$/];
if (process.env.CLIENT_ORIGIN) origins.push(process.env.CLIENT_ORIGIN);

const server = Server({
  games: [FiveHundred],
  origins,
  // Matches are private (unlisted) and addressed by a short shareable code.
  // Overriding `uuid` makes the lobby's create endpoint mint these codes.
  uuid: () => makeRoomCode(),
});

// Auto-delete matches once everyone has been gone for 15+ minutes.
startCleanup(server.db);

server.run(PORT, () => {
  console.log(`boardgame.io server listening on :${PORT}`);
  console.log(`Games: ${[FiveHundred.name].join(", ")}`);
});
