
import { MovableUnitPlatform } from "./movableUnitPlatform.js";

let nextId = 0;		// the ID to assign the next created unit

// A Unit represents any static or movable unit in the game
export class Unit {
	
	// Private fields
	#gameServer;		// reference to GameServer
	#id = nextId++;		// assign incrementing ID to every unit created
	
	#player = 0;		// Which player this unit belongs to
	
	#platform;			// unit platform
	
	constructor(gameServer, player, x, y)
	{
		this.#gameServer = gameServer;
		this.#player = player;
		
		// Create unit platform, hard-coded as a movable one for now (TODO: different types)
		this.#platform = new MovableUnitPlatform(this, x, y);
	}
	
	// Get data for the "create-initial-state" message
	GetInitData()
	{
		const [x, y] = this.#platform.GetPosition();
		
		return {
			"id": this.#id,
			"player": this.#player,
			"x": x,
			"y": y
		};
	}
	
	GetGameServer()
	{
		return this.#gameServer;
	}
	
	GetId()
	{
		return this.#id;
	}
	
	GetPlayer()
	{
		return this.#player;
	}
	
	GetPlatform()
	{
		return this.#platform;
	}
	
	Tick(dt)
	{
		this.#platform.Tick(dt);
	}
}