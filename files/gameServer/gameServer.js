 
 import { Unit } from "./units/unit.js";
 
 // The GameServer class represents the state of the game and runs the main game logic.
 // It runs in a Web Worker and communicates with clients by messaging - either local messages
 // for the local player or remote players over the network.
 export class GameServer {
 
 	// Private fields
	#sendMessageFunc;			// called by SendToRuntime()
	#allUnits = new Set();		// set of all units in game
	
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
		this.#allUnits.add(new Unit(this, 200, 200));
		this.#allUnits.add(new Unit(this, 500, 200));
		this.#allUnits.add(new Unit(this, 200, 400));
		this.#allUnits.add(new Unit(this, 500, 400));
		this.#allUnits.add(new Unit(this, 200, 600));
		this.#allUnits.add(new Unit(this, 500, 600));
		
		this.SendToRuntime({
			"type": "create-initial-state",
			"units": [...this.#allUnits].map(u => u.GetInitData())
		});
	}
 }