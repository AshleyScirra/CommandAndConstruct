
import { MultiEventHandler } from "../utils/multiEventHandler.js";
import { ClientUnit } from "../clientUnits/clientUnit.js";
import { ClientProjectile } from "../clientUnits/clientProjectile.js";
import { GameClientMessageHandler } from "./messageHandler.js";
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
		
		// Create SelectionManager which handles unit selections.
		this.#selectionManager = new SelectionManager(this);
	}
	
	Release()
	{
		this.#eventHandlers.Release();
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
	MoveUnits(unitsArray, x, y)
	{
		// TODO: send a message to GameServer to handle the instruction.
		this.SendToServer({
			"type": "move-units",
			"unitIds": unitsArray.map(u => u.GetId()),
			"position": [x, y]
		});
	}
	
	// When a network event is received indicating a projectile was fired,
	// create a ClientProjectile to represent it.
	OnProjectileFired(id, x, y, angle, speed, range, distanceTravelled)
	{
		const projectile = new ClientProjectile(this, id, x, y, angle, speed, range, distanceTravelled);
		this.#allProjectilesById.set(id, projectile);
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
}
