
// The GameClient class is created while on a game layout, and handles representing the
// state of the game for the runtime. Note that the authoritative state of the game lives
// on GameServer, so the GameClient is mostly responsible for updating the state of the
// game to match the server state, and sending player inputs to the server.
export class GameClient {

	// Private fields
	#runtime;			// Construct runtime
	
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
		// For each provided unit, just create the TankPlatform object.
		// TODO: client-side class for units
		for (const unitData of data["units"])
		{
			this.#CreateInitialUnit(unitData);
		}
	}
	
	// Create a single unit from data for CreateInitialState()
	#CreateInitialUnit(unitData)
	{
		const x = unitData["x"];
		const y = unitData["y"];
		
		this.#runtime.objects.TankPlatform.createInstance(0 /* layer */, x, y);
	}
}
