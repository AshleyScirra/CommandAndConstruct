
import { ClientUnit } from "../clientUnits/clientUnit.js";

// The GameClient class is created while on a game layout, and handles representing the
// state of the game for the runtime. Note that the authoritative state of the game lives
// on GameServer, so the GameClient is mostly responsible for updating the state of the
// game to match the server state, and sending player inputs to the server.
export class GameClient {

	// Private fields
	#runtime;				// Construct runtime
	#allUnits = new Set();	// Set of all created units
	
	constructor(runtime)
	{
		this.#runtime = runtime;
	}
	
	Release()
	{
		// TODO
	}
	
	GetRuntime()
	{
		return this.#runtime;
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
}
