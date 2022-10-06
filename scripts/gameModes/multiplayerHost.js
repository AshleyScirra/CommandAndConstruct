
import { GameClient } from "../gameClient/gameClient.js";
import { MultiEventHandler } from "../utils/multiEventHandler.js";

// This class manages a multiplayer host's game. It runs a local copy of GameServer and also
// communicates with other players over the network.
export class GameModeMultiplayerHost {

	// Private fields
	#runtime;					// Construct runtime
	#gameClient;				// The local player's GameClient
	#gameServerMessagePort;		// The MessagePort for communicating with the local GameServer
	#messageMap;				// Map of message type -> handler function
	#eventHandlers;				// MultiEventHandler
	
	#peerReadyResolve;			// for a promise that resolves when peer sends "ready" message
	
	constructor(runtime)
	{
		this.#runtime = runtime;
		
		// Create map of message types that can be received from GameServer
		// and the function to call to handle each of them.
		this.#messageMap = new Map([
			["create-initial-state", e => this.#OnCreateInitialState(e)],
			["state-update", e => this.#OnStateUpdate(e)]
		]);
		
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

		// Post an init message to the worker to tell it to initialize.
		this.#SendMessageToGameServer({
			"type": "init"
		});

		// Create the game client which manages the local game state.
		// Also pass it the SendMessageToGameServer function for messaging.
		// Note that the multiplayer host is always player 0.
		this.#gameClient = new GameClient(this.#runtime, (m => this.#LocalSendMessageToGameServer(m)), 0);
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
	// The message is usually forwarded on to GameServer.
	#HandlePeerMessage(e)
	{
		const msg = e.message;
		
		// Handle the "ready" message specially, once only. When it's received, resolve the ready promise.
		// This makes sure both the host and peer are loaded and ready to proceed.
		if (msg["type"] === "ready")
		{
			if (this.#peerReadyResolve)
			{
				this.#peerReadyResolve();
				this.#peerReadyResolve = null;		// don't do this again
				
				// To acknowledge the peer is ready, send back a "start" message to the peer.
				this.#runtime.objects.Multiplayer.sendPeerMessage(e.fromId, {
					"type": "start"
				});
			}
		}
		else	// all other messages
		{
			// Tag the message as having come from player 1, i.e. the only other peer.
			// (TODO: support for more players)
			msg["player"] = 1;

			this.#SendMessageToGameServer(msg);
		}
	}
	
	// Called when the local GameClient wants to send a message to GameServer.
	// Tag it with the local player number and post to the worker.
	#LocalSendMessageToGameServer(msg)
	{
		msg["player"] = this.#gameClient.GetPlayer();
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
		// Look up the function to call for this message type in the message map.
		const data = e.data;
		const messageType = data["type"];
		const handlerFunc = this.#messageMap.get(messageType);

		if (handlerFunc)
		{
			// Call the message handler function with the provided data.
			handlerFunc(data);
		}
		else
		{
			// Messages should always have a handler, so log an error if it's not found.
			console.error(`No message handler for message from GameServer type '${messageType}'`);
		}
	}
	
	#OnCreateInitialState(data)
	{
		this.#gameClient.CreateInitialState(data);
		
		// Relay this message over the network to connected peers with reliable ordered transmission.
		this.#runtime.objects.Multiplayer.hostBroadcastMessage(null, data, "o");
	}
	
	#OnStateUpdate(data)
	{
		this.#gameClient.OnStateUpdate(data["arrayBuffer"]);
		
		// Relay this message over the network to connected peers as a binary message
		// with unreliable transmission, as it's a streaming update.
		this.#runtime.objects.Multiplayer.hostBroadcastMessage(null, data["arrayBuffer"], "u");
	}
	
}