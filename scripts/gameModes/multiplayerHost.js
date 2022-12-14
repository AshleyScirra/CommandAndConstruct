
import { GameClient } from "../gameClient/gameClient.js";
import { MultiEventHandler } from "../utils/multiEventHandler.js";

// This class manages a multiplayer host's game. It runs a local copy of GameServer and also
// communicates with other players over the network.
export class GameModeMultiplayerHost {

	// Private fields
	#runtime;					// Construct runtime
	#gameClient;				// The local player's GameClient
	#gameServerMessagePort;		// The MessagePort for communicating with the local GameServer
	#eventHandlers;				// MultiEventHandler
	
	#otherPeerId;				// Peer ID of the other player (TODO: support for more players)
	#peerReadyResolve;			// for a promise that resolves when peer sends "ready" message
	
	constructor(runtime)
	{
		this.#runtime = runtime;
		
		this.#eventHandlers = new MultiEventHandler([
			// Listen for incoming messages from peers over the network.
			[this.#runtime.objects.Multiplayer, "message", e => this.#HandlePeerMessage(e)]
		]);
	}
	
	async Init()
	{
		// Start up the game server web worker.
		this.#gameServerMessagePort = await this.#runtime.createWorker("gameServer/serverWorker.js", {
			name: "GameServer",
			type: "module"
		});

		// Listen for messages received from the worker.
		this.#gameServerMessagePort.onmessage = (e => this.#HandleGameServerMessage(e));
		
		// Wait for the peer to send a "ready" message. The peer sends this regularly to make sure
		// it arrives no matter how long the host takes to load.
		await new Promise(resolve => this.#peerReadyResolve = resolve);

		// Create the game client which manages the local game state.
		// Also pass it the SendMessageToGameServer function for messaging.
		// Note that the multiplayer host is always player 0.
		this.#gameClient = new GameClient(this.#runtime, ((m, t) => this.#LocalSendMessageToGameServer(m, t)), 0);
		
		// Post an init message to the worker to tell it to initialize, and provide data
		// about the game units such as their size and collision polygons.
		this.#SendMessageToGameServer({
			"type": "init",
			"constructObjectData": this.#gameClient.GetConstructObjectData()
		});
		
		// Initialise the GameClient now it's sent the game data.
		this.#gameClient.Init();
	}
	
	Release()
	{
		this.#eventHandlers.Release();
		
		// Terminate the GameServer web worker.
		this.#LocalSendMessageToGameServer({
			"type": "release"
		});
		
		this.#gameClient.Release();
		this.#gameClient = null;
	}
	
	// Called when receiving a message over the network from a peer.
	#HandlePeerMessage(e)
	{
		const msg = e.message;
		
		// Handle the "ready" message specially.
		if (msg["type"] === "ready")
		{
			this.#OnPeerReady(e.fromId);
		}
		else	// all other messages
		{
			// Tag the message as having come from player 1, i.e. the only other peer,
			// and forward on to GameServer in the worker. (TODO: support for more players)
			msg["player"] = 1;
			msg["transmissionMode"] = e.transmissionMode;

			this.#SendMessageToGameServer(msg);
		}
	}
	
	// When the peer's "ready" message is received, resolve the ready promise.
	// This makes sure both the host and peer are loaded and ready to proceed.
	#OnPeerReady(fromId)
	{
		this.#otherPeerId = fromId;				// save ID of other player (TODO: more players)
		
		if (this.#peerReadyResolve)				// handle this once only
		{
			this.#peerReadyResolve();
			this.#peerReadyResolve = null;

			// To acknowledge the peer is ready, send back a "start" message to the peer.
			this.#runtime.objects.Multiplayer.sendPeerMessage(fromId, {
				"type": "start"
			});
		}
	}
	
	// Called when the local GameClient wants to send a message to GameServer.
	// Tag it with the local player number and transmission mode and post to the worker.
	#LocalSendMessageToGameServer(msg, transmissionMode)
	{
		msg["player"] = this.#gameClient.GetPlayer();
		msg["transmissionMode"] = transmissionMode;
		
		this.#SendMessageToGameServer(msg);
	}
	
	#SendMessageToGameServer(msg)
	{
		// Post the message to the GameServer worker.
		this.#gameServerMessagePort.postMessage(msg);
	}
	
	// Called when receiving a message from the GameServer worker.
	#HandleGameServerMessage(e)
	{
		const data = e.data;
		const message = data["message"];
		const transmissionMode = data["transmissionMode"];
		const forPlayer = data["forPlayer"];
		
		if (forPlayer === null)		// message for all players
		{
			// Handle this message with the local game client.
			this.#gameClient.HandleGameServerMessage(message);

			// Relay this message over the network to connected peers.
			// Use the transmission mode specified by GameServer.
			this.#runtime.objects.Multiplayer.hostBroadcastMessage(null, message, transmissionMode);
		}
		else if (forPlayer === 0)
		{
			// Message for host only: handle with own GameClient
			this.#gameClient.HandleGameServerMessage(message);
		}
		else if (forPlayer === 1)
		{
			// Message for remote player only: send over network
			this.#runtime.objects.Multiplayer.sendPeerMessage(this.#otherPeerId, message, transmissionMode);
		}
		else
		{
			// TODO: support for more than 2 players.
			console.error(`Unexpected forPlayer value '${forPlayer}'`);
		}
	}
}