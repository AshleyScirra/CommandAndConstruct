 
 import { ObjectData } from "./units/objectData.js";
 import { Unit } from "./units/unit.js";
 import { NetworkEvent } from "./networkEvents/networkEvents.js";
 import { KahanSum } from "./utils/kahanSum.js";
 import * as MathUtils from "./utils/mathUtils.js";
 
 // Number of ticks per second to run the server at,
 // and the equivalent value in milliseconds between ticks.
 const SERVER_TICK_RATE = 30;
 const SERVER_TICK_MS_INTERVAL = (1000 / SERVER_TICK_RATE);
 
 // The binary message types
 const MESSAGE_TYPE_UNIT_UPDATES = 0;	// full and delta unit updates
 const MESSAGE_TYPE_EVENTS = 1;			// list of events that have happened
 
 // The amount of time over which all units in the game will have a full update sent
 // out by the server, currently set to every 2 seconds.
 const UNIT_FULL_UPDATE_PERIOD = 2;
 
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
	
	// A set of all units pending a full update (which sends all the unit data).
	// The set will be filled with all units every UNIT_FULL_UPDATE_PERIOD,
	// and then gradually drained over time as updates are sent out.
	#unitsPendingFullUpdate = new Set();
	#numUnitFullUpdatesPerTick = 0;	// number of unit full updates to send out per tick
	
	// A set of units that have changed this tick, so need to send delta updates.
	#unitsPendingDeltaUpdate = new Set();
	
	#networkEvents = [];			// array of NetworkEvents waiting to send over the network
	
	// A 256kb binary data buffer to use for sending binary updates to clients
	#dataArrayBuffer = new ArrayBuffer(262144);
	#dataView = new DataView(this.#dataArrayBuffer);
	
	// Level size
	#layoutWidth = 25000;
	#layoutHeight = 6000;
	
	#isGameOver = false;			// set to true once victory/defeat condition met
	
	// For stats
	#statStateData = 0;
	#statDeltaData = 0;
	#statEventData = 0;
	#frameCount = 0;
	#timeInTickCalls = 0;
	
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
		// Add 500 starting units for each player in rows opposing each other.
		const randomOffset = (v => (v / -2) + Math.random() * v);
		
		for (let i = 0; i < 500; ++i)
		{
			// Use a formula to arrange units in 5 rows
			const x = 2000 + i * 40;
			const y = 500 + (i % 5) * 300;
			
			// Add player 0 unit along the top
			this._AddUnitAtPosition(0, x + randomOffset(50), y + randomOffset(50), Math.PI / 2 + randomOffset(0.5));
			
			// Add player 1 unit along the bottom
			this._AddUnitAtPosition(1, x + randomOffset(50), this.#layoutHeight - y + randomOffset(50), Math.PI / -2 + randomOffset(0.5));
		}
		
		this.SendToRuntime({
			"type": "create-initial-state",
			"layoutSize": [this.#layoutWidth, this.#layoutHeight],
			"units": [...this.allUnits()].map(u => u.GetInitData())
		});
		
		// Initialise the number of full unit updates to be sending out every tick,
		// based on the starting number of units.
		this.#UpdateNumFullUpdatesPerTick();
		
		// Start ticking the game
		this.#lastTickTimeMs = performance.now();
		this.#nextTickScheduledTimeMs = this.#lastTickTimeMs + SERVER_TICK_MS_INTERVAL;
		this.#Tick();
		
		// Every 1 second send a stats message for testing purposes
		setInterval(() => this.#SendStats(), 1000);
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
		
		// Remove the unit from the server. Also remove it from the set of units
		// pending an absolute update, as it no longer needs updating.
		this.#allUnitsById.delete(unit.GetId());
		this.#unitsPendingFullUpdate.delete(unit);
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
		
		// Send some full unit updates for this tick, which are all spread over
		// ticks across the time period UNIT_FULL_UPDATE_PERIOD, along with delta
		// updates, which are a set of specific values that have changed in units.
		this.#SendUnitUpdates();
		
		// Send any events that have happened over the network.
		this.#SendNetworkEvents();
		
		// Check the game victory/defeat conditions e.g. if one team is defeated.
		this.#CheckGameEndCondition();
		
		// Advance the game time by this tick's delta-time value.
		// Note the game time uses kahan summation to improve precision. Normal floating
		// point summation is not precise enough to keep an accurate clock time.
		this.#gameTime.Add(dt);
		
		// Increment frame count and add to the time spent processing Tick(), for stats.
		this.#frameCount++;
		this.#timeInTickCalls += (performance.now() - tickStartTimeMs);
		
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
	
	// When some value in a unit changes, it calls this method to add it to a set of
	// units for sending delta updates over the network.
	AddUnitForDeltaUpdate(unit)
	{
		this.#unitsPendingDeltaUpdate.add(unit);
	}
	
	// Calculate how many units to send a full update for every server tick to get them
	// all sent out in the UNIT_FULL_UPDATE_PERIOD. Round the number up to make sure there
	// is always at least 1 unit sent out every update, and that it errs on the side of
	// finishing slightly ahead of the deadline, rather than slightly behind.
	#UpdateNumFullUpdatesPerTick()
	{
		const updatePeriodTicks = SERVER_TICK_RATE * UNIT_FULL_UPDATE_PERIOD;
		this.#numUnitFullUpdatesPerTick = Math.ceil(this.#allUnitsById.size / updatePeriodTicks);
	}
	
	// Send full and delta unit updates in one message. They both use the same transmission mode
	// and sending them together allows compression to work more effectively.
	#SendUnitUpdates()
	{
		// Send data with some unit full updates. These contain all the information about
		// a unit, such as its position, angle, speed and turret offset angle. Each tick this is
		// called to send only some full updates; it will work its way through all units over the
		// time period UNIT_FULL_UPDATE_PERIOD in order to limit the total bandwidth used.
		
		// From the queue of units pending a full update, fill up an array with the number to send this tick.
		const sendUnits = [];
		for (const unit of this.#unitsPendingFullUpdate)
		{
			sendUnits.push(unit);
			this.#unitsPendingFullUpdate.delete(unit);
			
			// Stop when hitting the limit for the number of units to send this tick.
			if (sendUnits.length >= this.#numUnitFullUpdatesPerTick)
				break;
		}
		
		// The last update, when #unitsPendingFullUpdate becomes empty, may not have filled up
		// the sendUnits array with enough units. In this case we can start over sending the next
		// round of units in this update to top it up. (This also happens on the very first tick.)
		if (sendUnits.length < this.#numUnitFullUpdatesPerTick)
		{
			// Iterate all units in the game.
			for (const unit of this.allUnits())
			{
				// For the first few units, top up the sendUnits array so they are included
				// in this tick's full update.
				if (sendUnits.length < this.#numUnitFullUpdatesPerTick)
				{
					sendUnits.push(unit);
				}
				else
				{
					// Once sendUnits reaches the limit, add the rest of the units to the
					// set of units to be sent out over the next UNIT_FULL_UPDATE_PERIOD.
					this.#unitsPendingFullUpdate.add(unit);
				}
			}
			
			// Also recalculate the number of units to be sending per tick to adapt it to
			// the current number of units.
			this.#UpdateNumFullUpdatesPerTick();
		}
		
		// If for some reason there are no full updates to send (maybe every single unit was destroyed?)
		// *and* no delta updates, then skip sending any update.
		if (sendUnits.length === 0 && this.#unitsPendingDeltaUpdate.size === 0)
		{
			return;
		}
		
		const dataView = this.#dataView;
		let pos = 0;		// write position in bytes
		
		// Write the message type as a byte.
		dataView.setUint8(pos, MESSAGE_TYPE_UNIT_UPDATES);
		pos += 1;
		
		// Write the game time at the tick this message was sent.
		dataView.setFloat32(pos, this.GetGameTime());
		pos += 4;
		
		// Write the total number of full updates to be sent in this update.
		dataView.setUint16(pos, sendUnits.length);
		pos += 2;
		
		// For each unit, write the full data about the unit.
		for (const unit of sendUnits)
		{
			pos = unit.WriteFullUpdate(dataView, pos);
			
			// If this unit is in the delta update list, remove it - it already just wrote
			// its full information so there's no point following with a delta update.
			this.#unitsPendingDeltaUpdate.delete(unit);
		}
		
		// Save size of state data for stats
		this.#statStateData += pos;
		const stateDataEndPos = pos;
		
		// Continue on to writing delta updates following on from the full updates.
		// These are a list of specific values that have changed in units this tick, such as
		// the platform angle, or the turret offset angle. Values that have not changed are
		// not transmitted here, in order to save bandwidth.
		
		// Write the number of delta updates.
		dataView.setUint16(pos, this.#unitsPendingDeltaUpdate.size);
		pos += 2;
		
		// Write each delta update.
		for (const unit of this.#unitsPendingDeltaUpdate)
		{
			pos = unit.WriteDeltaUpdate(dataView, pos);
		}
		
		// Clear all units pending delta updates now they have been written.
		this.#unitsPendingDeltaUpdate.clear();
		
		// Save size of delta data for stats
		this.#statDeltaData += pos - stateDataEndPos;
		
		// Finished writing the unit update data.
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
		
		// Clear all the network events now they have been written.
		this.#networkEvents.length = 0;
		
		// Finished writing network events.
		// Copy out a new ArrayBuffer with just the data written.
		const arrayBuffer = this.#dataArrayBuffer.slice(0, pos);
		this.#statEventData += arrayBuffer.byteLength;		// measure data sent for stats
		
		// Send the binary data with the list of events to the runtime.
		// The arrayBuffer is transferred to save a copy, as it isn't needed here any more.
		// This also uses reliable but unordered transmission. Events must arrive at clients,
		// but they don't have to be received in the correct order. Clients can compensate
		// for late events.
		this.SendToRuntime(arrayBuffer, "r", [arrayBuffer]);
	}
	
	// Called every 1 second to send stats to clients so they can display it for testing purposes.
	#SendStats()
	{
		this.SendToRuntime({
			"type": "stats",
			"server-fps": this.#frameCount,
			"server-thread-usage": this.#timeInTickCalls / 1000,
			"num-units": this.#allUnitsById.size,
			"num-projectiles": this.#allProjectilesById.size,
			"sent-state-bytes": this.#statStateData,
			"sent-delta-bytes": this.#statDeltaData,
			"sent-event-bytes": this.#statEventData
		});
		
		// Reset counters
		this.#frameCount = 0;
		this.#timeInTickCalls = 0;
		this.#statStateData = 0;
		this.#statDeltaData = 0;
		this.#statEventData = 0;
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