
import { MovableUnitPlatform } from "./movableUnitPlatform.js";

let nextId = 0;		// the ID to assign the next created unit

// A Unit represents any static or movable unit in the game
export class Unit {
	
	// Private fields
	#gameServer;		// reference to GameServer
	#id = nextId++;		// assign incrementing ID to every unit created
	#platform;			// unit platform
	
	constructor(gameServer, x, y)
	{
		this.#gameServer = gameServer;
		
		// Create unit platform, hard-coded as a movable one for now (TODO: different types)
		this.#platform = new MovableUnitPlatform(gameServer, x, y);
	}
	
	// Get data for the "create-initial-state" message
	GetInitData()
	{
		const [x, y] = this.#platform.GetPosition();
		
		return {
			"id": this.#id,
			"x": x,
			"y": y
		};
	}
}