 
 import { Unit } from "./units/unit.js";
 
 // The GameServer class represents the state of the game and runs the main game logic.
 // It runs in a Web Worker and communicates with clients by messaging - either local messages
 // for the local player or remote players over the network.
 export class GameServer {
 
 	// Private fields
	#sendMessageFunc;			// called by SendToRuntime()
	#allUnitsById = new Map();	// map of all units by id -> Unit
	
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
		// TODO
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
 }