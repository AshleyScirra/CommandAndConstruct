
import { GameServer } from "../gameServer.js";
import { MovableUnitPlatform } from "./movableUnitPlatform.js";
import { UnitTurret } from "./unitTurret.js";
import * as MathUtils from "../utils/mathUtils.js";

// Whether server sends extra debug state for units for development purposes only.
// This must match the value specified on the client and should be turned off for releases.
const ENABLE_DEBUG_STATE = true;

// Unit IDs are sent as a uint16 value to save on bandwidth, allowing for around 65k
// active units in the entire game at any one time, which should (?!) be enough.
// An incrementing value is used to assign IDs, but it must wrap round once it reaches
// the limit of a uint16, at which point IDs may still be in use by older units.
// Therefore it increments the value enough to skip over any in-use IDs.
let nextId = 0;					// the ID to assign the next unit

function GetNewUnitId(gameServer: GameServer)
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
const FLAG_CHANGED_POSITION =			 (1 << 0);
const FLAG_CHANGED_SPEED =				 (1 << 1);
const FLAG_CHANGED_ACCELERATION =		 (1 << 2);
const FLAG_CHANGED_PLATFORM_ANGLE =		 (1 << 3);
const FLAG_CHANGED_TURRET_OFFSET_ANGLE = (1 << 4);

const FLAG_CHANGED_DEBUG_STATE =		 (1 << 7);		// for development purposes only

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
	
	// For development purposes only: an extra byte sent to clients for debug info.
	#debugState = 0;
	
	constructor(gameServer: GameServer, player: number, x: number, y: number, angle: number)
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
	
	ReduceHealth(amount: number)
	{
		this.#health -= amount;
		
		// When the health reaches 0, destroy the unit.
		if (this.#health <= 0)
			this.GetGameServer().DestroyUnit(this);
	}
	
	Tick(dt: number)
	{
		this.#platform.Tick(dt);
		this.#turret.Tick(dt);
	}
	
	// Called by GameServer when it's time to write a full update for this unit.
	// This includes complete details about the unit.
	WriteFullUpdate(dataView: DataView, pos: number)
	{
		// Write the unit ID
		dataView.setUint16(pos, this.GetId());
		pos += 2;
		
		// Write the player number as a byte.
		dataView.setUint8(pos, this.GetPlayer());
		pos += 1;
		
		// Write the debug state as a byte if enabled for development.
		if (ENABLE_DEBUG_STATE)
		{
			dataView.setUint8(pos, this.#debugState);
			pos += 1;
		}

		// Write the X and Y position as uint16s
		const platform = this.GetPlatform();
		const [x, y] = platform.GetPosition();
		dataView.setUint16(pos, x);
		pos += 2;
		dataView.setUint16(pos, y);
		pos += 2;

		// Write the speed as int16 (can go negative)
		dataView.setInt16(pos, platform.GetSpeed());
		pos += 2;
		
		// Write the acceleration as int16 (can go negative)
		dataView.setInt16(pos, platform.GetAcceleration());
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
		
		// Clear the delta change flags, as everything has now been transmitted in a full update.
		this.#deltaChangeFlags = 0;
 		
		return pos;
	}
	
	// For sending delta updates, the unit keeps track of which values have changed over the
	// past tick, accumulating flags to indicate which kinds of value changed. Any time a
	// value changes it also adds this unit to the GameServer list of units pending a delta update.
	MarkPositionDelta()
	{
		this.#deltaChangeFlags |= FLAG_CHANGED_POSITION;
		this.#AddForDeltaUpdate();
	}
	
	MarkPlatformSpeedChanged()
	{
		this.#deltaChangeFlags |= FLAG_CHANGED_SPEED;
		this.#AddForDeltaUpdate();
	}
	
	MarkPlatformAccelerationChanged()
	{
		this.#deltaChangeFlags |= FLAG_CHANGED_ACCELERATION;
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
	
	#MarkDebugStateChanged()
	{
		this.#deltaChangeFlags |= FLAG_CHANGED_DEBUG_STATE;
		this.#AddForDeltaUpdate();
	}
	
	// The debug state is an extra byte sent to clients for displaying debug info
	// during development.
	SetDebugState(n: number)
	{
		n = MathUtils.Clamp(Math.floor(n), 0, 255);
		if (this.#debugState === n)
			return;		// no change
		
		this.#debugState = n;
		this.#MarkDebugStateChanged();
	}
	
	#AddForDeltaUpdate()
	{
		this.GetGameServer().AddUnitForDeltaUpdate(this);
	}
	
	// Called by GameServer when it's time to write a delta update for this unit.
	// This only writes changed values.
	WriteDeltaUpdate(dataView: DataView, pos: number)
	{
		// Write the unit ID.
		dataView.setUint16(pos, this.GetId());
		pos += 2;
		
		// Write the delta change flags as a byte.
		dataView.setUint8(pos, this.#deltaChangeFlags);
		pos += 1;
		
		// Write each value that has changed. Note the order used here must match
		// on both the server and the client.
		if ((this.#deltaChangeFlags & FLAG_CHANGED_POSITION) !== 0)
		{
			// Write the X and Y position as uint16s
			const platform = this.GetPlatform();
			const [x, y] = platform.GetPosition();
			dataView.setUint16(pos, x);
			pos += 2;
			dataView.setUint16(pos, y);
			pos += 2;
		}
		
		if ((this.#deltaChangeFlags & FLAG_CHANGED_SPEED) !== 0)
		{
			dataView.setInt16(pos, this.GetPlatform().GetSpeed());
			pos += 2;
		}
		
		if ((this.#deltaChangeFlags & FLAG_CHANGED_ACCELERATION) !== 0)
		{
			dataView.setInt16(pos, this.GetPlatform().GetAcceleration());
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
		
		if (ENABLE_DEBUG_STATE && (this.#deltaChangeFlags & FLAG_CHANGED_DEBUG_STATE) !== 0)
		{
			dataView.setUint8(pos, this.#debugState);
			pos += 1;
		}
		
		// Reset all the delta change flags now they have been used.
		this.#deltaChangeFlags = 0;
		
		return pos;
	}
}