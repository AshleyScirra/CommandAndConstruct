
import Globals from "../globals.js";

// This class handles receiving messages from the GameServer (whether it's hosted locally or receiving
// messages over the network). It calls the appropriate GameClient methods for each message.
// This keeps all the message handling logic in its own class rather than cluttering GameClient.
export class GameClientMessageHandler {

	// Private fields
	#gameClient;				// reference to GameClient
	#messageMap;				// Map of message type -> handler function
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		// Create map of message types that can be received from GameServer
		// and the function to call to handle each of them.
		this.#messageMap = new Map([
			["create-initial-state", m => this.#OnCreateInitialState(m)]
		]);
	}
	
	HandleGameServerMessage(msg)
	{
		// The host sends game state updates as binary ArrayBuffers.
		// If the message is an ArrayBuffer, treat it as a state update.
		if (msg instanceof ArrayBuffer)
		{
			this.#OnStateUpdate(msg);
		}
		else		// otherwise treat as JSON message
		{
			// Look up the function to call for this message type in the message map.
			const messageType = msg["type"];
			const handlerFunc = this.#messageMap.get(messageType);

			if (handlerFunc)
			{
				// Call the message handler function with the provided message.
				handlerFunc(msg);
			}
			else
			{
				// Messages should always have a handler, so log an error if it's not found.
				console.error(`No message handler for message from GameServer type '${messageType}'`);
			}
		}
	}
	
	#OnCreateInitialState(msg)
	{
		this.#gameClient.CreateInitialState(msg);
	}
	
	#OnStateUpdate(arrayBuffer)
	{
		this.#gameClient.OnStateUpdate(arrayBuffer);
	}
}