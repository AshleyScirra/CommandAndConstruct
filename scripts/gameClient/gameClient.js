
import { MultiEventHandler } from "../utils/multiEventHandler.js";
import { KahanSum } from "../utils/clientKahanSum.js";
import { ClientUnit } from "../clientUnits/clientUnit.js";
import { ClientProjectile } from "../clientUnits/clientProjectile.js";
import { ClientMessageHandler } from "./net/clientMessageHandler.js";
import { PingManager } from "./net/pingManager.js";
import { PointerManager } from "./ui/pointerManager.js";
import { ViewManager } from "./ui/viewManager.js";
import { SelectionManager } from "./ui/selectionManager.js";
import { Minimap } from "./ui/minimap.js";
import { PathfindingController } from "./pathfindingController.js";
import * as MathUtils from "../utils/clientMathUtils.js";

// The GameClient class is created while on a game layout, and handles representing the
// state of the game for the runtime. Note that the authoritative state of the game lives
// on GameServer, so the GameClient is mostly responsible for updating the state of the
// game to match the server state, and sending player inputs to the server.
export class GameClient {

	// Private fields
	#runtime;						// Construct runtime
	#sendMessageFunc;				// SendMessageToGameServer function
	#gameMode = "";					// current game mode
	#allUnitsById = new Map();		// map of all units by id -> ClientUnit
	#allProjectilesById = new Map();// map of all projectiles by id -> ClientProjectile
	#unitsToTick = new Set();		// set of all units to call Tick() on
	
	// For checking if units time out. If a unit is not heard from for too long,
	// assume it was destroyed but the network event went missing.
	#unitsToCheckTimeout = new Set();	// set of units to call CheckTimeout() on
	#timeoutCheckCount = 0;			// total number of units to check for timeout
	
	#eventHandlers;					// MultiEventHandler for runtime events
	#gameTime = new KahanSum();		// serves as the clock for the game in seconds
	#lastTickTimeMs = 0;			// time at start of last tick in ms
	#messageHandler;				// MessageHandler class
	#pingManager;					// PingManager class
	#pointerManager;				// PointerManager class
	#viewManager;					// ViewManager class
	#selectionManager;				// SelectionManager class
	#minimap;						// Minimap class
	#pathfindingController;			// PathfindingController class
	
	#player = 0;					// Player number this client controls
	
	constructor(runtime, sendMessageFunc, player, gameMode)
	{
		this.#runtime = runtime;
		this.#sendMessageFunc = sendMessageFunc;
		this.#player = player;
		this.#gameMode = gameMode;
		
		this.#eventHandlers = new MultiEventHandler([
			[runtime,		"tick",		() => this.#OnTick()],
			[runtime,		"resize",	() => this.#OnWindowResize()]
		]);
		
		// Create ClientMessageHandler which handles messages from GameServer
		// and calls the appropriate methods on this class. Also create the PingManager
		// which handles pings and also synchronizing the client clock.
		this.#messageHandler = new ClientMessageHandler(this);
		this.#pingManager = new PingManager(this);
		
		// Create PointerManager which handles pointer inputs (mouse, touch and pen).
		this.#pointerManager = new PointerManager(this);
		
		// Create ViewManager which handles scrolling and zooming.
		this.#viewManager = new ViewManager(this);
		
		// Create SelectionManager which handles unit selections.
		this.#selectionManager = new SelectionManager(this);
		
		// Create Minimap class which handles the minimap
		this.#minimap = new Minimap(this);
		
		this.#pathfindingController = new PathfindingController(this);
	}
	
	Release()
	{
		this.#eventHandlers.Release();
		this.#pingManager.Release();
		this.#pointerManager.Release();
		this.#selectionManager.Release();
	}
	
	GetRuntime()
	{
		return this.#runtime;
	}
	
	GetPlayer()
	{
		return this.#player;
	}
	
	GetGameMode()
	{
		return this.#gameMode;
	}
	
	GetPingManager()
	{
		return this.#pingManager;
	}
	
	GetViewManager()
	{
		return this.#viewManager;
	}
	
	GetSelectionManager()
	{
		return this.#selectionManager;
	}
	
	GetPointerManager()
	{
		return this.#pointerManager;
	}
	
	GetMinimap()
	{
		return this.#minimap;
	}
	
	GetPathfindingController()
	{
		return this.#pathfindingController;
	}
	
	// Return an array of all Construct object types used for units.
	GetAllUnitObjectTypes()
	{
		const runtime = this.#runtime;
		
		return [
			runtime.objects.TankPlatform,
			runtime.objects.TankTurret
		];
	}
	
	GetConstructObjectData()
	{
		return this.#messageHandler.GetConstructObjectData();
	}
	
