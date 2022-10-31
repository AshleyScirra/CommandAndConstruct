
import { MultiEventHandler } from "../utils/multiEventHandler.js";
import { ClientUnit } from "../clientUnits/clientUnit.js";
import { ClientProjectile } from "../clientUnits/clientProjectile.js";
import { GameClientMessageHandler } from "./messageHandler.js";
import { PointerManager } from "./pointerManager.js";
import { SelectionManager } from "./selectionManager.js";

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
	#messageHandler;				// MessageHandler class
	#pointerManager;				// PointerManager class
	#selectionManager;				// SelectionManager class
	
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
		// and calls the appropriate methods on this class.
		this.#messageHandler = new GameClientMessageHandler(this);
		
		// Create PointerManager which handles pointer inputs (mouse, touch and pen).
		this.#pointerManager = new PointerManager(this);
		
		// Create SelectionManager which handles unit selections.
		this.#selectionManager = new SelectionManager(this);
	}
	
	Release()
	{
		this.#eventHandlers.Release();
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
	SendToServer(msg)
	{
		this.#sendMessageFunc(msg);
	}
	
	HandleGameServerMessage(msg)
	{
		this.#messageHandler.HandleGameServerMessage(msg);
	}
	
	// Called when GameServer sends the initial state of the game.
	// The client needs to create objects to represent the server state.
	CreateInitialState(data)
	{
		for (const unitData of data["units"])
		{
			// Create a ClientUnit from each unit data.
			const clientUnit = ClientUnit.CreateFromInitialData(this, unitData);
			this.#allUnitsById.set(clientUnit.GetId(), clientUnit);
		}
	}
	
	GetSelectionManager()
	{
		return this.#selectionManager;
	}
	
	// Iterates all units in the game.
	allUnits()
	{
		return this.#allUnitsById.values();
	}
	
	// Iterates all units that belong to the local player.
	*allLocalPlayerUnits()
	{
		for (const unit of this.allUnits())
		{
			if (unit.GetPlayer() === this.GetPlayer())
				yield unit;
		}
	}
	
	GetUnitById(id)
	{
		return this.#allUnitsById.get(id);
	}
	
	// Called when the player commands some selected units to move to a position.
	MoveUnits(unitsArray, targetX, targetY)
	{
		// Preserve unit formations when moving units. This is done by finding the average position
		// of all the units being moved, and each unit's offset from the average position is also
		// applied to the target position.
		let sumX = 0;
		let sumY = 0;
		for (const unit of unitsArray)
		{
			const [x, y] = unit.GetPlatform().GetPosition();
			sumX += x;
			sumY += y;
		}
		
		const midX = sumX / unitsArray.length;
		const midY = sumY / unitsArray.length;
		
		this.SendToServer({
			"type": "move-units",
			"units": unitsArray.map(unit =>
			{
				const [x, y] = unit.GetPlatform().GetPosition();
				return {
					"id": unit.GetId(),
					"x": targetX + (x - midX),
					"y": targetY + (y - midY)
				};
			})
		});
	}
	
	// When a network event is received indicating a projectile was fired,
	// create a ClientProjectile to represent it.
	OnProjectileFired(id, x, y, angle, speed, range, distanceTravelled)
	{
		const projectile = new ClientProjectile(this, id, x, y, angle, speed, range, distanceTravelled);
		this.#allProjectilesById.set(id, projectile);
	}
	
	// When a network event is received indicating a projectile hit a target,
	// destroy the projectile (if it can be found), and create an explosion at the reported location.
	OnProjectileHit(id, x, y)
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
		const explosionInst = this.#runtime.objects.Explosion.createInstance("Explosions", x, y);
		explosionInst.angle = Math.random() * 2 * Math.PI;
	}
	
	// When a network event is received indicating a unit was destroyed, remove its corresponding
	// unit and also create an explosion to represent its destruction.
	OnUnitDestroyed(unitId)
	{
		const unit = this.#allUnitsById.get(unitId);
		
		// If the client is not properly synchronised and a unit with this ID can't be found,
		// just ignore the message.
		if (!unit)
			return;
		
		// Create an explosion at the unit for visual feedback of its destruction, similar to
		// in OnProjectileHit (but also make it a bit bigger to cover the unit).
		const [x, y] = unit.GetPlatform().GetPosition();
		const explosionInst = this.#runtime.objects.Explosion.createInstance("Explosions", x, y);
		explosionInst.angle = Math.random() * 2 * Math.PI;
		explosionInst.width *= 1.4;
		explosionInst.height *= 1.4;
		
		// Remove unit from client and destroy it
		this.#allUnitsById.delete(unitId);
		unit.Release();
	}
	
	// Tick the client to advance the game state by one step.
	#OnTick()
	{
		const dt = this.#runtime.dt;
		
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
