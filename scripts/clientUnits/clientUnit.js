
import { ClientPlatform } from "./clientPlatform.js";

// The ClientUnit class represents a unit in GameClient.
// Its main job is to synchronise state to match what is happening on GameServer,
// which holds the real Unit class that represents the authoritative state of the game.
export class ClientUnit {

	// Private fields
	#gameClient;				// reference to GameClient unit belongs to
	#id = -1;					// unique ID of this unit
	#platform;					// ClientPlatform for this unit's platform
	
	constructor(gameClient, id)
	{
		this.#gameClient = gameClient;
		this.#id = id;
	}
	
	GetRuntime()
	{
		return this.#gameClient.GetRuntime();
	}
	
	// Create a single client unit for the "create-initial-state" message
	static CreateFromInitialData(gameClient, unitData)
	{
		const id = unitData["id"];
		const x = unitData["x"];
		const y = unitData["y"];
		
		const unit = new ClientUnit(gameClient, id);
		unit.#platform = new ClientPlatform(unit, x, y);
		return unit;
	}
}