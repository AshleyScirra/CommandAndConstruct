
import { MovableUnitPlatform } from "./movableUnitPlatform.js";
import { UnitTurret } from "./unitTurret.js";
import * as MathUtils from "../utils/mathUtils.js";

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

// For delta updates, a byte is sent with a series of bits set to indicate
// which values have changed. These flags are defined here.
const FLAG_CHANGED_SPEED =				 (1 << 0);
const FLAG_CHANGED_PLATFORM_ANGLE =		 (1 << 1);
const FLAG_CHANGED_TURRET_OFFSET_ANGLE = (1 << 2);

// A Unit represents any static or movable unit in the game
export class Unit {
	
	// Private fields
	#gameServer;		// reference to GameServer
	#id = -1;			// unique ID for this unit (determined in constructor)
	
	#player = 0;		// Which player this unit belongs to
	
	#platform;			// unit platform
	#turret;			// unit turret
	
	#health = 100;		// unit health - unit is destroyed if it reaches 0
	
	// For delta updates, this value is sent as a byte with bits set according to which
	// values for the unit have changed in the last tick.
	#deltaChangeFlags = 0;
	
	constructor(gameServer, player, x, y, angle)
	{
		this.#gameServer = gameServer;
		this.#id = GetNewUnitId(gameServer);
		this.#player = player;
		
		// Create unit platform, hard-coded as a movable one for now (TODO: different types)
		const platformObjectData = this.#gameServer.GetObjectData("TankPlatform");
		this.#platform = new MovableUnitPlatform(this, platformObjectData, x, y, angle);
		
		// Create unit turret. Note refer to the platform's image point for the location
		// of the turret as an offset from the platform's origin.
		const [turretX, turretY] = platformObjectData.GetImagePoint();
		this.#turret = new UnitTurret(this, turretX, turretY);
	}
	
	Release()
	{
		this.#platform.Release();
		this.#turret.Release();
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
	
	ReduceHealth(amount)
	{
		this.#health -= amount;
		
		// When the health reaches 0, destroy the unit.
		if (this.#health <= 0)
			this.GetGameServer().DestroyUnit(this);
	}
	
	Tick(dt)
	{
		this.#platform.Tick(dt);
		this.#turret.Tick(dt);
	}
	
	// Called by GameServer when it's time to write a full update for this unit.
	// This includes complete details about the unit.
	WriteFullUpdate(dataView, pos)
	{
		// Write the unit ID
		dataView.setUint16(pos, this.GetId());
		pos += 2;
		
		// Write the player number as a byte.
		dataView.setUint8(pos, this.GetPlayer());
		pos += 1;

		// Write the X and Y position as uint16s
		const platform = this.GetPlatform();
		const [x, y] = platform.GetPosition();
		dataView.setUint16(pos, x);
		pos += 2;
		dataView.setUint16(pos, y);
		pos += 2;

		// Write the speed as a uint16,
		dataView.setUint16(pos, platform.GetSpeed());
		pos += 2;

		// Write the platform angle as a uint16.
		dataView.setUint16(pos, MathUtils.AngleToUint16(platform.GetAngle()));
		pos += 2;

		// Write the turret offset angle as a uint16.
		const turret = this.GetTurret();
		dataView.setUint16(pos, MathUtils.AngleToUint16(turret.GetAngle()));
		pos += 2;
		
		// Tell the turret a full update was written, since it tracks the last sent angle.
		turret.OnSentFullUpdate();
		
		return pos;
	}
	
	// For sending delta updates, the unit keeps track of which values have changed over the
	// past tick, accumulating flags to indicate which kinds of value changed. Any time a
	// value changes it also adds this unit to the GameServer list of units pending a delta update.
	MarkPlatformSpeedChanged()
	{
		this.#deltaChangeFlags |= FLAG_CHANGED_SPEED;
		this.#AddForDeltaUpdate();
	}
	
	MarkPlatformAngleChanged()
	{
		this.#deltaChangeFlags |= FLAG_CHANGED_PLATFORM_ANGLE;
		this.#AddForDeltaUpdate();
	}
	
	MarkTurretOffsetAngleChanged()
	{
		this.#deltaChangeFlags |= FLAG_CHANGED_TURRET_OFFSET_ANGLE;
		this.#AddForDeltaUpdate();
	}
	
	#AddForDeltaUpdate()
	{
		this.GetGameServer().AddUnitForDeltaUpdate(this);
	}
	
	// Called by GameServer when it's time to write a delta update for this unit.
	// This only writes changed values.
	WriteDeltaUpdate(dataView, pos)
	{
		// Write the unit ID.
		dataView.setUint16(pos, this.GetId());
		pos += 2;
		
		// Write the delta change flags as a byte.
		dataView.setUint8(pos, this.#deltaChangeFlags);
		pos += 1;
		
		// Write each value that has changed. Note the order used here must match
		// on both the server and the client.
		if ((this.#deltaChangeFlags & FLAG_CHANGED_SPEED) !== 0)
		{
			dataView.setUint16(pos, this.GetPlatform().GetSpeed());
			pos += 2;
		}
		
		if ((this.#deltaChangeFlags & FLAG_CHANGED_PLATFORM_ANGLE) !== 0)
		{
			dataView.setUint16(pos, MathUtils.AngleToUint16(this.GetPlatform().GetAngle()));
			pos += 2;
		}
		
		if ((this.#deltaChangeFlags & FLAG_CHANGED_TURRET_OFFSET_ANGLE) !== 0)
		{
			dataView.setUint16(pos, MathUtils.AngleToUint16(this.GetTurret().GetAngle()));
			pos += 2;
		}
		
		// Reset all the delta change flags now they have been used.
		this.#deltaChangeFlags = 0;
		
		return pos;
	}
}