	Init()
	{
		// Destroy all existing Construct instances placed on the layout before starting the game.
		for (const objectType of this.GetAllUnitObjectTypes())
		{
			for (const inst of objectType.instances())
			{
				inst.destroy();
			}
		}
	}
	
	// Provide a GameClient method to send a message to GameServer.
	SendToServer(msg, transmissionMode = "o")
	{
		this.#sendMessageFunc(msg, transmissionMode);
	}
	
	HandleGameServerMessage(msg)
	{
		this.#messageHandler.HandleGameServerMessage(msg);
	}
	
	// Called when GameServer sends the initial state of the game.
	// The client needs to create objects to represent the server state.
	async CreateInitialState(data)
	{
		// Set the layout size
		const [layoutWidth, layoutHeight] = data["layoutSize"];
		this.#viewManager.SetLayoutSize(layoutWidth, layoutHeight);
		
		// Start up PingManager now that we know the GameServer is up and running
		// and ready to respond to pings
		this.#pingManager.Start();
		
		// Initialise pathfinding controller
		await this.#pathfindingController.Init();
		
		// The pathfinding controller has updated the pathfinding map in Init().
		// Now the cell obstacles are ready, update the minimap terrain.
		this.#minimap.UpdateTerrain();
	}
	
	// Tell the minimap to redraw the terrain when the window resizes so it reflects
	// the new window resolution.
	#OnWindowResize()
	{
		this.#minimap.UpdateTerrain();
	}
	
	// Called in the ClientUnit constructor
	UnitWasCreated(unit)
	{
		// Add to map of all units.
		this.#allUnitsById.set(unit.GetId(), unit);
		
		// Start all newly created units opted in to ticking.
		this.SetUnitTicking(unit, true);
	}
	
	// Called in the ClientUnit Release() method
	UnitWasDestroyed(unit)
	{
		// Set unselected so any selection box is destroyed and also so
		// it's removed from SelectionManager's list of selected units.
		this.GetSelectionManager().SetSelected(unit, false);
		
		// Remove from set of units to tick.
		this.SetUnitTicking(unit, false);
		
		// Remove from set of units to check if timed out.
		this.#unitsToCheckTimeout.delete(unit);
		
		// Remove unit from the map of all units.
		this.#allUnitsById.delete(unit.GetId());
	}
	
	// Units get Tick() called every tick by default, but can opt out
	// if they are not doing anything to save CPU time.
	SetUnitTicking(unit, shouldTick)
	{
		if (shouldTick)
			this.#unitsToTick.add(unit);
		else
			this.#unitsToTick.delete(unit);
	}
	
	GetNumberOfUnitsTicking()
	{
		return this.#unitsToTick.size;
	}
	
	// Iterates all units in the game.
	allUnits()
	{
		return this.#allUnitsById.values();
	}
	
	// Iterates all units for a specific player.
	*allUnitsForPlayer(player)
	{
		for (const unit of this.allUnits())
		{
			if (unit.GetPlayer() === player)
				yield unit;
		}
	}
	
	// Iterates all units that belong to the local player.
	allLocalPlayerUnits()
	{
		return this.allUnitsForPlayer(this.GetPlayer());
	}
	
	GetUnitById(id)
	{
		return this.#allUnitsById.get(id);
	}
	
	// Called when the player commands some selected units to move to a position.
	MoveUnits(unitsArray, targetX, targetY)
	{
		if (unitsArray.length === 0)
			return;
		
		// Preserve unit formations when moving units. This is done by finding the bounding box
		// of all the units being moved, and each unit's offset from the middle position is also
		// applied to the target position. Further, the formation box is bounded to the edge of
		// the layout, to prevent units bunching up if a formation is moved close to the edge.
		let boxLeft = Infinity;
		let boxTop = Infinity;
		let boxRight = -Infinity;
		let boxBottom = -Infinity;
		for (const unit of unitsArray)
		{
			// Note that unit positions are taken with any pending correction applied.
			// This ensures formations are preserved based on where the client knows units should
			// be, rather than where it's showing them, since it could be showing them with a
			// partial offset as it applies a correction over time.
			const [x, y] = unit.GetPlatform().GetPositionWithCorrectionApplied();
			boxLeft = Math.min(boxLeft, x);
			boxTop = Math.min(boxTop, y);
			boxRight = Math.max(boxRight, x);
			boxBottom = Math.max(boxBottom, y);
		}
		
		// Find middle position inside the bounding box of all the units being moved.
		const midX = (boxLeft + boxRight) / 2;
		const midY = (boxTop + boxBottom) / 2;
		
		// Clamp target position to the layout area taking in to account the bounding box
		// size, to prevent formations causing lots of units to try to move off the layout.
		// Increase the margin size a bit so units don't go all the way to the very edge.
		const EXTRA_MARGIN = 100;
		const marginWidth = (boxRight - boxLeft) / 2 + EXTRA_MARGIN;
		const marginHeight = (boxBottom - boxTop) / 2 + EXTRA_MARGIN;
		const [layoutWidth, layoutHeight] = this.#viewManager.GetLayoutSize();
		
		targetX = MathUtils.Clamp(targetX, marginWidth, layoutWidth - marginWidth);
		targetY = MathUtils.Clamp(targetY, marginHeight, layoutHeight - marginHeight);
		
		this.SendToServer({
			"type": "move-units",
			"units": unitsArray.map(unit =>
			{
				const [x, y] = unit.GetPlatform().GetPositionWithCorrectionApplied();
				return {
					"id": unit.GetId(),
					// Note the position is rounded to the nearest pixel, mainly to make sure long
					// fractional digits (e.g. 100.3333333333...) don't waste bandwidth.
					"x": Math.round(targetX + (x - midX)),
					"y": Math.round(targetY + (y - midY))
				};
			})
		});
	}
	
