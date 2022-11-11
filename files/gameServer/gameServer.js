 
 import { ObjectData } from "./units/objectData.js";
 import { Unit } from "./units/unit.js";
 import { NetworkEvent } from "./networkEvents/networkEvents.js";
 import { KahanSum } from "./utils/kahanSum.js";
 import * as MathUtils from "./utils/mathUtils.js";
 
 // Number of ticks per second to run the server at,
 // and the equivalent value in milliseconds between ticks.
 const SERVER_TICK_RATE = 30;
 const SERVER_TICK_MS_INTERVAL = (1000 / SERVER_TICK_RATE);

 // "Magic number" that binary messages start with to verify it's an expected message.
 // This avoids things like fragmented packets trying to be read as a whole packet.
 const MAGIC_NUMBER = 0x63266321;	// "c&c!" in ASCII
 
 // The binary message types
 const MESSAGE_TYPE_UPDATE = 0;		// game state update
 const MESSAGE_TYPE_EVENTS = 1;		// list of events that have happened
 
 // The GameServer class represents the state of the game and runs the main game logic.
 // It runs in a Web Worker and communicates with clients by messaging - either local messages
 // for the local player or remote players over the network.
 export class GameServer {
 
 	// Private fields
	#sendMessageFunc;				// called by SendToRuntime()
	#allUnitsById = new Map();		// map of all units by id -> Unit
	#allProjectilesById = new Map(); // map of all active projectiles by id -> Projectile
	
	#tickTimerId = -1;				// timer ID for ticking GameServer
	#lastTickTimeMs = 0;			// clock time at last tick in ms
	#nextTickScheduledTimeMs = 0;	// time next tick ought to run at in ms
	#gameTime = new KahanSum();		// serves as the clock for the game in seconds
	
	#objectData = new Map();		// name -> ObjectData
	
	#networkEvents = [];			// array of NetworkEvents waiting to send over the network
	
	// A 256kb binary data buffer to use for sending binary updates to clients
	#dataArrayBuffer = new ArrayBuffer(262144);
	#dataView = new DataView(this.#dataArrayBuffer);
	
	#messageSequenceNumber = 0;		// an increasing number for every binary message
	
	// Level size
	#layoutWidth = 4000;
	#layoutHeight = 3000;
	
	#isGameOver = false;			// set to true once victory/defeat condition met
	
 	constructor(sendMessageFunc, constructObjectData)
	{
		// The function to send a message to the runtime is passed to the constructor.
		this.#sendMessageFunc = sendMessageFunc;
		
		// Read the object data passed from the runtime in to ObjectData classes.
		for (const entry of constructObjectData)
		{
			this.#objectData.set(entry["name"], new ObjectData(this, entry));
		}
		
		// Initialize a game.
		this.Init();
	}
	
	// Provide a GameServer method to send a message to the runtime for convenience.
	// This also attaches a transmission mode (reliable ordered, reliable unordered,
	// or unreliable) for the host to retransmit as, defaulting to reliable ordered.
	SendToRuntime(msg, transmissionMode, transferList)
	{
		this.#sendMessageFunc({
			"message": msg,
			"transmissionMode": transmissionMode || "o"
		}, transferList);
	}
	
	Init()
	{
		// Hard-code 8 starting units: four for player 0 and four for player 1.
		this._AddUnitAtPosition(0, 250, 400, 0);
		this._AddUnitAtPosition(0, 125, 600, 0);
		this._AddUnitAtPosition(0, 400, 600, 0);
		this._AddUnitAtPosition(0, 250, 800, 0);
		
		this._AddUnitAtPosition(1, 1920 - 250, 400, Math.PI);
		this._AddUnitAtPosition(1, 1920 - 125, 600, Math.PI);
		this._AddUnitAtPosition(1, 1920 - 400, 600, Math.PI);
		this._AddUnitAtPosition(1, 1920 - 250, 800, Math.PI);
		
		this.SendToRuntime({
			"type": "create-initial-state",
			"layoutSize": [this.#layoutWidth, this.#layoutHeight],
			"units": [...this.allUnits()].map(u => u.GetInitData())
		});
		
		// Start ticking the game
		this.#lastTickTimeMs = performance.now();
		this.#nextTickScheduledTimeMs = this.#lastTickTimeMs + SERVER_TICK_MS_INTERVAL;
		this.#Tick();
	}
	
	_AddUnitAtPosition(player, x, y, angle)
	{
		// Create a unit and add it to the units by ID map
		const unit = new Unit(this, player, x, y, angle);
		this.#allUnitsById.set(unit.GetId(), unit);
	}
	
	DestroyUnit(unit)
	{
		// Queue a network event to tell clients that the unit was destroyed.
		this.#networkEvents.push(new NetworkEvent.UnitDestroyed(unit.GetId()));
		
		// Remove the unit from the server.
		this.#allUnitsById.delete(unit.GetId());
	}
	
	// Iterates all units in the game, using the values of the units map.
	allUnits()
	{
		return this.#allUnitsById.values();
	}
	
	HasUnitId(id)
	{
		return this.#allUnitsById.has(id);
	}
	
	GetUnitById(id)
	{
		return this.#allUnitsById.get(id);
	}
	
	HasProjectileId(id)
	{
		return this.#allProjectilesById.has(id);
	}
	
	GetObjectData(name)
	{
		return this.#objectData.get(name);
	}
	
	GetGameTime()
	{
		return this.#gameTime.Get();
	}
	
	ClampToLayout(x, y)
	{
		return [MathUtils.Clamp(x, 0, this.#layoutWidth),
				MathUtils.Clamp(y, 0, this.#layoutHeight)];
	}
	
	MoveUnits(player, units)
	{
		// For each unit being commanded to move
		for (const u of units)
		{
			const id = u["id"];
			const x = u["x"];
			const y = u["y"];
			
			// Look up unit from its ID.
			const unit = this.GetUnitById(id);
			
			// Discard any units that cannot be found, just in case any synchronisation issue
			// means a client tried to move a unit ID that no longer exists on the server.
			// Also discard any units that aren't from the player who sent the message,
			// so even a hacked client can't command anyone else's units.
			if (!unit || unit.GetPlayer() !== player)
				continue;
			
			// Instruct the unit to move to the given position.
			unit.GetPlatform().MoveToPosition(x, y);
		}
	}
	
	// Called when a turret fires a projectile.
	OnFireProjectile(projectile)
	{
		// Add to the list of all projectiles so it is ticked by GameServer.
		this.#allProjectilesById.set(projectile.GetId(), projectile);
		
		// Queue a network event to tell clients that a projectile was fired.
		this.#networkEvents.push(new NetworkEvent.FireProjectile(projectile));
	}
	
	// Called when a projectile moves to check if it hit anything.
	CheckProjectileCollision(projectile)
	{
		const [x, y] = projectile.GetPosition();
		const player = projectile.GetPlayer();
		
		// This uses a brute-force approach iterating all units.
		// TODO: make this more efficient so it can scale for 1000s of units.
		for (const unit of this.allUnits())
		{
			// Skip units from the same player that fired the projectile.
			if (unit.GetPlayer() === player)
				continue;
			
			// Check if the projectile hit this unit. This only uses the projectile
			// position as a point and tests if it is inside the unit platform's collision shape.
			if (unit.GetPlatform().ContainsPoint(x, y))
			{
				// Queue a network event to tell clients that a projectile hit something.
				this.#networkEvents.push(new NetworkEvent.ProjectileHit(projectile));
				
				// Apply the projectile damage to the unit health.
				unit.ReduceHealth(projectile.GetDamage());
				
				return true;	// hit something
			}
		}
		
		return false;			// did not hit anything
	}
	
	// Tick the game to advance the game by one step.
	#Tick()
	{
		// setTimeout has run so clear the timer ID
		this.#tickTimerId = -1;
		
		// Calculate this tick's delta-time (dt) value - i.e. the time since the last
		// tick - in seconds. Note dt is in seconds as most of the game speeds happen
		// in units per second, but JavaScript timers work in milliseconds.
		const tickStartTimeMs = performance.now();
		const dt = (tickStartTimeMs - this.#lastTickTimeMs) / 1000;
		this.#lastTickTimeMs = tickStartTimeMs;
		
		// Update all projectiles.
		for (const [id, projectile] of this.#allProjectilesById)
		{
			projectile.Tick(dt);
			
			if (projectile.ShouldDestroy())
			{
				projectile.Release();
				this.#allProjectilesById.delete(id);
			}
		}
		
		// Update all units.
		// TODO: at the moment we naively tick every single unit in the game. This can
		// probably be made much more efficient by only ticking units that need it.
		for (const unit of this.allUnits())
		{
			unit.Tick(dt);
		}
		
		// Send data about the game state to the clients.
		this.#SendGameStateUpdate();
		
		// Send any events that have happened over the network.
		this.#SendNetworkEvents();
		
		// Check the game victory/defeat conditions e.g. if one team is defeated.
		this.#CheckGameEndCondition();
		
		// Advance the game time by this tick's delta-time value.
		// Note the game time uses kahan summation to improve precision. Normal floating
		// point summation is not precise enough to keep an accurate clock time.
		this.#gameTime.Add(dt);
		
		// Schedule a timer to run the next tick.
		this.#ScheduleNextTick();
	}
	
	#ScheduleNextTick()
	{
		// Schedule the next tick with setTimeout().
		// This is actually quite tricky: setTimeout() is allowed to run the callback
		// late, and if it does that for every timer, then we might end up with a
		// lower tick rate than we wanted. So we have to make sure if this callback
		// ran late, a shorter time interval is set to compensate. To do that, the time
		// the next tick is *meant* to run at is calculated in #nextTickScheduledTimeMs,
		// which just increments by the tick interval. Then the timer is set for the time
		// from now until that next scheduled time. This better achieves the intended
		// SERVER_TICK_RATE, but at least in Chrome it causes fairly janky dt values
		// (e.g. ranging from 20-50ms when we want 33ms). There doesn't appear to be a
		// better JS timing API that Web Workers can use, so we'll probably just have to
		// live with that - but much like a flaky network, clients should be able to
		// smooth out irregular updates.
		// Also note the time is taken from after the game logic has been processed,
		// as that itself take a relatively long time.
		const tickEndTimeMs = performance.now();
		let msToNextTick = this.#nextTickScheduledTimeMs - tickEndTimeMs;
		
		// If updating the game logic takes longer than SERVER_TICK_MS_INTERVAL, then
		// #nextTickScheduledTimeMs will start to fall behind the clock time. If this
		// happens run the next tick ASAP (zero time delay) and advance the next tick
		// scheduled time.
		if (msToNextTick < 0)
		{
			msToNextTick = 0;
			this.#nextTickScheduledTimeMs = tickEndTimeMs + SERVER_TICK_MS_INTERVAL;
		}
		else 
		{
			this.#nextTickScheduledTimeMs += SERVER_TICK_MS_INTERVAL;
		}
		
		this.#tickTimerId = setTimeout(() => this.#Tick(), msToNextTick);
	}
	
	// Send binary data with the game state for clients to update to.
	// Currently this just sends a full update of every unit in the game.
	// TODO: come up with a smarter strategy that reduces bandwidth.
	#SendGameStateUpdate()
	{
		const dataView = this.#dataView;
		let pos = 0;		// write position in bytes
		
		// Write the magic number to identify this kind of message.
		dataView.setUint32(pos, MAGIC_NUMBER);
		pos += 4;
		
		// Write the message type as a byte.
		dataView.setUint8(pos, MESSAGE_TYPE_UPDATE);
		pos += 1;
		
		// Write the game time at the tick this message was sent.
		dataView.setFloat32(pos, this.GetGameTime());
		pos += 4;
		
		// Write an incrementing sequence number with every binary message.
		// Since these updates use unreliable transmission, messages could arrive
		// out-of-order. The client can use the sequence number to discard any
		// delayed messages that arrive after a newer message.
		dataView.setUint32(pos, this.#messageSequenceNumber++);
		pos += 4;
		
		// Write the total number of units.
		dataView.setUint16(pos, this.#allUnitsById.size);
		pos += 2;
		
		// For each unit, write data about the unit.
		for (const unit of this.allUnits())
		{
			// Write the unit ID
			dataView.setUint16(pos, unit.GetId());
			pos += 2;
			
			// Write the X and Y position as uint16s
			const platform = unit.GetPlatform();
			const [x, y] = platform.GetPosition();
			dataView.setUint16(pos, x);
			pos += 2;
			dataView.setUint16(pos, y);
			pos += 2;
			
			// Write the platform angle as a uint16.
			dataView.setUint16(pos, MathUtils.AngleToUint16(platform.GetAngle()));
			pos += 2;
			
			// Write the turret offset angle as a uint16.
			dataView.setUint16(pos, MathUtils.AngleToUint16(unit.GetTurret().GetAngle()));
			pos += 2;
		}
		
		// Finished writing the game state data.
		// Copy out a new ArrayBuffer with just the data written.
		const arrayBuffer = this.#dataArrayBuffer.slice(0, pos);
		
		// Send the binary data with the game state update to the runtime.
		// The arrayBuffer is transferred to save a copy, as it isn't needed here any more.
		// This also uses unreliable transmission as this is essentially streaming data.
		this.SendToRuntime(arrayBuffer, "u", [arrayBuffer])
	}
	
	#SendNetworkEvents()
	{
		// Skip if there are no network events to send.
		if (this.#networkEvents.length === 0)
			return;
		
		const dataView = this.#dataView;
		let pos = 0;		// write position in bytes
		
		// Write the magic number to identify this kind of message.
		dataView.setUint32(pos, MAGIC_NUMBER);
		pos += 4;
		
		// Write the message type as a byte.
		dataView.setUint8(pos, MESSAGE_TYPE_EVENTS);
		pos += 1;
		
		// Write the game time at the tick these events happened.
		dataView.setFloat32(pos, this.GetGameTime());
		pos += 4;
		
		// Write the number of events.
		dataView.setUint16(pos, this.#networkEvents.length);
		pos += 2;
		
		// Write each event individually.
		for (const networkEvent of this.#networkEvents)
		{
			pos = networkEvent.Write(dataView, pos);
		}
		
		// Clear all the network events now they have been sent.
		this.#networkEvents.length = 0;
		
		// Finished writing network events.
		// Copy out a new ArrayBuffer with just the data written.
		const arrayBuffer = this.#dataArrayBuffer.slice(0, pos);
		
		// Send the binary data with the list of events to the runtime.
		// The arrayBuffer is transferred to save a copy, as it isn't needed here any more.
		// This also uses reliable but unordered transmission. Events must arrive at clients,
		// but they don't have to be received in the correct order. Clients can compensate
		// for late events.
		this.SendToRuntime(arrayBuffer, "r", [arrayBuffer])
	}
	
	#CheckGameEndCondition()
	{
		// If the game is already over skip making this check.
		if (this.#isGameOver)
			return;
		
		// Check how many units player 0 and player 1 have.
		// TODO: support more players/other victory conditions
		let player0count = 0;
		let player1count = 0;
		
		for (const unit of this.allUnits())
		{
			if (unit.GetPlayer() === 0)
				player0count++;
			else if (unit.GetPlayer() === 1)
				player1count++;
		}
		
		// If either player has 0 units, they have been defeated.
		if (player0count === 0 || player1count === 0)
		{
			// Set the game over flag so this check isn't made again.
			this.#isGameOver = true;
			
			// Determine which player won. Note if both players end up with
			// 0 units at exactly the same time, then no player won.
			let winningPlayer;
			if (player0count === 0 && player1count > 0)
				winningPlayer = 1;
			else if (player1count === 0 && player0count > 0)
				winningPlayer = 0;
			else
				winningPlayer = -1;
			
			// Send to clients a message indicating that the game is over and which player won.
			this.SendToRuntime({
				"type": "game-over",
				"winning-player": winningPlayer
			});
		}
	}
 }