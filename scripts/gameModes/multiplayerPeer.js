import { GameClient } from "../gameClient/gameClient.js";
import { MultiEventHandler } from "../utils/multiEventHandler.js";
import { GameModeBase } from "./gameModeBase.js";
// This class manages a multiplayer peers's game. It does not run a GameServer as that is run by the host.
// Instead it only creates a GameClient and communicates with the host over the network.
export class GameModeMultiplayerPeer extends GameModeBase {
    // Private fields
    #runtime; // Construct runtime
    #gameClient; // The local player's GameClient
    #eventHandlers;
    // for a promise that resolves when host sends "start" message
    #startResolve;
    #readyTimerId = -1; // for regularly sending "ready" messages to host
    constructor(runtime) {
        super();
        this.#runtime = runtime;
        this.#gameClient = null;
        this.#startResolve = null;
        this.#eventHandlers = new MultiEventHandler([
            // Listen for incoming messages from the host over the network.
            [this.#runtime.objects.Multiplayer, "message", e => this.#HandleHostMessage(e)],
            [this.#runtime.objects.Multiplayer, "peerdisconnect", () => this.#OnPeerDisconnect()]
        ]);
    }
    async Init() {
        // Create the game client which manages the local game state.
        // Also pass it the SendMessageToHost function for messaging.
        // Note that the multiplayer peer is always player 1. (TODO: support for more players)
        this.#gameClient = new GameClient(this.#runtime, ((m, t) => this.#SendMessageToHost(m, t)), 1, "multiplayer-peer");
        this.#gameClient.Init();
        // The host could take a lot longer to load for some reason, and not yet be listening for
        // messages. We don't know when the host will be ready, so send ready messages every 250ms
        // until we get back a "start" message.
        await new Promise(resolve => {
            this.#startResolve = resolve;
            this.#readyTimerId = setInterval(() => this.#SendMessageToHost({
                "type": "ready"
            }), 250);
        });
    }
    Release() {
        this.#eventHandlers.Release();
        this.#gameClient.Release();
        this.#gameClient = null;
    }
    #SendMessageToHost(msg, transmissionMode) {
        // Note the transmission mode of an empty string (used for local messages not sent over
        // the network) should never arrive here, but the type allows it, so explicitly swap it
        // for transmission mode "o" to make TypeScript validate the call to sendPeerMessage().
        if (transmissionMode === "")
            transmissionMode = "o";
        // Use the Multiplayer object to send a message over the network to the host.
        const Multiplayer = this.#runtime.objects.Multiplayer;
        Multiplayer.sendPeerMessage(Multiplayer.hostId, msg, transmissionMode);
    }
    // Called when a message is received from the host over the network.
    #HandleHostMessage(e) {
        const msg = e.message; // note easiest way to read unknown JSON is as 'any' type
        // Handle the "start" message specially, once only. When it's received, resolve the start promise.
        // This makes sure both the host and peer are loaded and ready to proceed.
        if (msg["type"] === "start") {
            this.#OnHostStart();
        }
        else {
            // All other messages are directed to GameClient.
            this.#gameClient.HandleGameServerMessage(msg);
        }
    }
    #OnHostStart() {
        // When the host sends a "start" message, resolve the promise that is being awaited
        // in Init() so the game continues loading, and stop the timer that is sending ready messages.
        if (this.#startResolve) // only handle once
         {
            clearInterval(this.#readyTimerId);
            this.#startResolve();
            this.#startResolve = null;
        }
    }
    #OnPeerDisconnect() {
        // Show a disconnected message. TODO: this should probably be handled differently
        // if supporting more than 2 players
        this.#gameClient.OnDisconnected();
    }
}
