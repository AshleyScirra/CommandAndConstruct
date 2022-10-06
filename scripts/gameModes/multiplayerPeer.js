
import { GameClient } from "../gameClient/gameClient.js";
import { MultiEventHandler } from "../utils/multiEventHandler.js";

// This class manages a multiplayer peers's game. It does not run a GameServer as that is run by the host.
// Instead it only creates a GameClient and communicates with the host over the network.
export class GameModeMultiplayerPeer {

	// Private fields
	#runtime;					// Construct runtime
	#gameClient;				// The local player's GameClient
	#messageMap;				// Map of message type -> handler function
	#eventHandlers;				// MultiEventHandler
	
	#startResolve;				// for a promise that resolves when host sends "start" message
	#readyTimerId = -1;			// for regularly sending "ready" messages to host
	
	constructor(runtime)
	{
		this.#runtime = runtime;
		
		// Create map of message types that can be received from GameServer
		// and the function to call to handle each of them.
		this.#messageMap = new Map([
			["start", () => this.#OnHostStart()],
			["create-initial-state", e => this.#OnCreateInitialState(e)],
			["state-update", e => this.#OnStateUpdate(e)]
		]);
		
		this.#eventHandlers = new MultiEventHandler([
			// Listen for incoming messages from the host over the network.
			[this.#runtime.objects.Multiplayer, "message", e => this.#HandleHostMessage(e)]
		]);
	}
	
	async Init()
	{
		// Create the game client which manages the local game state.
		// Also pass it the SendMessageToHost function for messaging.
		// Note that the multiplayer peer is always player 1. (TODO: support for more players)
		this.#gameClient = new GameClient(this.#runtime, (m => this.#SendMessageToHost(m)), 1);
		
		// The host could take a lot longer to load for some reason, and not yet be listening for
		// messages. We don't know when the host will be ready, so send ready messages every 250ms
		// until we get back a "start" message.
		await new Promise(resolve =>
		{
			this.#startResolve = resolve;
			
			this.#readyTimerId = setInterval(() => this.#SendMessageToHost({
				"type": "ready"
			}), 250);
		});
	}
	
	Release()
	{
		this.#eventHandlers.Release();
		
		this.#gameClient.Release();
		this.#gameClient = null;
	}
	
	#SendMessageToHost(msg)
	{
		// Use the Multiplayer object to send a message over the network to the host.
		const Multiplayer = this.#runtime.objects.Multiplayer;
		Multiplayer.sendPeerMessage(Multiplayer.hostId, msg);
	}
	
	#HandleHostMessage(e)
	{
		const data = e.message;
		
		// The host sends game state updates as binary ArrayBuffers.
		// If the message is an ArrayBuffer, treat it as a state update.
		if (data instanceof ArrayBuffer)
		{
			this.#OnStateUpdate(data);
		}
		else		// otherwise treat as JSON message
		{
			// Look up the function to call for this message type in the message map.
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
	}
	
	#OnHostStart()
	{
		// When the host sends a "start" message, resolve the promise that is being awaited
		// in Init() so the game continues loading, and stop the timer that is sending ready messages.
		if (this.#startResolve)		// only handle once
		{
			clearInterval(this.#readyTimerId);
			this.#startResolve();
			this.#startResolve = null;
		}
	}
	
	#OnCreateInitialState(data)
	{
		this.#gameClient.CreateInitialState(data);
	}
	
	#OnStateUpdate(arrayBuffer)
	{
		this.#gameClient.OnStateUpdate(arrayBuffer);
	}
	
}