	// When a network event is received indicating a projectile was fired,
	// create a ClientProjectile to represent it.
	OnProjectileFired(lateness, id, x, y, angle, speed, range, distanceTravelled)
	{
		const projectile = new ClientProjectile(this, id, x, y, angle, speed, range, distanceTravelled);
		this.#allProjectilesById.set(id, projectile);
		
		// Immediately tick the projectile by its lateness. This should catch up its position to where
		// it is meant to be. This applies both for on-time events, since client ticks don't perfectly
		// line up with server ticks, and for late events, where the lateness value could be large
		// (e.g. hundreds of milliseconds) and so the projectile will jump ahead to compensate.
		projectile.Tick(lateness);
	}
	
	// When a network event is received indicating a projectile hit a target,
	// destroy the projectile (if it can be found), and create an explosion at the reported location.
	OnProjectileHit(lateness, id, x, y)
	{
		// If the client is not properly synchronised, it might not be able to find a
		// projectile with the reported ID. In that case, just skip destroying it.
		const projectile = this.#allProjectilesById.get(id);
		if (projectile)
			projectile.Release();
		
		this.#allProjectilesById.delete(id);
		
		// Create an explosion at the server reported position as visual feedback for the player.
		// The explosion is also rotated to a random angle to create visual variation, and it
		// also has the Fade behavior to fade it out and automatically destroy it.
		// Note if the event happens more than 1 second late, don't create an explosion, as it
		// is too late for the visual to obviously correlate to the impact.
		if (lateness < 1)
		{
			const explosionInst = this.#runtime.objects.Explosion.createInstance("Explosions", x, y);
			explosionInst.angle = Math.random() * 2 * Math.PI;
		}
	}
	
	// Iterate all projectiles currently in the game.
	allProjectiles()
	{
		return this.#allProjectilesById.values();
	}
	
	// When a network event is received indicating a unit was destroyed, remove its corresponding
	// unit and also create an explosion to represent its destruction.
	// isQuiet can also be set to not create an explosion, which is used when units time out.
	OnUnitDestroyedEvent(lateness, unitId)
	{
		const unit = this.#allUnitsById.get(unitId);
		
		// If the client is not properly synchronised and a unit with this ID can't be found,
		// just ignore the message.
		if (!unit)
			return;
		
		// Create an explosion at the unit for visual feedback of its destruction, similar to
		// in OnProjectileHit (but also make it a bit bigger to cover the unit). However similarly
		// only create the explosion if the event is not more than 2 seconds late (a longer time is
		// allowed for units as the destruction of a unit is a potentially significant event).
		if (lateness < 2)
		{
			const [x, y] = unit.GetPlatform().GetPosition();
			const explosionInst = this.#runtime.objects.Explosion.createInstance("Explosions", x, y);
			explosionInst.angle = Math.random() * 2 * Math.PI;
			explosionInst.width *= 1.4;
			explosionInst.height *= 1.4;
		}
		
		// Release the unit, which destroys it and cleans up all its state.
		unit.Release();
	}
	
