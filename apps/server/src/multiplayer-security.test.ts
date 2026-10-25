import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import { Client } from "boardgame.io/client";
import { SocketIO as Multiplayer } from "boardgame.io/multiplayer";
import { Server, SocketIO } from "boardgame.io/server";
import { FiveHundred } from "@gamescounter/games";
import type { FiveHundredState } from "@gamescounter/games/five-hundred";
import type { Game } from "boardgame.io";
import { ActivitySocketIO } from "./activity-transport";
import { enforceBrowserOrigin, generatePlayerCredentials } from "./security";

const ORIGIN = "https://game.example";
type GameClient = ReturnType<typeof Client<FiveHundredState>>;
type ClientState = NonNullable<ReturnType<GameClient["getState"]>>;

class LoopbackTransport extends ActivitySocketIO {
  io?: Parameters<SocketIO["init"]>[0]["_io"];

  override init(...args: Parameters<SocketIO["init"]>): void {
    const [app] = args;
    const http = createServer(app.callback());
    Object.defineProperty(app, "server", { value: http, writable: true });
    app.listen = (...values: unknown[]) => {
      const callback = values.find(
        (value): value is () => void => typeof value === "function"
      );
      return http.listen(0, "127.0.0.1", callback);
    };
    super.init(...args);
    this.io = app._io;
  }
}

async function fixture(t: TestContext, generateCredentials?: () => string) {
  const transport = new LoopbackTransport(() => {}, [ORIGIN]);
  const server = Server({
    games: [FiveHundred],
    origins: [ORIGIN],
    transport,
    uuid: () => "ABC234",
    generateCredentials,
  });
  server.app.use(enforceBrowserOrigin([ORIGIN]));
  t.after(() => new Promise<void>((resolve) => {
    assert.ok(transport.io);
    transport.io.close(() => resolve());
  }));
  const { appServer } = await server.run(0);
  const address = appServer.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;

  async function post(path: string, body: Record<string, unknown>) {
    const response = await fetch(url + path, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  }

  await post("/games/five-hundred/create", {
    numPlayers: 2, unlisted: true, setupData: { jokers: 0, winningScore: 500 },
  });
  async function join(playerID: string) {
    const body = await post("/games/five-hundred/ABC234/join", {
      playerID, playerName: `Player ${playerID}`,
    });
    assert.equal(typeof body.playerCredentials, "string");
    return String(body.playerCredentials);
  }
  return { url, server, join };
}

function waitForState(
  client: GameClient,
  predicate: (state: ClientState) => boolean
): Promise<ClientState> {
  const current = client.getState();
  if (current && predicate(current)) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for multiplayer state"));
    }, 3_000);
    unsubscribe = client.subscribe((state) => {
      if (state && predicate(state)) {
        clearTimeout(timer);
        unsubscribe();
        resolve(state);
      }
    });
  });
}

test("fork preserves authenticated sync, hidden hands, moves, chat and reconnect", {
  timeout: 15_000,
}, async (t) => {
  const { url, server, join } = await fixture(t, generatePlayerCredentials);
  const credentials0 = await join("0");
  const credentials1 = await join("1");
  assert.match(credentials0, /^[a-f0-9]{64}$/);
  assert.notEqual(credentials0, credentials1);
  const { metadata } = await server.db.fetch("ABC234", { metadata: true });
  assert.equal(await server.auth.authenticateCredentials({
    playerID: "0", credentials: credentials1, metadata,
  }), false);

  const clients = new Set<GameClient>();
  t.after(() => clients.forEach((client) => client.stop()));
  const connect = (playerID: string, credentials: string, transport: "polling" | "websocket") => {
    const client = Client<FiveHundredState>({
      game: FiveHundred, playerID, credentials, matchID: "ABC234", debug: false,
      multiplayer: Multiplayer({
        server: url,
        socketOpts: {
          transports: [transport], extraHeaders: { Origin: ORIGIN },
          reconnection: false, forceNew: true,
        },
      }),
    });
    clients.add(client);
    client.start();
    return client;
  };
  const first = connect("0", credentials0, "websocket");
  const second = connect("1", credentials1, "polling");
  const initial = await waitForState(first, (state) => state.G.hands["0"].length === 7);
  await waitForState(second, (state) => state.G.hands["1"].length === 7);
  assert.equal(initial.G.hands["1"]?.length ?? 0, 0);
  assert.equal(initial.G.stock.length, 0);

  first.moves.drawFromStock();
  const drawn = await waitForState(first, (state) => state.G.hasDrawn);
  assert.equal(drawn.G.hands["0"].length, 8);
  first.moves.discard(drawn.G.hands["0"][0].id);
  await waitForState(second, (state) => state.ctx.currentPlayer === "1");
  first.sendChatMessage("Transport regression check");
  await waitForState(second, () => second.chatMessages.some(
    (message) => message.payload === "Transport regression check"
  ));

  first.stop();
  clients.delete(first);
  const reconnected = connect("0", credentials0, "websocket");
  const restored = await waitForState(reconnected, (state) => state.ctx.currentPlayer === "1");
  assert.equal(restored.G.hands["0"].length, 7);
  assert.equal(restored.G.hands["1"]?.length ?? 0, 0);
});

