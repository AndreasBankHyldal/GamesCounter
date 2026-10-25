import { SocketIO } from "boardgame.io/server";
import { isAllowedClientOrigin } from "./security";

/**
 * Exposes authenticated game sync attempts as keep-alive activity without
 * reaching into SocketIO's private runtime fields.
 */
export class ActivitySocketIO extends SocketIO {
  constructor(
    private readonly onActivity: () => void,
    origins: readonly string[]
  ) {
    super({
      socketOpts: {
        allowRequest: (request, callback) => {
          callback(null, isAllowedClientOrigin(request.headers.origin, origins));
        },
      },
    });
  }

  override init(...args: Parameters<SocketIO["init"]>): void {
    super.init(...args);
    const [app, games] = args;
    if (!app._io) {
      throw new Error("Socket.IO failed to initialize");
    }

    for (const game of games) {
      if (!game.name) continue;
      app._io.of(game.name).on("connection", (socket) => {
        socket.once("sync", this.onActivity);
      });
    }
  }
}
