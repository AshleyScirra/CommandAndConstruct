
import { ClientUnit } from "../clientUnits/clientUnit.js";
import { SelectionManager } from "./selectionManager.js";

// The GameClient class is created while on a game layout, and handles representing the
// state of the game for the runtime. Note that the authoritative state of the game lives
// on GameServer, so the GameClient is mostly responsible for updating the state of the
// game to match the server state, and sending player inputs to the server.
export class GameClient {

	// Private fields
	#runtime;						// Construct runtime
	#sendMessageFunc;				// SendMessageToGameServer function
	#allUnits = new Set();			// Set of all created units
	
	#selectionManager;				// SelectionManager class
	
	constructor(runtime, sendMessageFunc)
	{
		this.#runtime = runtime;
		this.#sendMessageFunc = sendMessageFunc;
		
		// Create SelectionManager which handles unit selections.
		this.#selectionManager = new SelectionManager(this);
	}
	
	Release()
	{
		this.#selectionManager.Release();
	}
	
	GetRuntime()
	{
		return this.#runtime;
	}
	
	// Provide a GameClient method to send a message to GameServer.
	SendToServer(msg)
	{
		this.#sendMessageFunc(msg);
	}
	
	// Called when GameServer sends the initial state of the game.
	// The client needs to create objects to represent the server state.
	CreateInitialState(data)
	{
		for (const unitData of data["units"])
		{
			// Create a ClientUnit from each unit data.
			const clientUnit = ClientUnit.CreateFromInitialData(this, unitData);
			this.#allUnits.add(clientUnit);
		}
	}
	
	GetSelectionManager()
	{
		return this.#selectionManager;
	}
	
	// Iterates all units in the game.
	allUnits()
	{
		return this.#allUnits.values();
	}
	
	// Called when the player commands some selected units to move to a position.
	MoveUnits(unitsArray, x, y)
	{
		// TODO: send a message to GameServer to handle the instruction.
		this.SendToServer({
			"type": "move-units",
			"unitIds": unitsArray.map(u => u.GetId()),
			"position": [x, y]
		});
	}
}
