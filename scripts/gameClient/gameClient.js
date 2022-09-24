
// The GameClient class is created while on a game layout, and handles representing the
// state of the game for the runtime. Note that the authoritative state of the game lives
// on GameServer, so the GameClient is mostly responsible for updating the state of the
// game to match the server state, and sending player inputs to the server.
export class GameClient {
	constructor(runtime)
	{
		console.log("Creating GameClient");
		
		this._runtime = runtime;
	}
	
	GetRuntime()
	{
		return this._runtime;
	}
	
	Release()
	{
		console.log("Releasing GameClient");
	}
}
