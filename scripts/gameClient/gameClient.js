
import { MultiEventHandler } from "../utils/multiEventHandler.js";
import { KahanSum } from "../utils/clientKahanSum.js";
import { ClientUnit } from "../clientUnits/clientUnit.js";
import { ClientProjectile } from "../clientUnits/clientProjectile.js";
import { GameClientMessageHandler } from "./net/messageHandler.js";
import { PingManager } from "./net/pingManager.js";
import { PointerManager } from "./ui/pointerManager.js";
import { ViewManager } from "./ui/viewManager.js";
import { SelectionManager } from "./ui/selectionManager.js";
import { Minimap } from "./ui/minimap.js";
import * as MathUtils from "../utils/clientMathUtils.js";

const MAGIC_NUMBER = 0x63266321;		// "c&c!" in ASCII

// The GameClient class is created while on a game layout, and handles representing the
// state of the game for the runtime. Note that the authoritative state of the game lives
// on GameServer, so the GameClient is mostly responsible for updating the state of the
// game to match the server state, and sending player inputs to the server.
export class GameClient {

	// Private fields
	#runtime;						// Construct runtime
	#sendMessageFunc;				// SendMessageToGameServer function
	#allUnitsById = new Map();		// map of all units by id -> ClientUnit
	#allProjectilesById = new Map();// map of all projectiles by id -> ClientProjectile
	
	#eventHandlers;					// MultiEventHandler for runtime events
	#gameTime = new KahanSum();		// serves as the clock for the game in seconds
	#lastTickTimeMs = 0;			// time at start of last tick in ms
	#messageHandler;				// MessageHandler class
	#pingManager;					// PingManager class
	#pointerManager;				// PointerManager class
	#viewManager;					// ViewManager class
	#selectionManager;				// SelectionManager class
	#minimap;						// Minimap class
	
	#player = 0;					// Player number this client controls
	
	constructor(runtime, sendMessageFunc, player)
	{
		this.#runtime = runtime;
		this.#sendMessageFunc = sendMessageFunc;
		this.#player = player;
		
		this.#eventHandlers = new MultiEventHandler([
			[runtime,		"tick",		() => this.#OnTick()]
		]);
		
		// Create GameClientMessageHandler which handles messages from GameServer
		// and calls the appropriate methods on this class. Also create the PingManager
		// which handles pings and also synchronizing the client clock.
		this.#messageHandler = new GameClientMessageHandler(this);
		this.#pingManager = new PingManager(this);
		
		// Create PointerManager which handles pointer inputs (mouse, touch and pen).
		this.#pointerManager = new PointerManager(this);
		
		// Create ViewManager which handles scrolling and zooming.
		this.#viewManager = new ViewManager(this);
		
		// Create SelectionManager which handles unit selections.
		this.#selectionManager = new SelectionManager(this);
		
		// Create Minimap class which handles the minimap
		this.#minimap = new Minimap(this);
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
	CreateInitialState(data)
	{
		// Set the layout size
		const [layoutWidth, layoutHeight] = data["layoutSize"];
		this.#viewManager.SetLayoutSize(layoutWidth, layoutHeight);
		
		for (const unitData of data["units"])
		{
			// Create a ClientUnit from each unit data.
			const clientUnit = ClientUnit.CreateFromInitialData(this, unitData);
			this.#allUnitsById.set(clientUnit.GetId(), clientUnit);
		}
		
		// Start up PingManager now that we know the GameServer is up and running
		// and ready to respond to pings
		this.#pingManager.Start();
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
			const [x, y] = unit.GetPlatform().GetPosition();
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
				const [x, y] = unit.GetPlatform().GetPosition();
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
	OnUnitDestroyed(lateness, unitId)
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
		
		// Remove unit from client and destroy it
		this.#allUnitsById.delete(unitId);
		unit.Release();
	}
	
	// Tick the client to advance the game state by one step.
	#OnTick()
	{
		this.#lastTickTimeMs = performance.now();
		const dt = this.#runtime.dt;
		
		// Tick PointerManager for handling pinch-to-zoom
		this.#pointerManager.Tick(dt);
		
		// Tick ViewManager for handling smooth zoom.
		this.#viewManager.Tick(dt);
		
		// Get the current simulation time as calculated by PingManager.
		// Then tick the message handler, which will fire any network events
		// scheduled for this time.
		const simulationTime = this.#pingManager.GetSimulationTime();
		this.#messageHandler.Tick(simulationTime);
		
		// Tick all units to update them to the current simulation time.
		// TODO: only tick units that need it.
		for (const unit of this.allUnits())
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
		this.#minimap.Update();
		
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
	
	// Called when GameServer sends a "game-over" message
	OnGameOver(didWin)
	{
		// Create an instance of GameOverText to display the result.
		// Do this on the top UI layer and position it in the middle of the viewport.
		const uiLayer = this.#runtime.layout.getLayer("UI");
		const viewport = uiLayer.getViewport();
		const midX = (viewport.left + viewport.right) / 2;
		const midY = (viewport.top + viewport.bottom) / 2;
		const textInst = this.#runtime.objects.GameOverText.createInstance("UI", midX, midY);
		
		// Set the text depending on if this player won.
		textInst.text = (didWin ? "Victory!" : "Defeat...");
		
		// Wait 5 seconds then go back to the title screen.
		self.setTimeout(() => this.#runtime.goToLayout("Title screen"), 5000);
	}
}
