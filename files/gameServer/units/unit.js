
import { MovableUnitPlatform } from "./movableUnitPlatform.js";
import { UnitTurret } from "./unitTurret.js";

// Unit IDs are sent as a uint16 value to save on bandwidth, allowing for around 65k
// active units in the entire game at any one time, which should (?!) be enough.
// An incrementing value is used to assign IDs, but it must wrap round once it reaches
// the limit of a uint16, at which point IDs may still be in use by older units.
// Therefore it increments the value enough to skip over any in-use IDs.
let nextId = 0;					// the ID to assign the next unit

function GetNewUnitId(gameServer)
{
	// Keep incrementing the ID so long as the ID is still in use.
	do {
		nextId++;
		
		// Wrap around if reached the limit of uint16
		if (nextId === 65536)
			nextId = 0;
	}
	while (gameServer.HasUnitId(nextId));
	
	return nextId;
}

// A Unit represents any static or movable unit in the game
export class Unit {
	
	// Private fields
	#gameServer;		// reference to GameServer
	#id = -1;			// unique ID for this unit (determined in constructor)
	
	#player = 0;		// Which player this unit belongs to
	
	#platform;			// unit platform
	#turret;			// unit turret
	
	constructor(gameServer, player, x, y)
	{
		this.#gameServer = gameServer;
		this.#id = GetNewUnitId(gameServer);
		this.#player = player;
		
		// Create unit platform, hard-coded as a movable one for now (TODO: different types)
		this.#platform = new MovableUnitPlatform(this, x, y);
		
		// Create unit turret. Note refer to the platform's image point for the location
		// of the turret as an offset from the platform's origin.
		const platformObjectData = this.#gameServer.GetObjectData("TankPlatform");
		const [turretX, turretY] = platformObjectData.GetImagePoint();
		this.#turret = new UnitTurret(this, turretX, turretY);
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
	
	GetTurret()
	{
		return this.#turret;
	}
	
	Tick(dt)
	{
		this.#platform.Tick(dt);
		this.#turret.Tick(dt);
	}
}