	// Tick the client to advance the game state by one step.
	#OnTick()
	{
		this.#lastTickTimeMs = performance.now();
		const dt = this.#runtime.dt;
		
		// Get the current simulation time as calculated by PingManager.
		const simulationTime = this.#pingManager.GetSimulationTime();
		
		// Check for units that may have timed out if they haven't been heard
		// from for too long.
		this.#CheckForTimedOutUnits(dt, simulationTime);
		
		// Tick PointerManager for handling pinch-to-zoom
		this.#pointerManager.Tick(dt);
		
		// Tick ViewManager for handling smooth zoom.
		this.#viewManager.Tick(dt);
		
		// Tick the message handler, which will fire any network events
		// scheduled for this time.
		this.#messageHandler.Tick(simulationTime);
		
		// Tick units to update them to the current simulation time.
		// Only units that have requested ticking are iterated, which saves wasting CPU
		// time ticking units that aren't doing anything.
		for (const unit of this.#unitsToTick)
		{
			unit.Tick(dt, simulationTime);
		}
		
		// Advance all projectiles. These are moved by the client as their movement
		// is entirely predictable: they just proceed at the same speed and angle
		// from the point they were created.
		for (const [id, projectile] of this.#allProjectilesById)
		{
			projectile.Tick(dt);
			
			if (projectile.ShouldDestroy())
			{
				projectile.Release();
				this.#allProjectilesById.delete(id);
			}
		}
		
		// Redraw the minimap to reflect changes.
		this.#minimap.Update(this.GetGameTime());
		
		// Advance the game time by this tick's delta-time value.
		// Note the game time uses kahan summation to improve precision. Normal floating
		// point summation is not precise enough to keep an accurate clock time.
		this.#gameTime.Add(dt);
		
		// Tick PingManager which updates the estimated server time based on the time difference
		// to the game time, which was just incremented.
		this.#pingManager.Tick(dt);
	}
	
	// Get the client-side game time in seconds.
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
	
	// The server should send full updates for units every couple of seconds, ensuring the full
	// state of the game is synced regularly. However if a unit does not receive any update from
	// the server for several seconds, it may be that it was destroyed but the network event
	// indicating it should be destroyed was lost. To make sure the game state eventually updates
	// in this situation, all units are checked to see when they last had an update, and if it
	// has been too long, they are destroyed.
	#CheckForTimedOutUnits(dt, simulationTime)
	{
		// Checking every unit every tick would be performance intensive and defeat the optimisation
		// where units can opt-out of being ticked. Therefore units are checked incrementally over
		// 1 second, a bit like the way the server sends full updates incrementally. This will ensure
		// any timed out units are still removed relatively promptly, and avoids a major performance
		// overhead if there is a large number of units.
		if (this.#unitsToCheckTimeout.size === 0)
		{
			// When there are no more units to check if timed out, restart the process: copy all
			// units back in to the set of units to check for a timeout.
			for (const unit of this.allUnits())
				this.#unitsToCheckTimeout.add(unit);
			
			// Store the total number of units being checked, as it's used for the rate calculation.
			this.#timeoutCheckCount = this.#unitsToCheckTimeout.size;
		}
		
		// The number of units to check this tick is based on the total number multiplied by dt,
		// which means they will all be checked roughly every 1 second. The count is rounded up
		// to make sure it's always at least 1.
		let checkCount = Math.ceil(this.#timeoutCheckCount * dt);
		
		// Iterate through the units to check, but break when the check count is reached.
		for (const unit of this.#unitsToCheckTimeout)
		{
			// Remove this unit from the set as it is now being checked.
			this.#unitsToCheckTimeout.delete(unit);
			
			// If the unit has timed out, destroy it. Note this does not create an explosion
			// as in OnUnitDestroyedEvent(); this is just being done to try to update the client
			// when things have gotten out of sync, and we don't want to draw attention to it.
			if (unit.IsTimedOut(simulationTime))
				unit.Release();

			// Once reached the number of units to check, stop iterating.
			checkCount--;
			if (checkCount === 0)
				break;
		}
	}
	
	#ShowGameOverMessage(text)
	{
		// Create an instance of GameOverText to display the text.
		// Do this on the top UI layer and position it in the middle of the viewport.
		const uiLayer = this.#runtime.layout.getLayer("UI");
		const viewport = uiLayer.getViewport();
		const midX = (viewport.left + viewport.right) / 2;
		const midY = (viewport.top + viewport.bottom) / 2;
		const textInst = this.#runtime.objects.GameOverText.createInstance("UI", midX, midY);
		
		// Set the text to the given string, and return the text instance.
		textInst.text = text;
		
		return textInst;
	}
	
	// Called when GameServer sends a "game-over" message
	OnGameOver(didWin)
	{
		// Display the result on-screen
		this.#ShowGameOverMessage(didWin ? "Victory!" : "Defeat...");
		
		// Wait 5 seconds then go back to the title screen.
		self.setTimeout(() => this.#runtime.goToLayout("Title screen"), 5000);
	}
	
	OnDisconnected()
	{
		// Show a disconnected message in the same style as a game over message.
		this.#ShowGameOverMessage("Disconnected");
		
		// Wait 5 seconds then go back to the title screen.
		self.setTimeout(() => this.#runtime.goToLayout("Title screen"), 5000);
	}
}
