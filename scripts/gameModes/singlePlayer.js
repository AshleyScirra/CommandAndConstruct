
import { GameClient } from "../gameClient/gameClient.js";

// This class manages a single player game. This means hosting a local copy of GameServer,
// and does not involve any networking.
export class GameModeSinglePlayer {

	// Private fields
	#runtime;					// Construct runtime
	#gameClient;				// The local player's GameClient
	#gameServerMessagePort;		// The MessagePort for communicating with the local GameServer
	
	constructor(runtime)
	{
		this.#runtime = runtime;
	}
	
	async Init()
	{
		// Start up the game server web worker.
		this.#gameServerMessagePort = await this.#runtime.createWorker("gameServer/serverWorker.js", {
			name: "GameServer",
			type: "module"
		});

		// Listen for messages received from the GameServer worker and pass them to GameClient.
		this.#gameServerMessagePort.onmessage = (e => this.#HandleGameServerMessage(e));
		
		// Create the game client which manages the local game state.
		// Also pass it the SendMessageToGameServer function for messaging.
		// Note in single player mode, the player is always player 0.
		this.#gameClient = new GameClient(this.#runtime, ((m, t) => this.#SendMessageToGameServer(m, t)), 0);

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
		// Terminate the GameServer web worker.
		this.#SendMessageToGameServer({
			"type": "release"
		});
		
		this.#gameClient.Release();
		this.#gameClient = null;
	}
	
	// Messages received from GameServer are directly handled by GameClient.
	#HandleGameServerMessage(e)
	{
		const data = e.data;
		const message = data["message"];
		
		this.#gameClient.HandleGameServerMessage(message);
	}
	
	// Messages sent to GameServer are directly posted to it in the worker.
	#SendMessageToGameServer(msg, transmissionMode)
	{
		// Also attach the player the message is from and the transmission mode.
		msg["player"] = this.#gameClient.GetPlayer();
		msg["transmissionMode"] = transmissionMode;
		
		this.#gameServerMessagePort.postMessage(msg);
	}
}