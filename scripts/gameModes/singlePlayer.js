
import { GameClient } from "../gameClient/gameClient.js";

// This class manages a single player game. This means hosting a local copy of GameServer,
// and does not involve any networking.
export class GameModeSinglePlayer {

	// Private fields
	#runtime;
	#gameClient;				// The local player's GameClient
	#gameServerMessagePort;		// The MessagePort for communicating with the local GameServer
	#messageMap;				// Map of message type -> handler function
	
	constructor(runtime)
	{
		this.#runtime = runtime;
		
		// Create map of message types that can be received from GameServer
		// and the function to call to handle each of them.
		this.#messageMap = new Map([
			["create-initial-state", e => this.#OnCreateInitialState(e)],
			["state-update", e => this.#OnStateUpdate(e)]
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

		// Post an init message to the worker to tell it to initialize.
		this.#SendMessageToGameServer({
			"type": "init"
		});

		// Create the game client which manages the other end of the game state.
		// Also pass it the SendMessageToGameServer function for messaging.
		// Note in single player mode, the player is always player 0.
		this.#gameClient = new GameClient(this.#runtime, (m => this.#SendMessageToGameServer(m)), 0);
	}
	
	Release()
	{
		this.#gameClient.Release();
		this.#gameClient = null;

		// Terminate the GameServer web worker.
		this.#SendMessageToGameServer({
			"type": "release"
		});
	}
	
	#SendMessageToGameServer(msg)
	{
		this.#gameServerMessagePort.postMessage(msg);
	}
	
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
	}
	
	#OnStateUpdate(data)
	{
		this.#gameClient.OnStateUpdate(data["arrayBuffer"]);
	}
}