test("HTTP, polling and WebSocket gates reject unlisted and missing origins", {
  timeout: 15_000,
}, async (t) => {
  const { url } = await fixture(t);
  const denied = "https://untrusted.vercel.app";
  const http = await fetch(url + "/games", { headers: { Origin: denied } });
  assert.equal(http.status, 403);
  const allowed = await fetch(url + "/games", { headers: { Origin: ORIGIN } });
  assert.equal(allowed.headers.get("access-control-allow-origin"), ORIGIN);

  for (const origin of [denied, undefined]) {
    const polling = await fetch(url + "/socket.io/?EIO=4&transport=polling", {
      headers: origin ? { Origin: origin } : {},
    });
    assert.equal(polling.status, 403);

    const factory = Multiplayer({
      server: url,
      socketOpts: {
        transports: ["websocket"], reconnection: false, forceNew: true,
        extraHeaders: origin ? { Origin: origin } : {},
        timeout: 1_000,
      },
    });
    let captured: ReturnType<typeof factory> | undefined;
    const client = Client({
      game: FiveHundred, matchID: "ABC234", playerID: "0", debug: false,
      multiplayer: (options) => {
        captured = factory(options);
        return captured;
      },
    });
    t.after(() => client.stop());
    client.start();
    assert.ok(captured);
    const socket = captured.socket;
    await new Promise<void>((resolve, reject) => {
      socket.once("connect_error", () => resolve());
      socket.once("connect", () => reject(new Error("Forbidden WebSocket origin was accepted")));
    });
    assert.equal(socket.connected, false);
  }
});

test("custom room IDs do not weaken the fork's default credentials", async (t) => {
  const { join } = await fixture(t);
  const credentials = await join("0");
  assert.equal(credentials.length, 21);
  assert.notEqual(credentials, "ABC234");
});

test("headless 500 still scores a round and rotates the next starter", () => {
  const setup = FiveHundred.setup;
  assert.ok(setup);
  const game: Game<FiveHundredState> = {
    ...FiveHundred,
    setup: (context) => {
      const state = setup(context, { jokers: 0 });
      state.hands["0"] = [];
      return state;
    },
  };
  const client = Client({ game, numPlayers: 2, playerID: "0", debug: false });
  client.start();
  try {
    client.moves.drawFromStock();
    const drawn = client.getState();
    assert.ok(drawn);
    assert.equal(drawn.G.hands["0"].length, 1);
    client.moves.closeHand(drawn.G.hands["0"][0].id);
    const closed = client.getState();
    assert.ok(closed?.G.roundOver);
    assert.equal(closed.G.lastRound?.closedBy, "0");
    client.moves.nextRound();
    const next = client.getState();
    assert.ok(next);
    assert.equal(next.G.roundNumber, 2);
    assert.equal(next.ctx.currentPlayer, "1");
    assert.equal(next.G.hands["0"].length, 7);
  } finally {
    client.stop();
  }
});
