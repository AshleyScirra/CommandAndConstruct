 
import { ServerMessageHandler } from "./serverMessageHandler.js";
import { ObjectData } from "./units/objectData.js";
import { Unit } from "./units/unit.js";
import { NetworkEvent } from "./networkEvents/networkEvents.js";
import { CollisionGrid } from "./collisions/collisionGrid.js";
import { ServerPathfinding } from "./serverPathfinding.js";
import { KahanSum } from "./utils/kahanSum.js";
import * as MathUtils from "./utils/mathUtils.js";

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
	#serverMessageHandler;			// ServerMessageHandler class
	
	#allUnitsById = new Map();		// map of all units by id -> Unit
	#allProjectilesById = new Map(); // map of all active projectiles by id -> Projectile
	
	#tickTimerId = -1;				// timer ID for ticking GameServer
	#lastTickTimeMs = 0;			// clock time at last tick in ms
	#nextTickScheduledTimeMs = 0;	// time next tick ought to run at in ms
	#gameTime = new KahanSum();		// serves as the clock for the game in seconds
	
	#objectData = new Map();		// name -> ObjectData
	
	// Level size
	#layoutWidth = 35000;
	#layoutHeight = 13000;
	
	#isGameOver = false;			// set to true once victory/defeat condition met
	
	#collisionGrid;					// CollisionGrid for collision cells optimisation
	#serverPathfinding;				// ServerPathfinding for server-side pathfinding manager
	
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
		
		this.#serverMessageHandler = new ServerMessageHandler(this);
		
		// Read the object data passed from the runtime in to ObjectData classes.
		for (const entry of constructObjectData)
		{
			this.#objectData.set(entry["name"], new ObjectData(this, entry));
		}
		
		// Initialize a game.
		this.Init();
	}
	
	// Provide a GameServer method to send a message to the runtime for convenience.
	// This also specifies a transmission mode (reliable ordered, reliable unordered,
	// or unreliable) for the host to retransmit as, defaulting to reliable ordered.
	SendToRuntime(message, transmissionMode = "o", forPlayer = null, transferList = null)
	{
		this.#sendMessageFunc(message, transmissionMode, forPlayer, transferList);
	}
	
	GetMessageHandler()
	{
		return this.#serverMessageHandler;
	}
	
	Init()
	{
		// Create the collision grid and server-side pathfinding controller
		this.#collisionGrid = new CollisionGrid(this);
		this.#serverPathfinding = new ServerPathfinding(this);
		
		// Add 500 starting units for each player in rows opposing each other.
		const randomOffset = (v => (v / -2) + Math.random() * v);
		
		for (let i = 0; i < 500; ++i)
		{
			// Use a formula to arrange units in 5 rows
			const x = 5000 + i * 50;
			const y = 2000 + (i % 5) * 350;
			
			// Add player 0 unit along the top
			this._AddUnitAtPosition(0, x + randomOffset(50), y + randomOffset(50), Math.PI / 2 + randomOffset(0.5));
			
			// Add player 1 unit along the bottom
			this._AddUnitAtPosition(1, x + randomOffset(50), this.#layoutHeight - y + randomOffset(50), Math.PI / -2 + randomOffset(0.5));
		}
		
		this.SendToRuntime({
			"type": "create-initial-state",
			"layoutSize": [this.#layoutWidth, this.#layoutHeight]
		});
		
		// Initialise the number of full unit updates to be sending out every tick,
		// based on the starting number of units.
		this.#serverMessageHandler.UpdateNumFullUpdatesPerTick();
		
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
		// Release the unit so it cleans up any leftover state, such as removing
		// itself from any collision cells it was in.
		unit.Release();
		
		// Queue a network event to tell clients that the unit was destroyed.
		this.#serverMessageHandler.AddNetworkEvent(new NetworkEvent.UnitDestroyed(unit.GetId()));
		
		// Remove the unit from the server and from any pending messages in ServerMessageHandler.
		this.#allUnitsById.delete(unit.GetId());
		this.#serverMessageHandler.RemoveUnit(unit);
	}
	
	// Iterates all units in the game, using the values of the units map.
	allUnits()
	{
		return this.#allUnitsById.values();
	}
	
	GetTotalUnitCount()
	{
		return this.#allUnitsById.size;
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
	
	// Get the server-side game time in seconds.
	GetGameTime()
	{
		return this.#gameTime.Get();
	}
	
	// The time since the last tick can be added to the game time for a more accurate
	// reading of the current time. This is used for ping messages.
	GetTimeSinceLastTick()
	{
		return (performance.now() - this.#lastTickTimeMs) / 1000;
	}
	
	GetCollisionGrid()
	{
		return this.#collisionGrid;
	}
	
	GetPathfinding()
	{
		return this.#serverPathfinding;
	}
	
	GetLayoutSize()
	{
		return [this.#layoutWidth, this.#layoutHeight];
	}
	
	ClampToLayout(x, y)
	{
		return [MathUtils.Clamp(x, 0, this.#layoutWidth),
				MathUtils.Clamp(y, 0, this.#layoutHeight)];
	}
	
	// Called when GameServer receives a command from a player to move units
	// to a location.
	MoveUnits(player, units)
	{
		// Determine whether to use a pathfinding group for moving these units.
		// This is done if the number of units to move is above the threshold.
		const groupThreshold = this.#serverPathfinding.GetGroupThreshold();
		const useGroup = (units.length > groupThreshold);
		
		// If using a group, start the pathfinding group now before finding paths.
		if (useGroup)
			this.#serverPathfinding.StartGroup();
		
		// Collect an array of units to move, with objects in the format:
		// { platform, curX, curY, toX, toY }
		const unitsToMove = [];
		
		// For each unit being commanded to move
		for (const u of units)
		{
			const id = u["id"];
			const toX = u["x"];
			const toY = u["y"];
			
			// Look up unit from its ID.
			const unit = this.GetUnitById(id);
			
			// Discard any units that cannot be found, just in case any synchronisation issue
			// means a client tried to move a unit ID that no longer exists on the server.
			// Also discard any units that aren't from the player who sent the message,
			// so even a hacked client can't command anyone else's units.
			if (!unit || unit.GetPlayer() !== player)
				continue;
			
			// Add this unit to the list of units to move.
			const platform = unit.GetPlatform();
			const [curX, curY] = platform.GetPosition();
			unitsToMove.push({
				platform,
				curX, curY,
				toX, toY
			});
		}
		
		// If using a pathfinding group, shuffle the order of units to try to spread out
		// simultaneous pathfinding requests.
		if (useGroup)
		{
			// Sort units horizontally and collect units in to two halves.
			unitsToMove.sort((a, b) => a.curX - b.curX);
			let mid = Math.floor(unitsToMove.length / 2);
			const leftSide = unitsToMove.slice(0, mid);
			leftSide.reverse();
			const rightSide = unitsToMove.slice(mid);
			
			// Sort the left and right sides vertically and collect each side in to
			// both top and bottom quadrants.
			leftSide.sort((a, b) => a.curY - b.curY);
			rightSide.sort((a, b) => a.curY - b.curY);
			
			mid = Math.floor(leftSide.length / 2);
			const topLeftSide = leftSide.slice(0, mid);
			topLeftSide.reverse();
			const bottomLeftSide = leftSide.slice(mid);
			
			mid = Math.floor(rightSide.length / 2);
			const topRightSide = rightSide.slice(0, mid);
			topRightSide.reverse();
			const bottomRightSide = rightSide.slice(mid);
			
			// Now clear unitsToMove and rebuild it by picking one unit from each quadrant
			// at a time until all four quadrants are empty.
			unitsToMove.length = 0;
			const maxLen = Math.max(topLeftSide.length, bottomLeftSide.length, topRightSide.length, bottomRightSide.length);
			for (let i = 0; i < maxLen; ++i)
			{
				if (topLeftSide.length > 0)
					unitsToMove.push(topLeftSide.pop());
				if (bottomRightSide.length > 0)
					unitsToMove.push(bottomRightSide.pop());
				if (topRightSide.length > 0)
					unitsToMove.push(topRightSide.pop());
				if (bottomLeftSide.length > 0)
					unitsToMove.push(bottomLeftSide.pop());
			}
		}
		
		// Instruct each unit to move to its target position. This performs
		// pathfinding to calculate a route to the destination.
		for (const { platform, toX, toY} of unitsToMove)
		{
			platform.MoveToPosition(toX, toY);
		}
		
		// If a pathfinding group was used, end it now that all units have
		// sent their pathfinding jobs.
		if (useGroup)
			this.#serverPathfinding.EndGroup();
	}
	
	// Called when a turret fires a projectile.
	OnFireProjectile(projectile)
	{
		// Add to the list of all projectiles so it is ticked by GameServer.
		this.#allProjectilesById.set(projectile.GetId(), projectile);
		
		// Queue a network event to tell clients that a projectile was fired.
		this.#serverMessageHandler.AddNetworkEvent(new NetworkEvent.FireProjectile(projectile));
	}
	
	// Called when a projectile moves to check if it hit anything.
	CheckProjectileCollision(projectile)
	{
		const [x, y] = projectile.GetPosition();
		const player = projectile.GetPlayer();
		
		// Result to return from this method.
		let result = false;
		
		// To efficiently eliminate most far-away units, use the collision grid to only
		// check units in the same collision cell as this projectile. Note the method
		// takes a rectangle, but projectiles are just a point, so a zero-sized rectangle
		// is passed using the same left/right and top/bottom values. Also note that
		// ForEachItemInArea() can run its callback repeatedly with the same thing,
		// but that doesn't matter here - as soon as a hit is detected it stops iterating,
		// and checking something that isn't hit multiple times will have negligible
		// performance overhead (and collision cells overall are a huge improvement).
		this.#collisionGrid.ForEachItemInArea(
			x, y, x, y,
			unitPlatform =>
			{
				const unit = unitPlatform.GetUnit();
				
				// Skip units from the same player that fired the projectile.
				if (unit.GetPlayer() === player)
					return false;	// bail out but keep iterating in ForEachItemInArea()

				// Check if the projectile hit this unit. This only uses the projectile
				// position as a point and tests if it is inside the unit platform's full collision shape.
				if (unitPlatform.ContainsPoint_Full(x, y))
				{
					// Queue a network event to tell clients that a projectile hit something.
					this.#serverMessageHandler.AddNetworkEvent(new NetworkEvent.ProjectileHit(projectile));

					// Apply the projectile damage to the unit health.
					unit.ReduceHealth(projectile.GetDamage());

					result = true;	// return true from CheckProjectileCollision()
					return true;	// bail out and stop iterating in ForEachItemInArea()
				}
			});
		
		// Return true if a collision happened.
		return result;
	}
	
	GetTickRate()
	{
		return SERVER_TICK_RATE;
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
		
		// Send game updates for this tick. This includes full unit updates, delta unit
		// updates, and a list of the network events that have happened.
		this.#serverMessageHandler.SendBinaryGameUpdate();
		
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
	
	AddUnitForDeltaUpdate(unit)
	{
		this.#serverMessageHandler.AddUnitForDeltaUpdate(unit);
	}
	
	AddStatStateData(s)
	{
		this.#statStateData += s;
	}
	
	AddStatDeltaData(s)
	{
		this.#statDeltaData += s;
	}
	
	AddStatEventData(s)
	{
		this.#statEventData += s;
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