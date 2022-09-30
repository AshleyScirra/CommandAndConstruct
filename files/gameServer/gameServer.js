 
 import { Unit } from "./units/unit.js";
 
 // Number of ticks per second to run the server at,
 // and the equivalent value in milliseconds between ticks.
 const SERVER_TICK_RATE = 30;
 const SERVER_TICK_MS_INTERVAL = (1000 / SERVER_TICK_RATE);
 
 // The GameServer class represents the state of the game and runs the main game logic.
 // It runs in a Web Worker and communicates with clients by messaging - either local messages
 // for the local player or remote players over the network.
 export class GameServer {
 
 	// Private fields
	#sendMessageFunc;				// called by SendToRuntime()
	#allUnitsById = new Map();		// map of all units by id -> Unit
	
	#tickTimerId = -1;				// timer ID for ticking GameServer
	#lastTickTimeMs = 0;			// clock time at last tick in ms
	#nextTickScheduledTimeMs = 0;	// time next tick ought to run at in ms
	
 	constructor(sendMessageFunc)
	{
		// The function to send a message to the runtime is passed to the constructor.
		this.#sendMessageFunc = sendMessageFunc;
		
		// Initialize a game.
		this.Init();
	}
	
	// Provide a GameServer method to send a message to the runtime for convenience.
	SendToRuntime(msg)
	{
		this.#sendMessageFunc(msg);
	}
	
	Release()
	{
		for (const unit of this.allUnits())
			unit.Release();
		
		this.#allUnitsById.clear();
		
		if (this.#tickTimerId !== -1)
			clearTimeout(this.#tickTimerId);
	}
	
	Init()
	{
		// Hard-code six starting units.
		// TODO: load level designs from somewhere
		this._AddUnitAtPosition(200, 200);
		this._AddUnitAtPosition(500, 200);
		this._AddUnitAtPosition(200, 400);
		this._AddUnitAtPosition(500, 400);
		this._AddUnitAtPosition(200, 600);
		this._AddUnitAtPosition(500, 600);
		
		this.SendToRuntime({
			"type": "create-initial-state",
			"units": [...this.allUnits()].map(u => u.GetInitData())
		});
		
		// Start ticking the game
		this.#lastTickTimeMs = performance.now();
		this.#nextTickScheduledTimeMs = this.#lastTickTimeMs + SERVER_TICK_MS_INTERVAL;
		this.#Tick();
	}
	
	_AddUnitAtPosition(x, y)
	{
		// Create a unit and add it to the units by ID map
		const unit = new Unit(this, x, y);
		this.#allUnitsById.set(unit.GetId(), unit);
	}
	
	// Iterates all units in the game, using the values of the units map.
	allUnits()
	{
		return this.#allUnitsById.values();
	}
	
	GetUnitById(id)
	{
		return this.#allUnitsById.get(id);
	}
	
	MoveUnits(unitIds, x, y)
	{
		// Look up all units from their ID. Discard any that cannot be found,
		// just in case any synchronisation issue means a client tried to move
		// a unit ID that no longer exists on the server.
		const unitsArray = unitIds.map(id => this.GetUnitById(id))
								  .filter(unit => unit);	// filter empty results
		
		// If none of the unit IDs are found, ignore the message.
		if (unitsArray.length === 0)
			return;
		
		// Instruct each unit to move to the given position.
		for (const unit of unitsArray)
		{
			unit.GetPlatform().MoveToPosition(x, y);
		}
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
		
		// Update all units.
		// TODO: at the moment we naively tick every single unit in the game. This can
		// probably be made much more efficient by only ticking units that need it.
		for (const unit of this.allUnits())
		{
			unit.Tick(dt);
		}
		
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
 }